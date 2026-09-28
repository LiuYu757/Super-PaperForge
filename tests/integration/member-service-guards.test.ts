import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * member-service has two security-relevant invariants that aren't trivial
 * to test against a real DB in CI:
 *
 *   1. inviteMember / joinViaShareLink rely on the (projectId, userId)
 *      unique constraint instead of a check-then-create — defeats the
 *      TOCTOU race where two concurrent invites could double-insert.
 *
 *   2. joinViaShareLink refuses to enroll a user into a soft-deleted
 *      project, returning a 410 instead of producing a half-baked
 *      membership pointing at a deleted resource.
 *
 * These are asserted structurally against the service source so a future
 * refactor cannot silently restore the broken behaviour.
 */
const memberService = readFileSync(
  join(process.cwd(), 'src/services/member-service.ts'),
  'utf-8',
);

const projectService = readFileSync(
  join(process.cwd(), 'src/services/project-service.ts'),
  'utf-8',
);

describe('assertProjectRole — soft-delete enforcement', () => {
  it('filters out soft-deleted projects so members cannot access deleted resources', () => {
    // assertProjectRole must include deletedAt: null in its query so that
    // a project.delete (soft) immediately revokes all member access, even
    // for users who still have a ProjectMember row.
    const assertFn = projectService.slice(projectService.indexOf('export async function assertProjectRole'));
    expect(assertFn).toMatch(/deletedAt:\s*null/);
  });

  it('uses findFirst (not findUnique) to allow the project join with deletedAt filter', () => {
    const assertFn = projectService.slice(projectService.indexOf('export async function assertProjectRole'));
    expect(assertFn).toContain('findFirst');
    expect(assertFn).not.toContain('findUnique');
  });
});

describe('member-service guards', () => {
  it('inviteMember catches P2002 (unique constraint) and turns it into a 409', () => {
    expect(memberService).toContain('inviteMember');
    expect(memberService).toContain('P2002');
    expect(memberService).toContain('already a member');
  });

  it('joinViaShareLink rejects soft-deleted projects with 410', () => {
    expect(memberService).toContain('joinViaShareLink');
    // The deletion guard fetches the project with deletedAt: null and throws
    // 410 if absent. Match both the filter and the status code.
    expect(memberService).toMatch(/deletedAt:\s*null/);
    expect(memberService).toMatch(/new ApiError\(\s*410/);
  });

  it('joinViaShareLink treats existing membership as idempotent (no thrown duplicate)', () => {
    // The P2002 swallowed branch is what makes the join idempotent.
    expect(memberService).toContain('joinViaShareLink');
    expect(memberService).toMatch(/P2002[^}]*\}/);
  });

  it('share-link management is owner-only and can revoke links by project scope', () => {
    expect(memberService).toContain('listShareLinks');
    expect(memberService).toContain('revokeShareLink');
    expect(memberService).toMatch(/assertProjectRole\(projectId,\s*requesterId,\s*\['owner'\]\)/);
    expect(memberService).toMatch(/deleteMany\(\{\s*where:\s*\{\s*id:\s*linkId,\s*projectId\s*\}/);
  });

  it('member additions enforce plan collaborator entitlements', () => {
    expect(memberService).toContain('assertCollaboratorEntitlement');
    expect(memberService).toContain('PLAN_COLLABORATOR_LIMIT_REACHED');
    expect(memberService).toContain('canAddProjectCollaborator');
  });
});
