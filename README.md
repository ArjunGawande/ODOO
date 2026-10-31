# Brightloop Billing

Subscription billing for Brightloop Software, built with Next.js (App Router, JavaScript), PostgreSQL through knex, and Tailwind CSS. This phase covers sign-up and roles, products and variants, and plans.

`docs/PROBLEM_STATEMENT.md` is the product brief and `docs/CONTRACT.md` is the build contract.

## Setup

You need Node.js 20.9 or later and a PostgreSQL server (version 16 is what this was built against).

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 and log in with one of the accounts below.

## Seeded logins

| Role | Email | Password |
|---|---|---|
| Admin | `admin@brightloop.in` | `Brightloop@2026` |
| Staff | `staff@brightloop.in` | `Brightloop@2026` |
| Customer | `owner@sharma.in` | `Sharma@2026` |

The seed also adds the CloudCRM product with its Odoo variant (final price ₹1,560.00) and the CloudCRM Monthly plan.

These are demo values. With `NODE_ENV=production` the seed creates only the admin from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: no staff or customer logins and no catalogue.

It is safe to run again: rows that already exist are left as they are, so it never duplicates data or resets a changed password.

The staff and customer passwords are public, so never seed a shared database without `NODE_ENV=production`.

## Environment

All variables go in `.env.local`, which is gitignored. `.env.example` lists them with placeholders.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection for the app, the knex CLI and the seed |
| `TEST_DATABASE_URL` | for tests | Database the test suite wipes. Its name must contain `test` |
| `APP_URL` | no | Base URL for emailed links. Default `http://localhost:3000` |
| `APP_TIMEZONE` | no | Business timezone for "today". Default `Asia/Kolkata` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | in production | Mail server. With no `SMTP_HOST`, development logs mail to the server console. Production logs a configuration error and sends nothing, so reset and invite links never reach the logs |
| `MAIL_FROM` | with SMTP | Sender address |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | in production | First admin. Development falls back to the seeded login above |

## Pointing at a real Postgres

Set `DATABASE_URL` to a standard connection string:

```
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
```

Percent-encode any special characters in the password. For a server that requires TLS, add `?sslmode=require`.

Create the database first, then run `npm run db:migrate`. The user needs permission to create tables, indexes, functions and triggers in the `public` schema. `DATABASE_URL` is never given a default, so a missing value stops with an error rather than connecting to a local server by accident.

In production, set `NODE_ENV=production` and both `SEED_ADMIN_*` variables before running `npm run db:seed`, or the seed refuses to run. It then creates only the admin. Set `SMTP_HOST` too, or password reset and staff invites can't send. Session cookies are marked `Secure` in production, so serve the app over HTTPS.

Never point `TEST_DATABASE_URL` at a database you care about: tests truncate every table in it.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest, once, against `TEST_DATABASE_URL` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:rollback` | Undo the last batch of migrations |
| `npm run db:seed` | Load the first admin, plus demo data outside production |
| `npm run db:reset` | Roll back everything, migrate and seed. This destroys all data |

Tests apply migrations themselves before the run. To use a different test database for one run, set `TEST_DATABASE_URL` in the shell: it wins over `.env.local`.

## Project layout

```
db/migrations, db/seeds     Schema and demo data, owned by knex
src/app                     Routes and layouts
src/actions                 Server actions: guard, validate, call a service, redirect
src/services                Business logic, with no next/* imports
src/lib                     Money, dates, pagination, auth, database
src/components/ui           Shared UI kit
src/components/shell        Workspace sidebar and portal header
tests                       Vitest tests and helpers
```

## Project layout

One repo, two folders. Run everything from the repo root (a single `package.json`).

```
backend/    database and server logic, no React
  db/         knex migrations and seeds
  knexfile.js
  src/lib/      db, money, dates, validation, auth helpers, mailer
  src/services/ business logic (users, products, plans, dashboard)
  tests/        service and database tests
frontend/   the Next.js app
  src/app/      pages and layouts
  src/components/ UI kit and app shell
  src/actions/  server actions (guard, validate, call a service)
  src/lib/auth/ session cookie and permission guards
  tests/        page, form and action tests
```

`frontend` imports backend code through the `@backend/*` alias; `@/*` is the frontend's own `src`. Paths in `docs/CONTRACT.md` such as `src/services` now mean `backend/src/services`, and `src/app` means `frontend/src/app`.
