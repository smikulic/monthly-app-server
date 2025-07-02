# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GraphQL API server for a personal finance application called "Monthly" (yourmonthly.app). The server handles budgeting, expense tracking, saving goals, and investment management.

**Tech Stack:**
- Node.js with TypeScript (ESM modules)
- Apollo GraphQL Server
- Prisma ORM with PostgreSQL
- JWT authentication
- Sentry for error monitoring
- Postmark for email services

## Development Commands

### Essential Commands
```bash
# Start development server (connects to remote dev DB)
yarn dev

# Build and deploy (generates Prisma client, runs migrations, compiles TypeScript)
yarn build

# Run tests
yarn test

# Database management
npx prisma studio                # Open Prisma Studio for DB inspection
npx prisma db seed              # Seed demo user
```

### Additional Commands
```bash
# TypeScript compilation only
yarn build:tsc

# Start production server
yarn start
```

## Architecture

### Core Structure
- **GraphQL Server**: Apollo Server with modular resolvers and type definitions
- **Authentication**: JWT-based auth with Bearer tokens, user context injected into all resolvers
- **Database**: PostgreSQL with Prisma ORM, separate dev/prod databases hosted on Digital Ocean
- **Modules**: Organized by domain (users, expenses, categories, subcategories, saving goals, investments)

### Key Models
- **User**: Core user entity with encrypted passwords
- **Category/Subcategory**: Hierarchical budget organization with rollover dates
- **Expense**: Individual transactions linked to subcategories and users
- **SavingGoal**: Goal tracking with target amounts and dates
- **Investment**: Investment tracking with quantities and currencies

### Resolver Pattern
All resolvers follow CRUD structure with authentication checks. Non-public queries are protected with authentication middleware. Resolvers are scoped based on UI needs (e.g., `chartExpenses` for specific chart data).

### Authentication Flow
1. User registers → encrypted password stored in DB
2. Login → JWT token issued after email/password verification
3. Protected requests → Bearer token validated, user injected into context
4. Password reset → Postmark sends secure reset token via email

## Database

### Prisma Commands
```bash
# After schema changes, build generates migrations and applies them
yarn build

# Access database directly (use DBeaver with DATABASE_URL from .env files)
# Development DB and Production DB URLs available in Digital Ocean
```

### Seeding
Demo user can be seeded with `npx prisma db seed` for testing.

## Testing

Jest is configured with TypeScript support. Tests are located in `__tests__` directories within each module. Module name mapping handles `.js` imports in tests.

## Environment & Deployment

- **Development**: Local server connects to remote Digital Ocean dev database
- **Production**: Auto-deploy on `master` branch push, runs migrations automatically
- **Secrets**: Managed in Digital Ocean for both dev/prod environments (JWT_SECRET, DATABASE_URL, Postmark API key)

## File Structure Notes

- `src/resolvers/`: GraphQL resolvers organized by domain
- `src/schemas/`: GraphQL type definitions for each domain
- `src/utils/`: Shared utilities including auth helpers (`withAuth`, `withErrorHandle`)
- `src/helpers/`: Business logic helpers (emails, reports)
- `prisma/`: Database schema and migrations
- `src/context.ts`: GraphQL context factory with Prisma client and authenticated user