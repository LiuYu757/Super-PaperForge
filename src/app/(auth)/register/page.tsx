import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/register-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <RegisterForm />
      <Suspense>
        <OAuthButtons />
      </Suspense>
    </div>
  );
}
