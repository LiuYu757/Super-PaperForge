import { BILLING_PLANS } from '@/lib/billing-plans';

export interface ActivationProject {
  id: string;
  name: string;
  members?: Array<{ userId?: string; role?: string }>;
  _count?: { files?: number };
}

export interface ActivationStep {
  id: 'create_project' | 'add_content' | 'collaborate' | 'review_billing';
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
}

export function getActivationChecklist(input: {
  projects: ActivationProject[];
  storageQuotaBytes?: number | string | bigint | null;
}): { steps: ActivationStep[]; completedCount: number; totalCount: number; percent: number } {
  const projects = input.projects;
  const hasProject = projects.length > 0;
  const hasContent = projects.some((project) => (project._count?.files ?? 0) > 0);
  const hasCollaborator = projects.some((project) => (project.members?.length ?? 0) > 1);
  const quota =
    typeof input.storageQuotaBytes === 'bigint'
      ? Number(input.storageQuotaBytes)
      : typeof input.storageQuotaBytes === 'string'
        ? Number.parseFloat(input.storageQuotaBytes)
        : input.storageQuotaBytes ?? 0;
  const reviewedBilling = quota > BILLING_PLANS.free.storageBytes;

  const firstProjectHref = hasProject ? `/editor/${projects[0].id}` : '/projects';
  const steps: ActivationStep[] = [
    {
      id: 'create_project',
      title: 'Create a project',
      description: 'Start from a blank paper or a template.',
      href: '/projects',
      cta: 'New Project',
      done: hasProject,
    },
    {
      id: 'add_content',
      title: 'Add source files',
      description: 'Open the editor and add TeX, BibTeX, images, or class files.',
      href: firstProjectHref,
      cta: 'Open Editor',
      done: hasContent,
    },
    {
      id: 'collaborate',
      title: 'Invite a collaborator',
      description: 'Validate the co-author workflow before a deadline.',
      href: firstProjectHref,
      cta: 'Share Project',
      done: hasCollaborator,
    },
    {
      id: 'review_billing',
      title: 'Review your plan',
      description: 'Confirm project, storage, support, and compilation capacity.',
      href: '/billing',
      cta: 'Open Billing',
      done: reviewedBilling,
    },
  ];

  const completedCount = steps.filter((step) => step.done).length;
  const totalCount = steps.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return { steps, completedCount, totalCount, percent };
}
