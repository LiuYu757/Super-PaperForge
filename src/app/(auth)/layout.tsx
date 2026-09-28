import type { Metadata } from "next";
import { FlameIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Sign In",
  robots: { index: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-background via-muted/40 to-background" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />

      {/* Subtle grid pattern overlay */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <FlameIcon className="size-7" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PaperForge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Collaborative LaTeX editing for the modern web
          </p>
        </div>
      </div>

      {/* Form container */}
      <div className="w-full max-w-md">{children}</div>

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} PaperForge. All rights reserved.
      </p>
    </div>
  );
}
