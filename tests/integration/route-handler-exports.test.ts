import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import path from 'node:path';
import {
  collectRouteSourceFiles,
  displayPath,
  exportedDeclarationNames,
  hasDefaultModifier,
} from '../utils/route-analysis';

const APP_ROOT = path.resolve(process.cwd(), 'src', 'app');

const allowedRouteExports = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'TRACE',
  'CONNECT',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'experimental_ppr',
  'generateStaticParams',
]);

function collectRouteExportViolations(file: string, sourceFile: ts.SourceFile): string[] {
  const violations: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      violations.push(`${displayPath(file)}: default export`);
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;

      if (!statement.exportClause) {
        violations.push(`${displayPath(file)}: wildcard export`);
        continue;
      }

      if (ts.isNamedExports(statement.exportClause)) {
        for (const specifier of statement.exportClause.elements) {
          const name = specifier.name.text;
          if (!allowedRouteExports.has(name)) {
            violations.push(`${displayPath(file)}: re-export ${name}`);
          }
        }
      }
      continue;
    }

    if (hasDefaultModifier(statement)) {
      violations.push(`${displayPath(file)}: default export`);
      continue;
    }

    for (const name of exportedDeclarationNames(statement)) {
      if (!allowedRouteExports.has(name)) {
        violations.push(`${displayPath(file)}: export ${name}`);
      }
    }
  }

  return violations;
}

describe('route handler exports', () => {
  it('should only export route handlers and supported segment config', () => {
    const routeSources = collectRouteSourceFiles(APP_ROOT);
    const violations = routeSources.flatMap(({ filePath, sourceFile }) =>
      collectRouteExportViolations(filePath, sourceFile),
    );

    expect(routeSources.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
