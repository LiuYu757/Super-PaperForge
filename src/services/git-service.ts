import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/encryption';
import { ApiError } from '@/lib/errors';
import { env } from '@/lib/env';
import { assertPublicGitRemote } from '@/lib/git-remote-guard';

const REPOS_BASE = env.GIT_REPOS_PATH || '/tmp/paperforge-repos';

function getRepoDir(projectId: string) {
  return path.join(REPOS_BASE, projectId);
}

export async function linkGitRemote(projectId: string, remoteUrl: string) {
  await assertPublicGitRemote(remoteUrl);
  await prisma.project.update({
    where: { id: projectId },
    data: { gitRepoPath: remoteUrl },
  });

  // Add / update the "origin" remote inside the local bare repo so push/pull
  // work without extra configuration.
  const dir = getRepoDir(projectId);
  try {
    await git.addRemote({ fs, dir, remote: 'origin', url: remoteUrl, force: true });
  } catch {
    // Repo may not exist yet – that's fine, it will be initialised on first push.
  }
}

export async function pushToRemote(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project?.gitRepoPath) throw new ApiError(400, 'No remote repository linked');

  // Re-validate at fetch time: DNS rebinding could have flipped the stored URL
  // from a public host to a private IP since linkGitRemote ran.
  await assertPublicGitRemote(project.gitRepoPath);

  const credential = await prisma.gitCredential.findFirst({ where: { userId } });

  const dir = getRepoDir(projectId);

  await git.push({
    fs,
    http,
    dir,
    remote: 'origin',
    ref: 'main',
    ...(credential?.encryptedToken
      ? {
          onAuth: () => ({
            username: 'oauth2',
            password: decrypt(credential.encryptedToken!),
          }),
        }
      : {}),
  });
}

export async function pullFromRemote(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project?.gitRepoPath) throw new ApiError(400, 'No remote repository linked');

  // Re-validate at fetch time: DNS rebinding could have flipped the stored URL
  // from a public host to a private IP since linkGitRemote ran.
  await assertPublicGitRemote(project.gitRepoPath);

  const dir = getRepoDir(projectId);

  const credential = await prisma.gitCredential.findFirst({ where: { userId } });

  await git.pull({
    fs,
    http,
    dir,
    ref: 'main',
    singleBranch: true,
    author: { name: 'PaperForge', email: 'auto@paperforge.dev' },
    ...(credential?.encryptedToken
      ? {
          onAuth: () => ({
            username: 'oauth2',
            password: decrypt(credential.encryptedToken!),
          }),
        }
      : {}),
  });
}

// ─── Git Credentials ──────────────────────────────────────────────────────────

export async function listGitCredentials(userId: string) {
  const credentials = await prisma.gitCredential.findMany({
    where: { userId },
    select: {
      id: true,
      provider: true,
      sshPublicKey: true,
      createdAt: true,
      // Never return the encrypted secret values
    },
  });
  return credentials;
}

export async function addGitCredential(
  userId: string,
  provider: string,
  token: string,
) {
  const encryptedToken = encrypt(token);
  return prisma.gitCredential.create({
    data: { userId, provider, encryptedToken },
    select: { id: true, provider: true, createdAt: true },
  });
}

export async function deleteGitCredential(credentialId: string, userId: string) {
  const credential = await prisma.gitCredential.findUnique({
    where: { id: credentialId },
  });
  if (!credential || credential.userId !== userId) {
    throw new ApiError(404, 'Credential not found');
  }
  await prisma.gitCredential.delete({ where: { id: credentialId } });
}
