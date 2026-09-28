import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticateFromCookie, hasSecret } from './auth';
import { getProjectRole } from './authorization';
import { handleConnection, getCollabMetrics, getRejectedWriteCount } from './yjs-server';
import { env } from './env';

const PORT = env.WS_PORT;
const MAX_CONNECTIONS_PER_USER = 20;
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB
const PING_INTERVAL = 30_000; // 30s
// 30 minutes of total silence terminates the socket. Keep-alive pings reset
// the watchdog every PING_INTERVAL, so a healthy idle tab survives.
const IDLE_TIMEOUT_MS = env.WS_IDLE_TIMEOUT_MS;

// Track connections per user for rate limiting
const userConnectionCount = new Map<string, number>();

const startedAt = Date.now();

const server = http.createServer((req, res) => {
  // Healthz: exposes auth-secret presence + connection counters so an
  // orchestrator can tell a wedged process from a healthy idle one.
  if (req.url === '/healthz') {
    const body = {
      status: hasSecret() ? 'ok' : 'degraded',
      service: 'paperforge-ws',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      connections: { totalUsers: userConnectionCount.size },
      hasAuthSecret: hasSecret(),
      syncMode: env.EDITOR_SYNC_MODE,
      rejectedYjsWrites: getRejectedWriteCount(),
    };
    res.writeHead(hasSecret() ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }
  // Metrics: aggregate collaboration counts for the admin health panel. Exposes
  // only counts (live documents, attached clients, distinct users) — never
  // per-project ids — so it is safe to serve without auth, like /healthz.
  if (req.url === '/metrics') {
    const collab = getCollabMetrics();
    const body = {
      service: 'paperforge-ws',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      documents: collab.documents,
      connections: collab.connections,
      totalUsers: userConnectionCount.size,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'paperforge-ws' }));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_SIZE });

wss.on('error', (err) => {
  console.error('[WS] Server error:', err);
});

server.on('upgrade', async (req, socket, head) => {
  try {
    // Parse projectId from URL: /ws/:projectId
    const url = req.url || '';
    const match = url.match(/^\/ws\/([^/?]+)/);
    if (!match) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const projectId = decodeURIComponent(match[1]);

    // Validate projectId format (UUID)
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Authenticate from httpOnly cookie
    const user = authenticateFromCookie(req);
    if (!user || !user.id) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Per-user connection limit
    const currentCount = userConnectionCount.get(user.id) ?? 0;
    if (currentCount >= MAX_CONNECTIONS_PER_USER) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    // Check project membership
    const role = await getProjectRole(projectId, user.id);
    if (!role) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const isReadOnly = role === 'viewer';

    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      // Track connection
      userConnectionCount.set(user.id, (userConnectionCount.get(user.id) ?? 0) + 1);
      (ws as WebSocket & { _userId?: string })._userId = user.id;

      wss.emit('connection', ws, req, projectId, isReadOnly);
    });
  } catch (err) {
    console.error('[WS] Upgrade error:', err);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

wss.on('connection', (ws: WebSocket, _req: http.IncomingMessage, projectId: string, isReadOnly: boolean) => {
  handleConnection(ws, projectId, isReadOnly);

  // Idle watchdog — closes connections that go fully silent (no msgs, no
  // pongs) for IDLE_TIMEOUT_MS. Resets on any incoming traffic.
  let idleTimer = setTimeout(() => ws.close(1001, 'Idle timeout'), IDLE_TIMEOUT_MS);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ws.close(1001, 'Idle timeout'), IDLE_TIMEOUT_MS);
  };
  ws.on('message', resetIdle);
  ws.on('pong', resetIdle);

  ws.on('close', () => {
    clearTimeout(idleTimer);
    const userId = (ws as WebSocket & { _userId?: string })._userId;
    if (userId) {
      const count = (userConnectionCount.get(userId) ?? 1) - 1;
      if (count <= 0) userConnectionCount.delete(userId);
      else userConnectionCount.set(userId, count);
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
  });
});

// Ping/pong keepalive to detect dead connections
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if ((ws as WebSocket & { isAlive?: boolean }).isAlive === false) {
      ws.terminate();
      return;
    }
    (ws as WebSocket & { isAlive?: boolean }).isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);

wss.on('connection', (ws) => {
  (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
  ws.on('pong', () => { (ws as WebSocket & { isAlive?: boolean }).isAlive = true; });
});

server.listen(PORT, () => {
  console.log(`[WS] PaperForge WebSocket server listening on port ${PORT}`);
});

// Graceful shutdown
function shutdown() {
  console.log('[WS] Shutting down gracefully...');
  clearInterval(pingInterval);
  wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
  wss.close(() => {
    server.close(() => {
      console.log('[WS] Server closed');
      process.exit(0);
    });
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
