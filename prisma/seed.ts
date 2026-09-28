import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BUILT_IN_TEMPLATES = [
  {
    name: 'IEEE Conference Article',
    description:
      'A standard IEEE two-column conference paper template with abstract, keywords, and bibliography support.',
    category: 'journal',
    isApproved: true,
  },
  {
    name: 'ACM Article',
    description:
      'Official ACM SIG proceedings template suitable for ACM conferences and journals.',
    category: 'journal',
    isApproved: true,
  },
  {
    name: 'Beamer Presentation',
    description:
      'A clean Beamer slideshow presentation with Madrid theme, outline slide, and section frames.',
    category: 'presentation',
    isApproved: true,
  },
  {
    name: 'Basic Article',
    description:
      'A simple LaTeX article template with common packages (amsmath, graphicx, hyperref) pre-loaded.',
    category: 'journal',
    isApproved: true,
  },
  {
    name: 'PhD Thesis',
    description:
      'A structured thesis template using the report class with chapters, table of contents, and bibliography.',
    category: 'thesis',
    isApproved: true,
  },
  {
    name: 'Cover Letter',
    description:
      'A professional cover letter template using the LaTeX letter class.',
    category: 'letter',
    isApproved: true,
  },
  {
    name: 'Curriculum Vitae',
    description:
      'A clean, modern CV template with sections for education, experience, and skills.',
    category: 'cv',
    isApproved: true,
  },
];

async function main() {
  console.log('Seeding built-in templates...');

  for (const template of BUILT_IN_TEMPLATES) {
    const existing = await prisma.template.findFirst({
      where: { name: template.name, authorId: null },
    });

    if (existing) {
      console.log(`  Skipping existing template: ${template.name}`);
      continue;
    }

    await prisma.template.create({
      data: {
        name: template.name,
        description: template.description,
        category: template.category,
        isApproved: template.isApproved,
        sourceProjectId: null,
        authorId: null,
      },
    });
    console.log(`  Created template: ${template.name}`);
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
