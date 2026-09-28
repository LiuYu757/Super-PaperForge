import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('collaborators component', () => {
  const co = readFileSync(join(process.cwd(), 'src/components/editor/collaborators.tsx'), 'utf-8');
  it('has awareness', () => { expect(co).toContain('awareness'); });
  it('has online count', () => { expect(co).toContain('online'); });
  it('has avatar stack', () => { expect(co).toContain('rounded-full'); });
  it('has expandable panel', () => { expect(co).toContain('expanded'); });
  it('has file activity', () => { expect(co).toContain('Editing'); });
  it('has overflow indicator', () => { expect(co).toContain('+'); });
});

describe('version history component', () => {
  const vh = readFileSync(join(process.cwd(), 'src/components/editor/version-history.tsx'), 'utf-8');
  it('has timeline', () => { expect(vh).toContain('border-orange'); });
  it('has diff viewer', () => { expect(vh).toContain('diff'); });
  it('has restore dialog', () => { expect(vh).toContain('Restore'); });
  it('has date grouping', () => { expect(vh).toContain('toLocaleDateString'); });
  it('has toast', () => { expect(vh).toContain('toast'); });
  it('has loading state', () => { expect(vh).toContain('LoaderCircle'); });
});

describe('git panel component', () => {
  const gp = readFileSync(join(process.cwd(), 'src/components/editor/git-panel.tsx'), 'utf-8');
  it('has remote URL', () => { expect(gp).toContain('remoteUrl'); });
  it('has push/pull', () => { expect(gp).toContain('Push'); expect(gp).toContain('Pull'); });
  it('has credentials', () => { expect(gp).toContain('credential'); });
  it('has encryption note', () => { expect(gp).toContain('AES-256'); });
  it('has delete confirm', () => { expect(gp).toContain('deleteConfirm'); });
  it('has status messages', () => { expect(gp).toContain('toast'); });
  it('has provider icons', () => { expect(gp).toContain('github'); });
});

describe('share dialog', () => {
  const sd = readFileSync(join(process.cwd(), 'src/components/dashboard/share-dialog.tsx'), 'utf-8');
  it('has invite form', () => { expect(sd).toContain('email'); });
  it('has role selector', () => { expect(sd).toContain('role'); });
  it('has share link', () => { expect(sd).toContain('token'); });
  it('has member list', () => { expect(sd).toContain('Member'); });
});
