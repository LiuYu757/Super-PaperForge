import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getProject } from '@/services/project-service';
import { listFiles, createFile } from '@/services/file-service';
import { EditorLayout } from '@/components/editor/editor-layout';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import 'katex/dist/katex.min.css';

interface EditorPageProps {
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: EditorPageProps): Promise<Metadata> {
  const { projectId } = await params;
  try {
    const session = await auth();
    if (!session?.user) return {};
    const userId = (session.user as { id: string }).id;
    const project = await getProject(projectId, userId);
    return {
      title: project.name,
      robots: { index: false },
    };
  } catch {
    return { title: 'Editor' };
  }
}

const MAIN_TEX_TEMPLATE = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{My Document}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Write your introduction here.

\\section{Conclusion}
Write your conclusion here.

\\end{document}
`;

export default async function EditorPage({ params }: EditorPageProps) {
  let session = null;
  try {
    session = await auth();
  } catch {
    redirect('/login');
  }
  if (!session?.user) {
    redirect('/login');
  }

  const { projectId } = await params;
  const userId = (session.user as { id: string }).id;

  let project: { name: string; mainFile: string; revision: bigint; gitRepoPath?: string | null };
  let fileEntries: Array<{ id: string; path: string; mimeType: string | null; isBinary: boolean; sizeBytes?: number }> = [];

  try {
    project = await getProject(projectId, userId);
    let files = await listFiles(projectId);

    if (files.length === 0) {
      try {
        await createFile(projectId, 'main.tex', MAIN_TEX_TEMPLATE);
        files = await listFiles(projectId);
      } catch {
        // MinIO may not be available — proceed with empty file list
      }
    }

    fileEntries = files.map((f) => ({
      id: f.id,
      path: f.path,
      mimeType: f.mimeType,
      isBinary: f.isBinary,
      sizeBytes: f.sizeBytes != null ? Number(f.sizeBytes) : undefined,
    }));
  } catch {
    redirect('/projects');
  }

  return (
    <ErrorBoundary>
      <EditorLayout
        projectId={projectId}
        projectName={project.name}
        currentUserId={userId}
        initialMainFile={project.mainFile}
        initialRevision={project.revision.toString()}
        files={fileEntries}
        gitRemoteUrl={project.gitRepoPath ?? undefined}
      />
    </ErrorBoundary>
  );
}
