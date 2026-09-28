import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let mode = 'html';
const server = http.createServer((_request, response) => {
  if (mode === 'timeout') return;
  if (mode === 'html') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<html>not a PDF</html>');
  } else if (mode === 'oversize') {
    response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': 51 * 1024 * 1024 });
    response.end();
  } else if (mode === 'broken') {
    response.writeHead(200, { 'Content-Type': 'application/pdf' });
    response.write('%PDF-1.7\n');
    response.socket?.destroy();
  } else {
    response.writeHead(200, { 'Content-Type': 'application/pdf' });
    response.end('%PDF-1.7\nvalid test bytes');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const directory = await mkdtemp(path.join(os.tmpdir(), 'paperforge-cli-test-'));

async function invoke(command, file) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/paperforge-cli.mjs', command, 'project', 'compilation', file], {
      env: { ...process.env, PAPERFORGE_URL: `http://127.0.0.1:${port}`,
        PAPERFORGE_TOKEN: 'synthetic-pat', PAPERFORGE_TIMEOUT_MS: '1000' },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stderr }));
  });
}

try {
  for (const scenario of ['html', 'oversize', 'broken', 'timeout']) {
    mode = scenario;
    const file = path.join(directory, `${scenario}.pdf`);
    const result = await invoke(scenario === 'timeout' ? 'status' : 'pdf', file);
    assert.notEqual(result.code, 0, scenario);
    assert.equal(result.stderr.includes('synthetic-pat'), false);
    await assert.rejects(stat(file));
  }
  mode = 'valid';
  const file = path.join(directory, 'valid.pdf');
  assert.equal((await invoke('pdf', file)).code, 0);
  assert.ok((await stat(file)).size > 5);
  process.stdout.write('CLI network scenarios passed: HTML, oversize,断流, timeout, valid PDF\n');
} finally {
  server.closeAllConnections();
  server.close();
  await rm(directory, { recursive: true, force: true });
}
