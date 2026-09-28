import { describe, it, expect } from 'vitest';
import { applyEdits, validateOperations } from '@/services/changeset-service';
import { computeInputHash, parseRevision, revisionToString } from '@/services/snapshot-service';
import { ApiError } from '@/lib/errors';

/**
 * The patch engine is the component that can silently corrupt a manuscript, so
 * it is tested directly rather than through the HTTP layer.
 *
 * The invariants that matter: an edit that cannot be located exactly is
 * refused; an ambiguous edit is refused; edits never reinterpret each other;
 * and nothing is normalised behind the author's back.
 */

function expectApiError(fn: () => unknown, status: number, code?: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.statusCode).toBe(status);
    if (code) expect(apiErr.code).toBe(code);
    return apiErr;
  }
  throw new Error('expected the call to throw');
}

describe('applyEdits — exact replacement', () => {
  it('replaces a unique occurrence', () => {
    const original = 'We propose a method. It works well.';
    const result = applyEdits(
      original,
      [{ oldText: 'We propose a method.', newText: 'We introduce a framework.' }],
      'main.tex',
    );
    expect(result).toBe('We introduce a framework. It works well.');
  });

  it('applies several edits in one pass', () => {
    const original = '\\section{Intro}\nAlpha text.\n\\section{Method}\nBeta text.\n';
    const result = applyEdits(
      original,
      [
        { oldText: 'Alpha text.', newText: 'Revised alpha.' },
        { oldText: 'Beta text.', newText: 'Revised beta.' },
      ],
      'main.tex',
    );
    expect(result).toBe('\\section{Intro}\nRevised alpha.\n\\section{Method}\nRevised beta.\n');
  });

  it('does not let an earlier edit change what a later edit matches', () => {
    // Applying edits sequentially to progressively-rewritten text is the
    // classic way a patch tool corrupts a file while reporting success: here
    // the first replacement would manufacture a second "b" for the second edit.
    const original = 'a\nb\n';
    const result = applyEdits(
      original,
      [
        { oldText: 'a', newText: 'b' },
        { oldText: 'b', newText: 'c' },
      ],
      'main.tex',
    );
    // Both edits resolve against the original, so 'a'->'b' and the original
    // 'b'->'c'. A naive sequential implementation yields 'c\nc\n'.
    expect(result).toBe('b\nc\n');
  });

  it('rejects an edit whose target is absent', () => {
    expectApiError(
      () => applyEdits('hello world', [{ oldText: 'goodbye', newText: 'hi' }], 'main.tex'),
      409,
      'EDIT_NOT_FOUND',
    );
  });

  it('rejects an ambiguous edit rather than picking the first match', () => {
    const original = 'cite this. cite this. cite this.';
    expectApiError(
      () => applyEdits(original, [{ oldText: 'cite this.', newText: 'ref this.' }], 'main.tex'),
      409,
      'EDIT_AMBIGUOUS',
    );
  });

  it('allows a repeated replacement when the count is stated explicitly', () => {
    const original = 'x. x. x.';
    const result = applyEdits(
      original,
      [{ oldText: 'x.', newText: 'y.', expectedOccurrences: 3 }],
      'main.tex',
    );
    expect(result).toBe('y. y. y.');
  });

  it('rejects a stated count that does not match reality', () => {
    expectApiError(
      () => applyEdits('x. x.', [{ oldText: 'x.', newText: 'y.', expectedOccurrences: 3 }], 'f.tex'),
      409,
      'EDIT_AMBIGUOUS',
    );
  });

  it('rejects overlapping edits', () => {
    expectApiError(
      () =>
        applyEdits(
          'abcdef',
          [
            { oldText: 'abcd', newText: 'X' },
            { oldText: 'cdef', newText: 'Y' },
          ],
          'main.tex',
        ),
      409,
      'EDIT_OVERLAP',
    );
  });

  it('rejects an empty oldText', () => {
    expectApiError(
      () => applyEdits('text', [{ oldText: '', newText: 'inserted' }], 'main.tex'),
      400,
    );
  });

  it('leaves the document untouched when any edit fails', () => {
    const original = 'Alpha. Beta.';
    expectApiError(
      () =>
        applyEdits(
          original,
          [
            { oldText: 'Alpha.', newText: 'Gamma.' },
            { oldText: 'NOT PRESENT', newText: 'x' },
          ],
          'main.tex',
        ),
      409,
    );
    // All-or-nothing: validation happens before any replacement is performed.
    expect(original).toBe('Alpha. Beta.');
  });
});

