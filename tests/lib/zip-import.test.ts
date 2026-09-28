import { deflateRawSync } from 'zlib';
import { describe, expect, it } from 'vitest';
import { parseZipTextEntries } from '@/lib/zip-import';

function makeZip(entries: Array<{ path: string; content: Buffer | string; deflate?: boolean }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path);
    const data = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    const compressed = entry.deflate ? deflateRawSync(data) : data;
    const method = entry.deflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, compressed);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

describe('ZIP import parser', () => {
  it('extracts stored and deflated text files', () => {
    const zip = makeZip([
      { path: 'paper-main/main.tex', content: '\\documentclass{article}', deflate: true },
      { path: 'paper-main/README.md', content: '# Paper', deflate: false },
    ]);

    expect(parseZipTextEntries(zip)).toEqual([
      { path: 'paper-main/main.tex', content: '\\documentclass{article}' },
      { path: 'paper-main/README.md', content: '# Paper' },
    ]);
  });

  it('skips binary-looking files', () => {
    const zip = makeZip([
      { path: 'paper-main/image.bin', content: Buffer.from([0, 1, 2, 3]), deflate: true },
    ]);

    expect(parseZipTextEntries(zip)).toEqual([]);
  });
});
