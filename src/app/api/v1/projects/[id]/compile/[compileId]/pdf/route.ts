import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, ApiError } from '@/lib/errors';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';
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

    const compilation = await prisma.compilation.findFirst({
      where: { id: compileId, projectId: id },
      select: { pdfMinioKey: true, pdfData: true, status: true },
    });

    if (!compilation) {
      throw new ApiError(404, 'Compilation not found');
    }

    let buffer: Buffer;

    // Try MinIO first, then fall back to DB-stored PDF
    if (compilation.pdfMinioKey && isValidFilePath(compilation.pdfMinioKey)) {
      try {
        const stream = await minioClient.getObject(getBucket(), compilation.pdfMinioKey);
        const chunks: Buffer[] = [];
        let totalSize = 0;
        await new Promise<void>((resolve, reject) => {
          stream.on('data', (chunk: Buffer) => {
            totalSize += chunk.length;
            if (totalSize > LIMITS.MAX_FILE_SIZE) {
              stream.destroy();
              reject(new ApiError(413, 'PDF file exceeds maximum size'));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        buffer = Buffer.concat(chunks);
      } catch {
        // MinIO failed — try DB fallback
        if (compilation.pdfData) {
          buffer = Buffer.from(compilation.pdfData);
        } else {
          throw new ApiError(404, 'PDF not available (storage unavailable)');
        }
      }
    } else if (compilation.pdfData) {
      // No MinIO key — serve from DB
      buffer = Buffer.from(compilation.pdfData);
    } else {
      throw new ApiError(404, 'PDF not available for this compilation');
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename="output.pdf"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
