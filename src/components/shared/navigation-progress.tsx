'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPath = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Detect route change
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      // Complete the progress bar
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleStart() {
      setVisible(true);
      setProgress(20);
      // Gradually increment
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 300);
    }

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || anchor.target === '_blank') return;
      if (href === pathname) return;
      handleStart();
    }

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pathname]);

  // Clean up timer when progress completes
  useEffect(() => {
    if (progress >= 100 && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [progress]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[9999] h-0.5"
      role="progressbar"
      aria-label="Page loading"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-orange-500 transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
