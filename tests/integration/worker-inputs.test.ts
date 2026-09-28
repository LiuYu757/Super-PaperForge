import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { materializeFiles } from '../../worker/src/materialize-files';

const dirs: string[] = [];
function workDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperforge-worker-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('local worker input authority', () => {
  it('compiles PostgreSQL text even when the old MinIO text key is readable', async () => {
    const dir = workDir();
    const download = vi.fn(async () => { throw new Error('old object must not be read'); });
    await materializeFiles([{ path: 'main.tex', content: 'new manuscript',
      minioKey: 'old-text-object', isBinary: false }], dir, download);
    expect(fs.readFileSync(path.join(dir, 'main.tex'), 'utf8')).toBe('new manuscript');
    expect(download).not.toHaveBeenCalled();
  });

  it('accepts empty text and rejects missing legacy text without a partial compile', async () => {
    const dir = workDir();
    await materializeFiles([{ path: 'empty.tex', content: '', isBinary: false }], dir,
      async () => { throw new Error('unexpected object read'); });
    expect(fs.readFileSync(path.join(dir, 'empty.tex'), 'utf8')).toBe('');
    await expect(materializeFiles([{ path: 'missing.tex', content: null,
      minioKey: 'legacy-key', isBinary: false }], dir, async () => {}))
      .rejects.toThrow(/migrate the legacy file/);
    expect(fs.existsSync(path.join(dir, 'missing.tex'))).toBe(false);
  });

  it('reads binary from its object and fails when bytes are unavailable', async () => {
    const dir = workDir();
    await materializeFiles([{ path: 'figures/a.png', isBinary: true,
      minioKey: 'immutable-binary-key' }], dir,
    async (_key, destination) => { fs.writeFileSync(destination, Buffer.from([0, 255])); });
    expect(fs.readFileSync(path.join(dir, 'figures/a.png'))).toEqual(Buffer.from([0, 255]));
    await expect(materializeFiles([{ path: 'missing.png', isBinary: true }], dir,
      async () => {})).rejects.toThrow(/Binary content is unavailable/);
  });

  it('rejects a frozen binary object whose bytes changed after snapshotting', async () => {
    const dir = workDir();
    const original = Buffer.from([0, 1, 2]);
    const hash = createHash('sha256').update(original).digest('hex');
    await expect(materializeFiles([{ path: 'figure.png', isBinary: true,
      minioKey: 'immutable-key', sha256: hash }], dir,
    async (_key, destination) => { fs.writeFileSync(destination, Buffer.from([0, 1, 3])); }))
      .rejects.toThrow(/integrity check/);
  });
});
