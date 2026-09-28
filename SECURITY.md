# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | Yes                |
| < 1.0   | No                 |

## Reporting a Vulnerability

If you discover a security vulnerability in PaperForge, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use [GitHub private vulnerability reporting](https://github.com/LiuYu757/Super-PaperForge/security/advisories/new).

### What to include

- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 5 business days
- **Fix Target**: Within 30 days for critical issues

### Security Measures

PaperForge implements the following security controls:

- **Authentication**: NextAuth.js v5 with JWT, OAuth 2.0 (Google, GitHub), bcrypt password hashing
- **Encryption**: AES-256-GCM for OAuth tokens and Git credentials at rest
- **Input Validation**: Zod schemas on all API endpoints with XSS prevention
- **Rate Limiting**: Redis sliding-window on auth endpoints (5/15min) and compilation (10/min)
- **File Upload**: MIME whitelist, blocked extensions (.exe, .bat, .sh), 50MB size limit, path traversal prevention
- **Security Headers**: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **CORS**: Origin validation via Next.js middleware
- **CSRF**: NextAuth.js CSRF token protection
- **SQL Injection**: Prisma ORM with parameterized queries
- **Brute Force**: Progressive delay + account lockout after 20 failed attempts
- **Request Tracing**: Unique X-Request-ID on every API response

## Disclosure Policy

We follow responsible disclosure practices. After a fix is deployed, we will:

1. Credit the reporter (unless anonymity is requested)
2. Publish a security advisory
3. Release a patched version

Thank you for helping keep PaperForge secure.
