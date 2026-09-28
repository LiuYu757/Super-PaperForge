process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex for testing
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters-long';
process.env.SMTP_FROM = 'test@paperforge.dev';
