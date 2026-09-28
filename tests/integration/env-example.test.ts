import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

function readEnvExampleKeys(): Set<string> {
  const content = readFileSync(join(process.cwd(), '.env.example'), 'utf-8');
  const keys = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function readEnvModuleKeys(relativePath: string): Set<string> {
  const content = readFileSync(join(process.cwd(), relativePath), 'utf-8');
  const keys = new Set<string>();
  // Any helper call that reads from process.env via a string name:
  // required('FOO'), optional('FOO'), parseBoolean('FOO'),
  // parsePositiveInteger('FOO'), parseOriginList('FOO'), modeFlag('FOO', ...),
  // parseMode('FOO', [...], ...)
  const re = /\b(?:required|optional|parseBoolean|parsePositiveInteger|parseOriginList|modeFlag|parseMode)\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

// Framework-injected or build-only vars — never expected in .env.example.
const FRAMEWORK_KEYS = new Set([
  'NODE_ENV',
  'NEXT_PHASE',
  'npm_lifecycle_event',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
]);

describe('.env.example contract', () => {
  const exampleKeys = readEnvExampleKeys();
  const consumerKeys = new Set<string>([
    ...readEnvModuleKeys('src/lib/env.ts'),
    ...readEnvModuleKeys('worker/src/env.ts'),
    ...readEnvModuleKeys('websocket/src/env.ts'),
  ]);

  it('every env consumed by code is documented in .env.example', () => {
    const undocumented = [...consumerKeys]
      .filter((k) => !exampleKeys.has(k) && !FRAMEWORK_KEYS.has(k))
      .sort();
    expect(
      undocumented,
      `Add to .env.example: ${undocumented.join(', ')}`,
    ).toEqual([]);
  });

  it('every key in .env.example is actually consumed somewhere', () => {
    const orphan = [...exampleKeys].filter((k) => !consumerKeys.has(k)).sort();
    expect(
      orphan,
      `Remove from .env.example (no consumer found): ${orphan.join(', ')}`,
    ).toEqual([]);
  });

  it('has OAuth placeholders', () => {
    expect(exampleKeys.has('GOOGLE_CLIENT_ID')).toBe(true);
    expect(exampleKeys.has('GITHUB_CLIENT_ID')).toBe(true);
  });
});
