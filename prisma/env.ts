export function getPrismaDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}
