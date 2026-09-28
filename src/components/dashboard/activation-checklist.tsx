'use client';

import Link from 'next/link';
import { ArrowRightIcon, CheckCircle2Icon, CircleIcon } from 'lucide-react';
import { getActivationChecklist, type ActivationProject } from '@/lib/activation';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ActivationChecklistProps {
  projects: ActivationProject[];
  storageQuotaBytes?: number;
}

export function ActivationChecklist({ projects, storageQuotaBytes }: ActivationChecklistProps) {
  const checklist = getActivationChecklist({ projects, storageQuotaBytes });

  if (checklist.percent === 100) return null;

  const nextStep = checklist.steps.find((step) => !step.done);

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Launch Checklist</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {checklist.completedCount} of {checklist.totalCount} activation steps complete.
            </p>
          </div>
          {nextStep && (
            <Link
              href={nextStep.href}
              className={cn(buttonVariants({ size: 'sm' }), 'w-fit')}
            >
              {nextStep.cta}
              <ArrowRightIcon className="ml-1 size-3.5" />
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-orange-500 transition-all"
            style={{ width: `${checklist.percent}%` }}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {checklist.steps.map((step) => {
            const Icon = step.done ? CheckCircle2Icon : CircleIcon;
            return (
              <Link
                key={step.id}
                href={step.href}
                className={cn(
                  'rounded-lg border bg-background p-3 transition-colors hover:border-orange-500/40',
                  step.done && 'border-green-500/30 bg-green-500/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn('size-4', step.done ? 'text-green-600' : 'text-muted-foreground')} />
                  <p className="text-sm font-medium">{step.title}</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
