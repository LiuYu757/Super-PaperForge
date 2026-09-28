import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type CompileFile = {
  path: string;
  minioKey?: string | null;
  content?: string | null;
  isBinary?: boolean;
  sha256?: string;
};

/** Build the complete work tree from its declared authorities or reject the job. */
export async function materializeFiles(
  files: CompileFile[],
  workDir: string,
  downloadBinary: (key: string, destination: string) => Promise<void>,
): Promise<void> {
  const root = fs.realpathSync(workDir);
  for (const file of files) {
    if (!file.path || file.path.includes('..') || file.path.includes('\\')
      || /[\x00-\x1f]/.test(file.path) || file.path.startsWith('/')
      || file.path.split('/').some((part) => !part || part === '.')
      || /^[A-Za-z]:/.test(file.path)) {
      throw new Error(`Unsafe compilation path: ${file.path}`);
    }
    const destination = path.resolve(root, file.path);
    if (!destination.startsWith(root + path.sep)) {
      throw new Error(`Compilation path escapes work directory: ${file.path}`);
    }
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const parent = await fs.promises.realpath(path.dirname(destination));
    if (parent !== root && !parent.startsWith(root + path.sep)) {
      throw new Error(`Compilation path follows a symlink: ${file.path}`);
    }
    if (!file.isBinary) {
      if (typeof file.content !== 'string') {
        throw new Error(`Text content is unavailable for ${file.path}; migrate the legacy file first`);
      }
      await fs.promises.writeFile(destination, file.content, 'utf8');
    } else if (file.minioKey) {
      try {
        await downloadBinary(file.minioKey, destination);
      } catch (error) {
        if (typeof file.content !== 'string') throw error;
        await fs.promises.writeFile(destination, Buffer.from(file.content, 'base64'));
      }
    } else if (typeof file.content === 'string') {
      await fs.promises.writeFile(destination, Buffer.from(file.content, 'base64'));
    } else {
      throw new Error(`Binary content is unavailable for ${file.path}`);
    }
    if (file.sha256) {
      const actual = crypto.createHash('sha256')
        .update(await fs.promises.readFile(destination)).digest('hex');
      if (actual !== file.sha256) {
        throw new Error(`Frozen compilation input failed integrity check: ${file.path}`);
      }
    }
  }
}
