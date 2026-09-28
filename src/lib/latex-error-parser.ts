/**
 * Parse LaTeX compilation log output to extract structured errors and warnings.
 */

export interface LatexDiagnostic {
  type: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  raw: string;
}

const FILE_REFERENCE_RE = /\((?:\.\/)?([^\s()]+?\.(?:tex|sty|cls|bib|bst|bbl|toc|aux|lof|lot))(?:\)|\s|$)/gi;

function extractFileReferences(line: string): string[] {
  return Array.from(line.matchAll(FILE_REFERENCE_RE), match => match[1]);
}

function findNearestFile(lines: string[], index: number): string | undefined {
  for (let i = index; i >= Math.max(0, index - 20); i--) {
    const refs = extractFileReferences(lines[i]);
    if (refs.length > 0) return refs[refs.length - 1];
  }
  return undefined;
}

function findFollowingSourceLine(lines: string[], index: number): number | undefined {
  for (let i = index + 1; i < Math.min(index + 8, lines.length); i++) {
    const lineMatch = lines[i].match(/^l\.(\d+)\b/);
    if (lineMatch) return parseInt(lineMatch[1], 10);
  }
  return undefined;
}

function parseLineReference(line: string): number | undefined {
  const match =
    line.match(/\b(?:on input line|at line|line|lines?)\s+(\d+)/i) ||
    line.match(/\bl\.(\d+)\b/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function parseQuotedKey(line: string): string | undefined {
  return line.match(/[`']([^`']+)'/)?.[1] || line.match(/"([^"]+)"/)?.[1];
}

/**
 * Parse LaTeX log output into structured diagnostics.
 */
export function parseLatexLog(log: string): LatexDiagnostic[] {
  const diagnostics: LatexDiagnostic[] = [];
  if (typeof log !== 'string') return diagnostics;
  const lines = log.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // LaTeX errors: lines starting with "!"
    if (line.startsWith('!')) {
      diagnostics.push({
        type: 'error',
        message: line.replace(/^!\s*/, '').trim(),
        file: findNearestFile(lines, i),
        line: findFollowingSourceLine(lines, i),
        raw: line,
      });
      continue;
    }

    // Badbox details with measurements. Handle these before generic warnings
    // to avoid double-counting the same Overfull/Underfull line.
    const badboxMatch = line.match(/^(Over|Under)full \\[hv]box\b/i);
    if (badboxMatch) {
      const ptMatch = line.match(/([\d.]+)pt/);
      diagnostics.push({
        type: 'warning',
        message: `${badboxMatch[1]}full box${ptMatch ? ` (${ptMatch[1]}pt)` : ''}`,
        file: findNearestFile(lines, i),
        line: parseLineReference(line),
        raw: line,
      });
      continue;
    }

    // Package/class errors
    if (line.match(/^Package .+ Error:/i) || line.match(/^Class .+ Error:/i)) {
      diagnostics.push({
        type: 'error',
        message: line.trim(),
        file: findNearestFile(lines, i),
        line: parseLineReference(line),
        raw: line,
      });
      continue;
    }

    // Reference/citation warnings
    if (/\bReference\b/i.test(line) && /\bundefined\b/i.test(line)) {
      const ref = parseQuotedKey(line);
      diagnostics.push({
        type: 'warning',
        message: ref ? `Undefined reference: ${ref}` : line.trim(),
        file: findNearestFile(lines, i),
        line: parseLineReference(line),
        raw: line,
      });
      continue;
    }

    if (/\bCitation\b/i.test(line) && (/\bundefined\b/i.test(line) || /\bnot found\b/i.test(line))) {
      const cite = parseQuotedKey(line);
      diagnostics.push({
        type: 'warning',
        message: cite ? `Undefined citation: ${cite}` : line.trim(),
        file: findNearestFile(lines, i),
        line: parseLineReference(line),
        raw: line,
      });
      continue;
    }

    if (line.includes('Empty bibliography')) {
      diagnostics.push({
        type: 'warning',
        message: 'Empty bibliography: no entries found',
        file: findNearestFile(lines, i),
        line: parseLineReference(line),
        raw: line,
      });
      continue;
    }

    // LaTeX warnings
    if (line.includes('Warning:') || line.includes('Overfull') || line.includes('Underfull')) {
      diagnostics.push({
        type: 'warning',
        message: line.trim(),
        file: findNearestFile(lines, i),
        line: parseLineReference(line),
        raw: line,
      });
      continue;
    }

    // Runaway argument / paragraph ended
    if (line.startsWith('Runaway argument?') || line.includes('Paragraph ended before')) {
      diagnostics.push({
        type: 'error',
        message: line.trim(),
        file: findNearestFile(lines, i),
        line: parseLineReference(line),
        raw: line,
      });
      continue;
    }

    // Missing number / illegal unit
    if (line.includes('Missing number') || line.includes('Illegal unit')) {
      diagnostics.push({
        type: 'error',
        message: line.trim(),
        file: findNearestFile(lines, i),
        line: parseLineReference(line),
        raw: line,
      });
    }
  }

  return diagnostics;
}

/**
 * Get a summary of diagnostics for display.
 */
export function diagnosticSummary(diagnostics: LatexDiagnostic[]): {
  errors: number;
  warnings: number;
} {
  return {
    errors: diagnostics.filter(d => d.type === 'error').length,
    warnings: diagnostics.filter(d => d.type === 'warning').length,
  };
}
