"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

function LoginContent() {
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");

  return (
    <div className="flex flex-col gap-6">
      {registered && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          Account created successfully. Please sign in.
        </div>
      )}
      <LoginForm />
      <OAuthButtons />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-4">
        <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
