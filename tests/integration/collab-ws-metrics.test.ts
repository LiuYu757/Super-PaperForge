import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('websocket metrics endpoint (static wiring)', () => {
  const index = readFileSync(join(process.cwd(), 'websocket/src/index.ts'), 'utf-8');

  it('serves a /metrics route backed by getCollabMetrics', () => {
    expect(index).toContain("req.url === '/metrics'");
    expect(index).toContain('getCollabMetrics');
  });

  it('exposes only aggregate counts, never per-project ids', () => {
    // The /metrics body must not leak perDocument (which carries project ids).
    const metricsBlock = index.slice(
      index.indexOf("req.url === '/metrics'"),
      index.indexOf("req.url === '/metrics'") + 600,
    );
    expect(metricsBlock).toContain('documents');
    expect(metricsBlock).toContain('connections');
    expect(metricsBlock).toContain('totalUsers');
    expect(metricsBlock).not.toContain('perDocument');
  });
});
