import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  collectCallExpressions,
  collectRouteFiles,
  collectRouteSourceFiles,
  callTargetsIdentifier,
  hasAnyCall,
  routeSourceFile,
} from '../utils/route-analysis';

function withTempDir<T>(run: (root: string) => T): T {
  const root = mkdtempSync(path.join(tmpdir(), 'route-analysis-'));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('route-analysis utility', () => {
  it('collects route files in stable traversal order', () => {
    let tempRoot = '';

    const files = withTempDir((root) => {
      tempRoot = root;
      mkdirSync(path.join(root, 'zz-second'));
      mkdirSync(path.join(root, 'aa-first'));
      writeFileSync(path.join(root, 'zz-second', 'route.ts'), 'export function GET() {}');
      writeFileSync(path.join(root, 'aa-first', 'route.ts'), 'export function POST() {}');
      writeFileSync(path.join(root, 'ignore.txt'), 'ignore');

      return collectRouteFiles(root);
    });

    expect(files).toEqual([
      path.join(tempRoot, 'aa-first', 'route.ts'),
      path.join(tempRoot, 'zz-second', 'route.ts'),
    ]);
  });

  it('collects source files with deterministic snapshots', () => {
    const snapshots = withTempDir((root) => {
      mkdirSync(path.join(root, 'api'));
      writeFileSync(path.join(root, 'api', 'route.ts'), 'export const api = 1;');

      return {
        first: collectRouteSourceFiles(root),
        second: collectRouteSourceFiles(root),
      };
    });

    expect(snapshots.first.map((entry) => entry.filePath)).toEqual(
      snapshots.second.map((entry) => entry.filePath),
    );
    expect(snapshots.first).toHaveLength(1);
    expect(snapshots.second).toHaveLength(1);
  });

  it('matches calls for identifiers and member expressions', () => {
    const sourceFile = withTempDir((root) => {
      const routeFile = path.join(root, 'route.ts');
      writeFileSync(
        routeFile,
        [
          "import { foo } from 'x';",
          'const x = foo();',
          'tx.auditLog.create();',
          '',
        ].join('\n'),
      );
      return routeSourceFile(routeFile);
    });

    const calls = collectCallExpressions(sourceFile);
    const memberExpressionCall = calls.find((call) => call.expression.getText(sourceFile).includes('create'));

    expect(memberExpressionCall).toBeDefined();
    expect(callTargetsIdentifier(memberExpressionCall!)).toBe('create');
    expect(hasAnyCall(sourceFile, new Set(['tx.auditLog.create']))).toBe(true);
    expect(hasAnyCall(sourceFile, new Set(['foo']))).toBe(true);
    expect(hasAnyCall(sourceFile, new Set(['create']))).toBe(true);
    expect(hasAnyCall(sourceFile, new Set(['noop']))).toBe(false);
  });
});
