import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { sha256Text } from '@/services/file-service';

/**
 * F03 — the file PUT route must not be usable as an accidental delete.
 *
 * At the review baseline the handler did:
 *     const content = typeof body.content === 'string' ? body.content : '';
 * so any automated client that sent a malformed body silently truncated the
 * file. It also had no version precondition, so a stale writer could overwrite
 * a newer edit without noticing.
 *
 * The route is a Next.js handler needing a session, a database and a project,
 * none of which exist in this unit environment. These cases therefore assert
 * the validation contract at the source level plus the hashing behaviour that
 * the precondition depends on. End-to-end coverage of the HTTP status codes
 * belongs in the integration suite once a test database is available (B03).
 */

const ROUTE = 'src/app/api/v1/projects/[id]/files/[...path]/route.ts';

describe('file PUT payload validation (F03)', () => {
  const source = readFileSync(ROUTE, 'utf-8');

  it('no longer coerces a non-string content into an empty string', () => {
    // The exact defect from the baseline must be gone.
    expect(source).not.toContain("typeof body.content === 'string' ? body.content : ''");
  });

  it('rejects a body that omits content instead of emptying the file', () => {
    expect(source).toContain("!('content' in payload)");
    expect(source).toContain('MISSING_CONTENT');
  });

  it('rejects a non-string content with a 400', () => {
    expect(source).toContain("typeof payload.content !== 'string'");
    expect(source).toContain('INVALID_CONTENT_TYPE');
  });

  it('rejects a non-object or array body', () => {
    expect(source).toContain('Array.isArray(body)');
    expect(source).toContain('INVALID_BODY');
  });

  it('requires a version precondition and answers 428 when absent', () => {
    expect(source).toContain('PRECONDITION_REQUIRED');
    expect(source).toMatch(/428/);
  });

  it('answers 412 when the precondition is stale', () => {
    // The conditional check moved into the unified mutation core (PR-1): the
    // route delegates the write, so the 412/PRECONDITION_FAILED contract now
    // lives with the service that runs the check and the write in one
    // transaction. Assert both halves of the delegation.
    expect(source).toContain('applyDocumentMutations');
    const service = readFileSync(
      'src/services/document-mutation-service.ts',
      'utf-8',
    );
    expect(service).toContain('PRECONDITION_FAILED');
    expect(service).toMatch(/412/);
    expect(service).toContain('File has changed since it was read');
  });

  it('returns the current hash on GET so a conditional write can round-trip', () => {
    expect(source).toContain('sha256: sha256Text(content)');
  });

  it('still allows an explicit empty string to clear a file', () => {
    // Emptying a file must remain possible — but only deliberately.
    expect(source).toContain('To empty a file, send an explicit empty string');
  });
});

describe('sha256Text version token', () => {
  it('matches a plain SHA-256 over the UTF-8 bytes', () => {
    const text = 'We propose a method.\n';
    const expected = createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex');
    expect(sha256Text(text)).toBe(expected);
  });

  it('distinguishes CRLF from LF rather than normalising them', () => {
    // Silently normalising line endings would let a "matching" precondition
    // overwrite bytes the caller never read.
    expect(sha256Text('a\r\nb')).not.toBe(sha256Text('a\nb'));
  });

  it('handles non-ASCII content without re-encoding', () => {
    const cjk = '我们提出一种方法。';
    const expected = createHash('sha256').update(Buffer.from(cjk, 'utf-8')).digest('hex');
    expect(sha256Text(cjk)).toBe(expected);
  });

  it('gives an empty string a stable, non-empty hash', () => {
    // A present-but-empty file still has a hash; "absent" is signalled by null
    // from getFileSha256IfExists, never by the empty-string hash.
    expect(sha256Text('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('is sensitive to a single-character change', () => {
    expect(sha256Text('We propose a method.')).not.toBe(
      sha256Text('We propose a framework.'),
    );
  });
});