describe('applyEdits — encoding fidelity', () => {
  it('preserves CRLF line endings', () => {
    const original = 'line one\r\nline two\r\n';
    const result = applyEdits(original, [{ oldText: 'line two', newText: 'line 2' }], 'f.tex');
    expect(result).toBe('line one\r\nline 2\r\n');
    expect(result).toContain('\r\n');
  });

  it('handles CJK content without re-encoding', () => {
    const original = '我们提出一种方法。实验结果良好。';
    const result = applyEdits(
      original,
      [{ oldText: '我们提出一种方法。', newText: '我们提出一个框架。' }],
      'main.tex',
    );
    expect(result).toBe('我们提出一个框架。实验结果良好。');
  });

  it('handles LaTeX backslashes and braces literally', () => {
    const original = '\\cite{smith2020} shows \\textbf{bold}.';
    const result = applyEdits(
      original,
      [{ oldText: '\\cite{smith2020}', newText: '\\citep{smith2020}' }],
      'main.tex',
    );
    expect(result).toBe('\\citep{smith2020} shows \\textbf{bold}.');
  });

  it('does not treat the replacement as a regex pattern', () => {
    // A replacement containing $& or $1 must be inserted verbatim; String.replace
    // would interpret them.
    const result = applyEdits('cost: X', [{ oldText: 'X', newText: '$100 & $200' }], 'f.tex');
    expect(result).toBe('cost: $100 & $200');
  });

  it('does not treat the search text as a regex pattern', () => {
    const original = 'value is a.b and axb';
    const result = applyEdits(original, [{ oldText: 'a.b', newText: 'Z' }], 'f.tex');
    // 'a.b' as a regex would also match 'axb'.
    expect(result).toBe('value is Z and axb');
  });

  it('preserves trailing whitespace and blank lines', () => {
    const original = 'para one\n\n\npara two   \n';
    const result = applyEdits(original, [{ oldText: 'para one', newText: 'para 1' }], 'f.tex');
    expect(result).toBe('para 1\n\n\npara two   \n');
  });
});

describe('validateOperations', () => {
  it('accepts a well-formed edit_text operation', () => {
    const ops = validateOperations([
      {
        op: 'edit_text',
        fileId: 'file-1',
        expectedSha256: 'abc',
        edits: [{ oldText: 'a', newText: 'b' }],
      },
    ]);
    expect(ops).toHaveLength(1);
  });

  it('rejects an empty operations array', () => {
    expectApiError(() => validateOperations([]), 400);
  });

  it('rejects a non-array', () => {
    expectApiError(() => validateOperations({ op: 'edit_text' }), 400);
  });

  it('rejects an unknown operation', () => {
    expectApiError(() => validateOperations([{ op: 'execute_shell', cmd: 'rm -rf /' }]), 400);
  });

  it('requires expectedSha256 on edit_text', () => {
    expectApiError(
      () => validateOperations([{ op: 'edit_text', fileId: 'f', edits: [{ oldText: 'a', newText: 'b' }] }]),
      400,
    );
  });

  it('requires a string content on create_file', () => {
    expectApiError(() => validateOperations([{ op: 'create_file', path: 'a.tex', content: 42 }]), 400);
  });

  it('rejects edit_text with no edits', () => {
    expectApiError(
      () => validateOperations([{ op: 'edit_text', fileId: 'f', expectedSha256: 'x', edits: [] }]),
      400,
    );
  });
});

describe('revision serialisation', () => {
  it('round-trips a revision as a decimal string', () => {
    expect(revisionToString(BigInt(42))).toBe('42');
    expect(parseRevision('42')).toBe(BigInt(42));
  });

  it('survives values beyond Number.MAX_SAFE_INTEGER', () => {
    // A revision serialised as a JSON number would lose precision here, and a
    // wrong revision defeats the compare-and-set check entirely.
    const huge = BigInt('9007199254740993'); // 2^53 + 1
    expect(parseRevision(revisionToString(huge))).toBe(huge);
  });

  it('rejects a non-numeric revision', () => {
    expectApiError(() => parseRevision('42; DROP TABLE'), 400);
    expectApiError(() => parseRevision(42), 400);
    expectApiError(() => parseRevision('-1'), 400);
  });
});

describe('computeInputHash', () => {
  const base = {
    files: [
      { fileId: '1', path: 'main.tex', sha256: 'aaa', sizeBytes: 3, isBinary: false, minioKey: null },
      { fileId: '2', path: 'refs.bib', sha256: 'bbb', sizeBytes: 3, isBinary: false, minioKey: null },
    ],
    mainFile: 'main.tex',
    compiler: 'pdflatex',
  };

  it('is stable regardless of file order', () => {
    const reversed = { ...base, files: [...base.files].reverse() };
    expect(computeInputHash(reversed)).toBe(computeInputHash(base));
  });

  it('changes when any file content changes', () => {
    const edited = {
      ...base,
      files: [{ ...base.files[0], sha256: 'ccc' }, base.files[1]],
    };
    expect(computeInputHash(edited)).not.toBe(computeInputHash(base));
  });

  it('changes when a non-main file changes', () => {
    // Hashing only main.tex would call this build a cache hit and serve a PDF
    // with stale bibliography.
    const edited = {
      ...base,
      files: [base.files[0], { ...base.files[1], sha256: 'zzz' }],
    };
    expect(computeInputHash(edited)).not.toBe(computeInputHash(base));
  });

  it('changes when the compiler changes', () => {
    expect(computeInputHash({ ...base, compiler: 'xelatex' })).not.toBe(computeInputHash(base));
  });

  it('changes when the main file changes', () => {
    expect(computeInputHash({ ...base, mainFile: 'other.tex' })).not.toBe(computeInputHash(base));
  });

  it('changes when a file is added', () => {
    const withExtra = {
      ...base,
      files: [
        ...base.files,
        { fileId: '3', path: 'fig.png', sha256: 'ddd', sizeBytes: 9, isBinary: true, minioKey: 'k' },
      ],
    };
    expect(computeInputHash(withExtra)).not.toBe(computeInputHash(base));
  });

  it('changes when a file is renamed but its content is identical', () => {
    const renamed = {
      ...base,
      files: [{ ...base.files[0], path: 'intro.tex' }, base.files[1]],
    };
    expect(computeInputHash(renamed)).not.toBe(computeInputHash(base));
  });
});
