import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { createProjectWithFiles } from '@/services/project-service';
import { getFileBuffer } from '@/services/file-service';

const TEMPLATE_CATEGORIES = ['journal', 'thesis', 'presentation', 'letter', 'cv'] as const;

/** Cap how many templates we will ever return in one call. The gallery
 *  paginates, but a misbehaving client should not be able to ask for the
 *  whole table in a single request. */
export const TEMPLATE_LIST_MAX_LIMIT = 100;
export const TEMPLATE_LIST_DEFAULT_LIMIT = 50;

export async function listTemplates(
  category?: string,
  search?: string,
  limit: number = TEMPLATE_LIST_DEFAULT_LIMIT,
  offset: number = 0,
) {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), TEMPLATE_LIST_MAX_LIMIT);
  const safeOffset = Math.max(0, Math.floor(offset));
  const where = {
    isApproved: true,
    ...(category && category !== 'all' ? { category } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.template.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        downloadCount: true,
        thumbnailUrl: true,
        isApproved: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
      orderBy: { downloadCount: 'desc' },
      take: safeLimit,
      skip: safeOffset,
    }),
    prisma.template.count({ where }),
  ]);
  return { items, total, limit: safeLimit, offset: safeOffset };
}

export async function getTemplate(id: string, requireApproved = true) {
  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      sourceProject: {
        select: {
          id: true,
          compiler: true,
          files: {
            where: { deletedAt: null },
            select: {
              id: true,
              path: true,
              isBinary: true,
            },
          },
        },
      },
    },
  });
  if (requireApproved && !template?.isApproved) {
    throw new ApiError(404, 'Template not found');
  }
  if (!template) throw new ApiError(404, 'Template not found');
  return template;
}

export async function createProjectFromTemplate(
  templateId: string,
  userId: string,
  projectName: string,
) {
  const template = await getTemplate(templateId);

  const files: Array<{ path: string; content: string } | { path: string; bytes: Buffer; mimeType: string }> = [];
  if (template.sourceProject && template.sourceProject.files.length > 0) {
    for (const file of template.sourceProject.files) {
      const source = await getFileBuffer(template.sourceProject.id, file.path);
      if (file.isBinary) files.push({ path: file.path, bytes: source.buffer,
        mimeType: source.mimeType ?? 'application/octet-stream' });
      else files.push({ path: file.path, content: source.buffer.toString('utf-8') });
    }
  } else {
    files.push({ path: 'main.tex', content: getDefaultContent(template.category ?? '') });
  }

  const project = await createProjectWithFiles(userId, {
    name: projectName,
    description: `Created from template: ${template.name}`,
    compiler: template.sourceProject?.compiler ?? 'pdflatex',
  }, files);

  // Increment download count
  await prisma.template.update({
    where: { id: templateId },
    data: { downloadCount: { increment: 1 } },
  });

  return project;
}

function getDefaultContent(category: string): string {
  const contents: Record<string, string> = {
    journal: `\\documentclass[12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage[colorlinks=true]{hyperref}

\\title{Article Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Your abstract here.
\\end{abstract}

\\section{Introduction}
Introduction text here.

\\section{Methods}
Methods text here.

\\section{Results}
Results text here.

\\section{Conclusion}
Conclusion text here.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`,
    thesis: `\\documentclass[12pt]{report}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage[colorlinks=true]{hyperref}

\\title{Thesis Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{Introduction}
Introduction text here.

\\chapter{Literature Review}
Literature review here.

\\chapter{Methodology}
Methodology text here.

\\chapter{Results}
Results text here.

\\chapter{Conclusion}
Conclusion text here.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`,
    presentation: `\\documentclass{beamer}
\\usetheme{Madrid}
\\usecolortheme{default}

\\title{Presentation Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Outline}
\\tableofcontents
\\end{frame}

\\section{Introduction}
\\begin{frame}{Introduction}
\\begin{itemize}
  \\item First point
  \\item Second point
  \\item Third point
\\end{itemize}
\\end{frame}

\\section{Main Content}
\\begin{frame}{Main Content}
Content goes here.
\\end{frame}

\\section{Conclusion}
\\begin{frame}{Conclusion}
Concluding remarks.
\\end{frame}

\\end{document}
`,
    letter: `\\documentclass{letter}
\\usepackage[utf8]{inputenc}

\\signature{Your Name}
\\address{Your Address \\\\ City, State, ZIP \\\\ Country}

\\begin{document}
\\begin{letter}{Recipient Name \\\\ Recipient Address \\\\ City, State, ZIP}

\\opening{Dear Sir/Madam,}

Body of the letter goes here.

\\closing{Yours sincerely,}

\\end{letter}
\\end{document}
`,
    cv: `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{enumitem}
\\usepackage[colorlinks=true]{hyperref}

\\begin{document}

\\begin{center}
  {\\LARGE \\textbf{Your Name}} \\\\[4pt]
  email@example.com $\\cdot$ +1 (555) 000-0000 \\\\
  City, Country
\\end{center}

\\hrule

\\section*{Education}
\\textbf{Degree} \\hfill Year -- Year \\\\
University Name, City, Country

\\section*{Experience}
\\textbf{Job Title} \\hfill Start -- End \\\\
Company Name \\\\
\\begin{itemize}[leftmargin=*]
  \\item Achievement or responsibility
\\end{itemize}

\\section*{Skills}
\\begin{itemize}[leftmargin=*]
  \\item Skill category: skill1, skill2
\\end{itemize}

\\end{document}
`,
  };

  return (
    contents[category] ??
    `\\documentclass{article}
\\usepackage[utf8]{inputenc}

\\title{Document Title}
\\author{Author}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Your content here.

\\end{document}
`
  );
}

export async function submitTemplate(
  projectId: string,
  userId: string,
  name: string,
  description: string,
  category: string,
) {
  // Verify user owns an existing (non-deleted) project
  const member = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId,
      project: { deletedAt: null },
    },
  });
  if (!member || member.role !== 'owner') {
    throw new ApiError(403, 'Only the project owner can submit templates');
  }

  // Check for existing template from this project
  const existing = await prisma.template.findUnique({
    where: { sourceProjectId: projectId },
  });
  if (existing) {
    throw new ApiError(409, 'A template already exists for this project');
  }

  if (category && !TEMPLATE_CATEGORIES.includes(category as typeof TEMPLATE_CATEGORIES[number])) {
    throw new ApiError(400, `Invalid category. Must be one of: ${TEMPLATE_CATEGORIES.join(', ')}`);
  }

  return prisma.template.create({
    data: {
      name,
      description,
      category,
      sourceProjectId: projectId,
      authorId: userId,
      isApproved: false,
    },
  });
}
