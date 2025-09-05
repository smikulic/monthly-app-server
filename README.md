## Architecture

### Flow

When user registers, we store the encrypted password to DB.
Next time they login we use auth context to verify email and password with the DB records and send back request Auth token.
If they reset a password, Postmark service will send a token over email for secure reset flow.

Resolvers are structured in a CRUD manner (create, update, delete mutations) and read is split based on schema:
category, subcategory, expenses (everything is scoped based on UI needs, such as `chartExpenses`).
Every query (non public one) is protect with `is unauthenticated` check.

GraphQL schema defined which data from DB is gonna be available as a response to Client side requests.

Prisma Schema defines our Database structure.

### Services

We have a total of 5 services running.

one on *Godaddy*:
- Domain hosting - yourmonthly.app (SSL and DNS managed within [Digital Ocean](https://cloud.digitalocean.com/networking/domains))

three on *Digital Ocean*:
- monthly-app-db
  - defaultdb (*`development` DB*)
  - defaultdb-prod (*`production` DB*)
- monthly-app-server
- Monthly-app-client

and one on *Postmark*:
- Monthly App - Production (reset password email - template managed within [their template editor](https://account.postmarkapp.com/servers/11744691/templates))

### Secrets
- All secrets are split between `development` and `production` (managed within Digitial Ocean) environments

- Auth JWT token (login/register/reset-password)
- Digital Ocean DB keys
- Postmark API key

### Database
- We use Postgres DB with Prisma ORM (migrations and DB management)

To seed `demo` user you can run `npx prisma db seed`

## Local development

To run the server we need to run:
  - `yarn dev` which starts the server on `http://localhost:3001`
  - we connect to remote development DB hosted on Digital Ocean (env files hooked up to Prisma client)

When making Prisma schema changes:
  - `yarn build` - this will generate and execute Prisma migration on remote/dev DB

If you wanna test cron job worker you will need to add `CRON_ENABLED=true` to `.env` or run the script once via package.json scripts.
As an alternative play around with dry run scripts.

### Debugging
We can inspect and check database with tools like DBeaver and connect to either `development` or `production` DB by using `DATABASE_URL` from either `.env` or `.env.prod` local files (or by checking the URL string from Digital Ocean).

Inspecting and checking GraphQL schema, queries and migrations can be done by running `yarn prisma-studio` and typing in the local development API (`http://localhost:3001`) or production API (`https://yourmonthly.app`), or just go to `http://localhost:3001/api` or `https://yourmonthly.app/api` and let Prisma Studio to guide you.

## Production deploy
pushing `master` branch will trigger migrations automatically on `production` DB
