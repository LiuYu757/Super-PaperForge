import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, ApiError } from '@/lib/errors';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';
import { assertExportEntitlement } from '@/services/entitlement-service';
import { prisma } from '@/lib/prisma';
import { minioClient, getBucket } from '@/lib/minio';
import { LIMITS, isValidFilePath } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compileId: string }> },
) {
  try {
    const principal = await authenticateRequest(request);
    const { id, compileId } = await params;

    await assertTokenAccess(principal, id, 'artifact:read', ['owner', 'editor', 'viewer']);
    await assertExportEntitlement(id, 'synctex');

    const compilation = await prisma.compilation.findFirst({
      where: { id: compileId, projectId: id },
      select: { synctexMinioKey: true, status: true },
    });

    if (!compilation) {
      throw new ApiError(404, 'Compilation not found');
    }
    if (!compilation.synctexMinioKey) {
      throw new ApiError(404, 'SyncTeX file not available for this compilation');
    }
    if (!isValidFilePath(compilation.synctexMinioKey)) {
      throw new ApiError(500, 'Invalid storage key');
    }

    const bucket = getBucket();
    const stream = await minioClient.getObject(bucket, compilation.synctexMinioKey);

    // Collect the stream into a buffer with size limit
    const chunks: Buffer[] = [];
    let totalSize = 0;
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > LIMITS.MAX_FILE_SIZE) {
          stream.destroy();
          reject(new ApiError(413, 'SyncTeX file exceeds maximum size'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename="output.synctex.gz"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
