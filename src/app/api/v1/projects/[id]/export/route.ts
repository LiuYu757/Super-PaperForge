import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { assertProjectRole, getProject } from '@/services/project-service';
import { assertExportEntitlement } from '@/services/entitlement-service';
import { listFiles, getFileContent } from '@/services/file-service';
import { apiError, ApiErrors } from '@/lib/api-response';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { RATE_LIMITS, LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/projects/:id/export
 * Export entire project as a downloadable ZIP archive.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;
    const { id } = await params;

    // Rate limit: 10 exports per hour per user
    const rateLimit = await checkRateLimit(`rate:export:${userId}`, RATE_LIMITS.EXPORT.limit, RATE_LIMITS.EXPORT.windowSeconds);
    if (!rateLimit.allowed) {
      const response = apiError(
        'Too many export requests. Please wait before retrying.',
        429,
        'RATE_LIMITED',
      );
      Object.entries(rateLimitHeaders(RATE_LIMITS.EXPORT.limit, rateLimit)).forEach(
        ([key, value]) => {
          response.headers.set(key, value);
        },
      );
      return response;
    }

    await assertProjectRole(id, userId, ['owner', 'editor', 'viewer']);
    await assertExportEntitlement(id, 'zip');

    const project = await getProject(id, userId);
    const files = await listFiles(id);

    // Add project metadata as .paperforge.json
    const metadata = JSON.stringify({
      name: project.name,
      compiler: project.compiler,
      mainFile: project.mainFile,
      exportedAt: new Date().toISOString(),
      fileCount: files.length,
    }, null, 2);

    const encoder = new TextEncoder();
    const zipParts: Uint8Array[] = [];
    const centralDir: Uint8Array[] = [];
    let offset = 0;

    // Include metadata file first
    const metaContent = encoder.encode(metadata);
    const metaPath = encoder.encode('.paperforge.json');
    const metaCrc = crc32(metaContent);
    const metaHeader = new Uint8Array(30 + metaPath.length);
    const metaView = new DataView(metaHeader.buffer);
    metaView.setUint32(0, 0x04034b50, true);
    metaView.setUint16(4, 20, true);
    metaView.setUint16(26, metaPath.length, true);
    metaView.setUint32(14, metaCrc, true);
    metaView.setUint32(18, metaContent.length, true);
    metaView.setUint32(22, metaContent.length, true);
    metaHeader.set(metaPath, 30);
    zipParts.push(metaHeader, metaContent);
    const metaCd = new Uint8Array(46 + metaPath.length);
    const metaCdView = new DataView(metaCd.buffer);
    metaCdView.setUint32(0, 0x02014b50, true);
    metaCdView.setUint16(4, 20, true);
    metaCdView.setUint16(6, 20, true);
    metaCdView.setUint32(16, metaCrc, true);
    metaCdView.setUint32(20, metaContent.length, true);
    metaCdView.setUint32(24, metaContent.length, true);
    metaCdView.setUint16(28, metaPath.length, true);
    metaCdView.setUint32(42, 0, true);
    metaCd.set(metaPath, 46);
    centralDir.push(metaCd);
    offset += metaHeader.length + metaContent.length;

    for (const file of files) {
      // Sanitize path for ZIP entry: strip leading slashes, reject traversal
      const safePath = file.path.replace(/^\/+/, '');
      if (!safePath || safePath.includes('..') || /^[A-Za-z]:/.test(safePath)) {
        continue; // skip unsafe paths
      }

      let content: Uint8Array;
      try {
        const text = await getFileContent(id, file.path);
        content = encoder.encode(text);
      } catch {
        // Skip files that can't be read (binary files without text content)
        continue;
      }

      const pathBytes = encoder.encode(safePath);
      const crc = crc32(content);

      // Local file header
      const header = new Uint8Array(30 + pathBytes.length);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true); // signature
      view.setUint16(4, 20, true); // version needed
      view.setUint16(6, 0, true); // flags
      view.setUint16(8, 0, true); // compression (store)
      view.setUint16(10, 0, true); // mod time
      view.setUint16(12, 0, true); // mod date
      view.setUint32(14, crc, true); // crc32
      view.setUint32(18, content.length, true); // compressed size
      view.setUint32(22, content.length, true); // uncompressed size
      view.setUint16(26, pathBytes.length, true); // filename length
      view.setUint16(28, 0, true); // extra length
      header.set(pathBytes, 30);

      zipParts.push(header);
      zipParts.push(content);

      // Enforce total export size limit (500MB = MAX_PROJECT_SIZE)
      offset += header.length + content.length;
      if (offset > LIMITS.MAX_PROJECT_SIZE) {
        return apiError('Project too large to export as ZIP', 413, 'PAYLOAD_TOO_LARGE');
      }

      // Central directory entry
      const cdEntry = new Uint8Array(46 + pathBytes.length);
      const cdView = new DataView(cdEntry.buffer);
      cdView.setUint32(0, 0x02014b50, true); // signature
      cdView.setUint16(4, 20, true); // version made by
      cdView.setUint16(6, 20, true); // version needed
      cdView.setUint16(8, 0, true); // flags
      cdView.setUint16(10, 0, true); // compression
      cdView.setUint16(12, 0, true); // mod time
      cdView.setUint16(14, 0, true); // mod date
      cdView.setUint32(16, crc, true); // crc32
      cdView.setUint32(20, content.length, true); // compressed size
      cdView.setUint32(24, content.length, true); // uncompressed size
      cdView.setUint16(28, pathBytes.length, true); // filename length
      cdView.setUint16(30, 0, true); // extra length
      cdView.setUint16(32, 0, true); // comment length
      cdView.setUint16(34, 0, true); // disk number
      cdView.setUint16(36, 0, true); // internal attrs
      cdView.setUint32(38, 0, true); // external attrs
      cdView.setUint32(42, offset - header.length - content.length, true); // local header offset
      cdEntry.set(pathBytes, 46);

      centralDir.push(cdEntry);
    }

    // End of central directory
    const cdOffset = offset;
    let cdSize = 0;
    for (const cd of centralDir) cdSize += cd.length;

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true); // signature
    eocdView.setUint16(4, 0, true); // disk number
    eocdView.setUint16(6, 0, true); // cd disk
    eocdView.setUint16(8, centralDir.length, true); // entries on disk
    eocdView.setUint16(10, centralDir.length, true); // total entries
    eocdView.setUint32(12, cdSize, true); // cd size
    eocdView.setUint32(16, cdOffset, true); // cd offset
    eocdView.setUint16(20, 0, true); // comment length

    // Combine all parts
    const totalSize = offset + cdSize + 22;
    const zip = new Uint8Array(totalSize);
    let pos = 0;
    for (const part of zipParts) { zip.set(part, pos); pos += part.length; }
    for (const cd of centralDir) { zip.set(cd, pos); pos += cd.length; }
    zip.set(eocd, pos);

    logAuditAction(userId, 'project.exported', 'project', id, {
      fileCount: files.length,
      name: project.name,
    }).catch(() => {});

    return new NextResponse(zip, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip"`,
        'Content-Length': String(totalSize),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Simple CRC32 implementation for ZIP format. */
function crc32(data: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}
