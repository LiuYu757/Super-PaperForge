import { inflateRawSync } from 'zlib';

export interface ZipTextEntry {
  path: string;
  content: string;
}

export const ZIP_IMPORT_LIMITS = {
  MAX_ARCHIVE_BYTES: 50 * 1024 * 1024,
  MAX_FILE_BYTES: 5 * 1024 * 1024,
  MAX_TOTAL_TEXT_BYTES: 25 * 1024 * 1024,
  MAX_ENTRIES: 1000,
} as const;

function isLikelyText(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

export function parseZipTextEntries(buffer: Buffer): ZipTextEntry[] {
  const entries: ZipTextEntry[] = [];
  if (buffer.length > ZIP_IMPORT_LIMITS.MAX_ARCHIVE_BYTES) return entries;

  let eocdOffset = -1;
  const minEocdOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= minEocdOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1 || eocdOffset + 22 > buffer.length) return entries;

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = cdOffset;
  let totalTextBytes = 0;

  for (let i = 0; i < cdEntries && entries.length < ZIP_IMPORT_LIMITS.MAX_ENTRIES; i++) {
    if (offset + 46 > buffer.length) break;
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const nextOffset = nameEnd + extraLength + commentLength;

    if (nameEnd > buffer.length || nextOffset > buffer.length) break;
    const entryPath = buffer.toString('utf-8', nameStart, nameEnd);
    offset = nextOffset;

    if (entryPath.endsWith('/') || uncompressedSize === 0) continue;
    if (uncompressedSize > ZIP_IMPORT_LIMITS.MAX_FILE_BYTES) continue;
    if (totalTextBytes + uncompressedSize > ZIP_IMPORT_LIMITS.MAX_TOTAL_TEXT_BYTES) break;
    if (compression !== 0 && compression !== 8) continue;
    if (localHeaderOffset + 30 > buffer.length) continue;
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;

    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) continue;

    try {
      const raw = buffer.subarray(dataStart, dataEnd);
      const contentBuffer = compression === 8 ? inflateRawSync(raw) : Buffer.from(raw);
      if (contentBuffer.length > ZIP_IMPORT_LIMITS.MAX_FILE_BYTES) continue;
      if (!isLikelyText(contentBuffer)) continue;

      entries.push({ path: entryPath, content: contentBuffer.toString('utf-8') });
      totalTextBytes += contentBuffer.length;
    } catch {
      // Skip corrupted or unsupported entries.
    }
  }

  return entries;
}
