/**
 * Public environment values safe to import from client components.
 */
export const clientEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '',
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? '',
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
} as const;
