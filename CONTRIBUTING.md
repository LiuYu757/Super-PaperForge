# Contributing to PaperForge

Thank you for your interest in contributing to PaperForge! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) & Docker Compose
- [Git](https://git-scm.com/)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/LiuYu757/Super-PaperForge.git
cd paperforge

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start infrastructure services
docker-compose up -d

# Setup database
npx prisma migrate dev
npm run db:seed

# Start the development server
npm run dev
```

Open http://localhost:3000 to see the app.

## Project Structure

```
paperforge/
├── src/
│   ├── app/            # Next.js App Router (pages + API routes)
│   ├── components/     # React components
│   ├── lib/            # Core utilities (auth, db, encryption)
│   ├── services/       # Business logic layer
│   ├── store/          # Zustand state management
│   └── hooks/          # Custom React hooks
├── websocket/          # Yjs WebSocket server (standalone)
├── worker/             # LaTeX compilation worker (BullMQ)
├── prisma/             # Database schema & migrations
├── nginx/              # Reverse proxy configuration
└── public/             # Static assets
```

## Code Style

- **TypeScript**: Strict mode enabled, no `any` types
- **Components**: Functional components with hooks
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Imports**: Absolute imports using `@/` prefix
- **CSS**: TailwindCSS utility classes, shadcn/ui components

## Making Changes

### Branch Naming

```
feat/description    # New feature
fix/description     # Bug fix
refactor/description # Code refactoring
docs/description    # Documentation
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add PDF export feature
fix: resolve WebSocket reconnection issue
refactor: simplify compilation service
docs: update API reference
```

### Pull Request Process

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Ensure linting passes (`npm run lint`)
6. Commit your changes
7. Push to your fork
8. Open a Pull Request

### PR Checklist

- [ ] Tests added/updated
- [ ] Linting passes
- [ ] TypeScript compiles without errors
- [ ] Documentation updated (if applicable)
- [ ] No console.log or debug statements left

## Running Tests

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Reporting Issues

- Use the [GitHub Issues](https://github.com/LiuYu757/Super-PaperForge/issues) page
- Include steps to reproduce
- Include browser/OS information
- Attach screenshots if applicable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
