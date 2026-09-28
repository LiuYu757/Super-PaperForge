"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  CheckIcon,
  XIcon,
  MailIcon,
  LockIcon,
  UserIcon,
} from "lucide-react";

interface PasswordRequirement {
  label: string;
  met: boolean;
}

function usePasswordStrength(password: string) {
  return useMemo(() => {
    const requirements: PasswordRequirement[] = [
      { label: "At least 8 characters", met: password.length >= 8 },
      { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
      { label: "Contains lowercase letter", met: /[a-z]/.test(password) },
      { label: "Contains number", met: /[0-9]/.test(password) },
      {
        label: "Contains special character",
        met: /[^A-Za-z0-9]/.test(password),
      },
    ];

    const metCount = requirements.filter((r) => r.met).length;
    const total = requirements.length;
    const percentage = (metCount / total) * 100;

    let level: "weak" | "fair" | "strong";
    let color: string;
    let bgColor: string;

    if (metCount <= 2) {
      level = "weak";
      color = "bg-red-500";
      bgColor = "text-red-600 dark:text-red-400";
    } else if (metCount <= 4) {
      level = "fair";
      color = "bg-yellow-500";
      bgColor = "text-yellow-600 dark:text-yellow-400";
    } else {
      level = "strong";
      color = "bg-green-500";
      bgColor = "text-green-600 dark:text-green-400";
    }

    return { requirements, metCount, total, percentage, level, color, bgColor };
  }, [password]);
}

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const passwordStrength = usePasswordStrength(password);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validation
    const errors: typeof fieldErrors = {};

    if (!name.trim()) {
      errors.name = "Name is required";
    }

    if (!email) {
      errors.email = "Email is required";
    } else if (!isEmailValid) {
      errors.email = "Please enter a valid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (passwordStrength.metCount < passwordStrength.total) {
      errors.password = "Password does not meet all requirements";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (!agreedToTerms) {
      errors.terms = "You must agree to the Terms of Service";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Registration failed. Please try again.");
        return;
      }

      router.push("/login?registered=true");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Create an account</CardTitle>
        <CardDescription>
          Get started with PaperForge for free
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && (
            <div role="alert" aria-live="polite" className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-4 shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
          )}

          {/* Name Field */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <div className="relative">
              <UserIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                aria-label="Full name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) {
                    setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                required
                autoComplete="name"
                className={`pl-8 ${
                  fieldErrors.name
                    ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30"
                    : ""
                }`}
              />
            </div>
            {fieldErrors.name && (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            )}
          </div>

          {/* Email Field */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <MailIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (!emailTouched) setEmailTouched(true);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                onBlur={() => setEmailTouched(true)}
                required
                autoComplete="email"
                className={`pl-8 pr-9 ${
                  fieldErrors.email
                    ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30"
                    : ""
                }`}
              />
              {emailTouched && email && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {isEmailValid ? (
                    <CheckIcon className="size-4 text-green-500" />
                  ) : (
                    <XIcon className="size-4 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {fieldErrors.email && (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <LockIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                aria-label="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      password: undefined,
                    }));
                  }
                }}
                required
                minLength={8}
                autoComplete="new-password"
                className={`pl-8 pr-9 ${
                  fieldErrors.password
                    ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30"
                    : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {password && (
              <div className="space-y-2">
                {/* Strength Bar */}
                <div className="flex items-center gap-2" role="meter" aria-valuenow={passwordStrength.percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`Password strength: ${passwordStrength.level}`}>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{ width: `${passwordStrength.percentage}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-medium capitalize ${passwordStrength.bgColor}`}
                    aria-live="polite"
                  >
                    {passwordStrength.level}
                  </span>
                </div>

                {/* Requirements Checklist */}
                <ul className="grid grid-cols-1 gap-1">
                  {passwordStrength.requirements.map((req) => (
                    <li
                      key={req.label}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      {req.met ? (
                        <CheckIcon className="size-3 text-green-500" />
                      ) : (
                        <XIcon className="size-3 text-muted-foreground" />
                      )}
                      <span
                        className={
                          req.met
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {req.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <div className="relative">
              <LockIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: undefined,
                    }));
                  }
                }}
                required
                autoComplete="new-password"
                className={`pl-8 pr-9 ${
                  fieldErrors.confirmPassword
                    ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30"
                    : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                tabIndex={-1}
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
              >
                {showConfirmPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
            {confirmPassword && password && (
              <p
                className={`text-xs ${
                  password === confirmPassword
                    ? "text-green-600 dark:text-green-400"
                    : "text-destructive"
                }`}
              >
                {password === confirmPassword
                  ? "Passwords match"
                  : "Passwords do not match"}
              </p>
            )}
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          {/* Terms of Service */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={setAgreedToTerms}
                className="mt-0.5"
              />
              <Label
                htmlFor="terms"
                className="text-sm font-normal leading-snug text-muted-foreground cursor-pointer"
              >
                I agree to the{" "}
                <Link
                  href="/terms"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Privacy Policy
                </Link>
              </Label>
            </div>
            {fieldErrors.terms && (
              <p className="text-xs text-destructive">{fieldErrors.terms}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <LoaderCircleIcon className="size-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
