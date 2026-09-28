import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '@/lib/encryption';

describe('encryption', () => {
  it('should encrypt and decrypt a string roundtrip', () => {
    const plaintext = 'Hello, PaperForge!';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext each time (random IV)', () => {
    const plaintext = 'same input every time';
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should throw on tampered ciphertext', () => {
    const plaintext = 'sensitive data';
    const encrypted = encrypt(plaintext);
    const parts = encrypted.split(':');
    // Tamper with the ciphertext portion
    const tampered = parts[0] + ':' + 'ff'.repeat(parts[1].length / 2) + ':' + parts[2];
    expect(() => decrypt(tampered)).toThrow();
  });
});
