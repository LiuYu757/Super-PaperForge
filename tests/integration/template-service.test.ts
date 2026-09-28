import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('template routes', () => {
  const t = readFileSync(join(process.cwd(), 'src/app/api/v1/templates/route.ts'), 'utf-8');
  it('has GET list', () => { expect(t).toContain('GET'); });
  it('has POST submit', () => { expect(t).toContain('POST'); });
  it('uses apiSuccess', () => { expect(t).toContain('apiSuccess'); });
  it('has category filter', () => { expect(t).toContain('category'); });
  it('has search', () => { expect(t).toContain('search'); });
  it('from-template route', () => { expect(existsSync(join(process.cwd(), 'src/app/api/v1/projects/from-template/[templateId]/route.ts'))).toBe(true); });
});

describe('template route security', () => {
  const t = readFileSync(join(process.cwd(), 'src/app/api/v1/templates/route.ts'), 'utf-8');
  const ft = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/from-template/[templateId]/route.ts'), 'utf-8');

  it('POST submit has rate limiting', () => {
    expect(t).toContain('enforceRateLimit');
    expect(t).toContain('TEMPLATE_SUBMIT');
  });

  it('POST submit emits audit event', () => {
    expect(t).toContain('logAuditAction');
    expect(t).toContain('template.submitted');
  });

  it('from-template POST shares the project-creation rate bucket', () => {
    expect(ft).toContain('enforceRateLimit');
    expect(ft).toContain('rate:create-project:');
    expect(ft).toContain('PROJECT_CREATE');
  });

  it('from-template POST emits audit event', () => {
    expect(ft).toContain('logAuditAction');
    expect(ft).toContain('project.created_from_template');
  });
});

describe('template service', () => {
  const s = readFileSync(join(process.cwd(), 'src/services/template-service.ts'), 'utf-8');
  const getTemplateFn = s.slice(s.indexOf('export async function getTemplate'));
  it('has listTemplates', () => { expect(s).toContain('listTemplates'); });
  it('has submitTemplate', () => { expect(s).toContain('submitTemplate'); });
  it('has approved filter', () => { expect(s).toContain('isApproved'); });
  it('getTemplate defaults to approved-only lookup', () => {
    expect(getTemplateFn).toContain('export async function getTemplate(id: string, requireApproved = true)');
    expect(getTemplateFn).toContain('requireApproved && !template?.isApproved');
  });
  it('getTemplate excludes template source project file contents', () => {
    expect(getTemplateFn).toContain('select: {');
    expect(getTemplateFn).toContain('path: true,');
    expect(getTemplateFn).toContain('isBinary: true,');
  });
  it('has download count', () => { expect(s).toContain('downloadCount'); });
  it('submitTemplate blocks deleted projects', () => {
    const submit = s.slice(s.indexOf('export async function submitTemplate'));
    expect(submit).toContain('findFirst');
    expect(submit).toContain('deletedAt');
    expect(submit).toContain('project: { deletedAt: null }');
  });
});

describe('template page', () => {
  const p = readFileSync(join(process.cwd(), 'src/app/(dashboard)/templates/page.tsx'), 'utf-8');
  it('has SWR fetch', () => { expect(p).toContain('useSWR'); });
  it('has category tabs', () => { expect(p).toContain('CATEGORIES'); });
  it('has search input', () => { expect(p).toContain('SearchIcon'); });
  it('has use template dialog', () => { expect(p).toContain('Use Template'); });
});
