import { describe, it, expect } from 'vitest';

// Inline CRC32 from export route for testing
function crc32(data: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

describe('crc32', () => {
  it('computes correct CRC32 for empty buffer', () => {
    expect(crc32(new Uint8Array([]))).toBe(0x00000000);
  });

  it('computes correct CRC32 for "hello"', () => {
    const data = new TextEncoder().encode('hello');
    // Known CRC32 of "hello" = 0x3610a686
    expect(crc32(data)).toBe(0x3610a686);
  });

  it('computes correct CRC32 for single byte', () => {
    const data = new Uint8Array([0x00]);
    expect(crc32(data)).toBe(0xd202ef8d);
  });

  it('returns consistent results for same input', () => {
    const data = new TextEncoder().encode('PaperForge LaTeX Editor');
    const result1 = crc32(data);
    const result2 = crc32(data);
    expect(result1).toBe(result2);
  });

  it('returns different results for different inputs', () => {
    const data1 = new TextEncoder().encode('hello');
    const data2 = new TextEncoder().encode('world');
    expect(crc32(data1)).not.toBe(crc32(data2));
  });
});
