import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Worker invariants asserted structurally because we can't spin up a real
 * BullMQ worker + Postgres + MinIO in the unit test harness. These guard
 * the recent hardening pass against silent regressions in a refactor.
 */
const worker = readFileSync(
  join(process.cwd(), 'worker/src/index.ts'),
  'utf-8',
);
const materializer = readFileSync(join(process.cwd(), 'worker/src/materialize-files.ts'), 'utf-8');

describe('worker hardening invariants', () => {
  it('tracks in-flight compilations so shutdown can flush them', () => {
    expect(worker).toContain('inFlight');
    expect(worker).toMatch(/inFlight\.add\(compilationId\)/);
    expect(worker).toMatch(/inFlight\.delete\(compilationId\)/);
  });

  it('graceful shutdown stops in-flight attempt containers', () => {
    expect(worker).toMatch(/for\s*\(\s*const\s+compilationId\s+of\s+inFlight\s*\)/);
    expect(worker).toContain('await cancelCompile(row.attemptId)');
    expect(worker).toContain('leaseExpiresAt');
  });

  it('marks compilation row failed only on the final attempt', () => {
    // Gating on attemptsMade >= attempts prevents transient retries from
    // showing the user a red status that will turn green on the next try.
    expect(worker).toContain('exhausted');
    expect(worker).toMatch(/job\.attemptsMade\s*>=/);
  });

  it('downloads canonicalize paths via realpath to defeat symlink escapes', () => {
    expect(worker).toContain('materializeFiles');
    expect(materializer).toContain('fs.realpathSync');
    expect(materializer).toContain('fs.promises.realpath');
    expect(materializer).toContain('symlink');
  });

  it('rejects absolute / Windows / NUL-byte paths before writing', () => {
    expect(materializer).toContain("startsWith('/')");
    expect(materializer).toMatch(/\^\[A-Za-z\]:/);
    expect(materializer).toContain('\\x00');
  });
});
