'use client';

import { useState, useEffect } from 'react';
import { XIcon, SparklesIcon, KeyboardIcon, SearchIcon, FileTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TIPS = [
  { icon: KeyboardIcon, title: 'Ctrl+P', desc: 'Quick open any file by name' },
  { icon: SearchIcon, title: 'Ctrl+K', desc: 'Command palette with 22+ commands' },
  { icon: SparklesIcon, title: 'AI Panel', desc: 'Ask Claude to write, fix, or explain LaTeX' },
  { icon: FileTextIcon, title: 'Math Panel', desc: 'See equations rendered live as you type' },
];

const STORAGE_KEY = 'paperforge-onboarding-dismissed';

export function OnboardingTips() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show only on first visit
    if (!localStorage.getItem(STORAGE_KEY)) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  if (!visible) return null;

  return (
    <div className="absolute bottom-20 right-4 z-50 w-72 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-xl border bg-card p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Welcome to PaperForge</h3>
          <Button size="icon-xs" variant="ghost" onClick={dismiss} aria-label="Dismiss">
            <XIcon className="size-3.5" />
          </Button>
        </div>
        <div className="space-y-2.5">
          {TIPS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
                <Icon className="size-3.5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs font-medium">{title}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" className="mt-3 w-full text-xs" onClick={dismiss}>
          Got it!
        </Button>
      </div>
    </div>
  );
}
