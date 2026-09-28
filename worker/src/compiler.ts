import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { env } from './env';

export type CompilerType = 'pdflatex' | 'xelatex' | 'lualatex';
export interface CompileResult {
  success: boolean;
  cancelled: boolean;
  log: string;
  pdfPath?: string;
  synctexPath?: string;
  docxPath?: string;
  durationMs: number;
  imageDigest: string;
}

async function runnerRequest(route: string, body: object, timeoutMs: number): Promise<Record<string, unknown>> {
  if (!env.RUNNER_URL || !env.TEX_IMAGE_DIGEST) {
    throw new Error('Isolated TeX runner is not configured');
  }
  const response = await fetch(`${env.RUNNER_URL}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new Error(`TeX runner unavailable (HTTP ${response.status})`);
  }
  const result = payload as Record<string, unknown>;
  if (typeof result.error === 'string') throw new Error(`TeX runner: ${result.error}`);
  return result;
}

export async function cancelCompile(attemptId: string): Promise<void> {
  const response = await runnerRequest('/cancel', { attemptId }, 10_000);
  if (response.stopped !== true) throw new Error('TeX runner did not confirm container stop');
}

function artifact(outputDir: string, name: unknown): string | undefined {
  if (typeof name !== 'string' || !['output.pdf', 'output.synctex.gz', 'output.docx'].includes(name)) {
    return undefined;
  }
  const filename = path.join(outputDir, name);
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 55 * 1024 * 1024) {
    throw new Error('Runner returned an unsafe artifact');
  }
  return filename;
}

async function verifyChecksum(filename: string | undefined, expected: unknown): Promise<void> {
  if (!filename) return;
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('Runner omitted artifact checksum');
  }
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) digest.update(chunk);
  if (digest.digest('hex') !== expected) throw new Error('Runner artifact checksum mismatch');
}

export async function compileLatex(
  compilationId: string,
  attemptId: string,
  workDir: string,
  mainFile: string,
  compiler: CompilerType,
  exportDocx: boolean,
): Promise<CompileResult> {
  const response = await runnerRequest('/run', {
    compilationId, attemptId, mainFile, compiler, exportDocx,
  }, 150_000);
  if (response.imageDigest !== env.TEX_IMAGE_DIGEST) {
    throw new Error('Runner used a TeX image different from the approved digest');
  }
  const output = response.artifacts as Record<string, unknown> | undefined;
  const checksums = response.checksums as Record<string, unknown> | undefined;
  if (!output || !checksums || typeof response.log !== 'string' || typeof response.durationMs !== 'number') {
    throw new Error('Runner returned an incomplete result');
  }
  const outputDir = path.join(workDir, 'output');
  const pdfPath = artifact(outputDir, output.pdf);
  const synctexPath = artifact(outputDir, output.synctex);
  const docxPath = artifact(outputDir, output.docx);
  const total = [pdfPath, synctexPath, docxPath].reduce((bytes, filename) =>
    bytes + (filename ? fs.lstatSync(filename).size : 0), 0);
  if (total > 55 * 1024 * 1024) throw new Error('Runner output total exceeds limit');
  await verifyChecksum(pdfPath, checksums.pdf);
  await verifyChecksum(synctexPath, checksums.synctex);
  await verifyChecksum(docxPath, checksums.docx);
  return {
    success: response.success === true, cancelled: response.cancelled === true,
    log: response.log, durationMs: response.durationMs, imageDigest: response.imageDigest,
    pdfPath, synctexPath, docxPath,
  };
}
