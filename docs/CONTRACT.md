# Build contract: phase 1 (scenes 1 to 3)

This is the shared agreement every agent builds against. If the code needs to differ from it, update this file in the same change and report the difference in your handoff.

Scope of this phase: `docs/PROBLEM_STATEMENT.md` scenes 1 (auth and roles), 2 (products and variants) and 3 (plans). Do **not** build quotation templates, subscriptions, discounts, taxes, invoices or payments, and do not add columns or tables for them.

## Stack

- Next.js (App Router, latest stable) with **JavaScript only**. No TypeScript, no `.ts` files.
- PostgreSQL through `knex` + `pg`. Knex owns all schema changes. Raw SQL only inside knex (`knex.raw`) with bindings, never string interpolation of values.
- Tailwind CSS. No component library. Shared components in `src/components/ui`.
- `zod` for validation, `bcryptjs` (cost 12) for passwords, `nodemailer` for email, `vitest` for tests.
- Do not add dependencies beyond these without reporting why in your handoff.
- The npm package name is `brightloop-billing`. The folder name has a capital letter, so `create-next-app` will refuse to scaffold in place. Scaffold by hand or in a scratch folder and copy across.
- Read the installed Next docs in `node_modules/next/dist/docs` if present, and follow the installed major version (async `params`/`searchParams`/`cookies()`, `proxy` vs `middleware`). Do not assume older APIs.

## Local databases

Use the throwaway cluster only. **Never connect to port 5432**: that is the user's own server.

- Dev: `postgres://postgres@127.0.0.1:5544/brightloop_dev`
- Tests, one database per agent so parallel runs don't collide: `brightloop_test_foundation`, `brightloop_test_auth`, `brightloop_test_products`, `brightloop_test_plans`, and `brightloop_test` for integration.
- `psql`: `C:\Program Files\PostgreSQL\16\bin\psql.exe -h 127.0.0.1 -p 5544 -U postgres -d <db>` (no password).

`.env.local` is gitignored and holds the values above for now, with `TEST_DATABASE_URL` pointing at `brightloop_test`. `.env.example` documents every variable with placeholders.

Environment variables: `DATABASE_URL`, `TEST_DATABASE_URL`, `APP_URL` (default `http://localhost:3000`), `APP_TIMEZONE` (default `Asia/Kolkata`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.

## Layout and ownership

Each path has one owning agent. Do not edit a file you don't own. If you need something changed, put it in your handoff under `requests`.

```
knexfile.js                     foundation   (CommonJS; loads env with @next/env loadEnvConfig)
db/migrations/                  foundation
db/seeds/                       foundation
vitest.config.mjs, tests/helpers/ foundation   (JSX is transformed in .js files, so tests can render pages and forms)
docs/SETUP or README.md         foundation
src/lib/db.js                   foundation
src/lib/money.js                foundation
src/lib/dates.js                foundation
src/lib/pagination.js           foundation
src/lib/action-result.js        foundation
src/lib/errors.js               foundation
src/lib/auth/password.js        foundation
src/lib/auth/session-store.js   foundation   (token and DB logic, no next/* imports)
src/lib/auth/session.js         foundation   (cookie wrapper around the store)
src/lib/auth/guards.js          foundation
src/lib/auth/permissions.js     foundation
src/components/ui/              foundation
src/components/shell/           foundation
src/actions/session.js          foundation   (logoutAction)
src/app/layout.js, globals.css, page.js, forbidden/, not-found.js  foundation
src/app/(auth)/layout.js        foundation
src/app/(workspace)/layout.js   foundation
src/app/portal/layout.js        foundation

src/app/(auth)/**/page.js + client forms   auth
src/app/(workspace)/dashboard/  auth
src/app/(workspace)/staff/      auth
src/app/portal/page.js          auth
src/services/users.js           auth
src/services/password-reset.js  auth
src/services/dashboard.js       auth         (getDashboardCounts; plan counts reuse sellablePlansQuery from plans.js)
src/lib/mailer.js               auth
src/lib/validation/auth.js      auth
src/actions/auth.js, staff.js   auth
tests/auth*.test.js             auth
tests/seed.test.js              foundation

src/app/(workspace)/products/   products
src/services/products.js        products
src/lib/validation/products.js  products
src/actions/products.js         products
tests/products*.test.js         products

src/app/(workspace)/plans/      plans
src/services/plans.js           plans
src/lib/validation/plans.js     plans
src/actions/plans.js            plans
tests/plans*.test.js            plans
```

## Layers

Request flow: page or server action → guard → zod validation → service → knex.

- **Services** (`src/services/*`) take validated plain objects and return plain objects. They must not import `next/*`, so they can be tested directly with vitest. They accept an optional `trx`/`db` argument where a transaction spans services.
- **Server actions** (`src/actions/*`) call a guard **first**, then validate, then call the service, then `revalidatePath`/`redirect`. A layout guard is not enough: every action and page does its own check.
- **Pages** are server components by default. They call a guard, then a service. Client components only for interactivity. Plain objects only cross the server/client boundary.
- No `loading.js` under routes. It starts streaming before the page runs, so the status is already 200 and `notFound()` and guard redirects lose their real HTTP status.

### Action result shape

Every action used with `useActionState` has signature `(prevState, formData)` and returns `{ ok: true, message? }` or `{ ok: false, message?, fieldErrors? }`, where `fieldErrors` is `{ fieldName: 'message' }`. Helpers `actionOk`, `actionError` and `fromZodError` live in `src/lib/action-result.js`.

### Guards (`src/lib/auth/guards.js`)

- `getCurrentUser()`: returns `{ id, name, email, role }` or `null`. Cached per request with React `cache`. An expired session or a deactivated user counts as logged out.
- `requireUser()`: redirects to `/login` if logged out.
- `requirePermission(permission)`: `requireUser()`, then redirects to `/forbidden` if the role lacks it. Returns the user. Use it in every page and action.
- `homeForRole(role)` (in `permissions.js`): `/dashboard` for admin and staff, `/portal` for customer.

### Permissions (`src/lib/auth/permissions.js`)

One matrix, one place. Never compare `user.role` in pages or actions.

| Permission | admin | staff | customer |
|---|---|---|---|
| `workspace.view` | yes | yes | no |
| `portal.view` | no | no | yes |
| `staff.manage` | yes | no | no |
| `products.read` | yes | yes | no |
| `products.write` (create, edit, archive, restore, variants) | yes | no | no |
| `plans.read` | yes | yes | no |
| `plans.write` (create, edit, archive, restore) | yes | no | no |

Pages must hide write controls when the user lacks the write permission (use `can(user, permission)`), and the action must still enforce it.

## Data rules

### Money

- Columns are `numeric(12,2)`. Values cross the app as **strings** such as `"1560.00"`. Never use JS floats for money.
- `src/lib/money.js`: `isValidMoney(str)`, `toPaise(str)` → integer, `fromPaise(int)` → string, `formatINR(str)` → `₹1,560.00` using `en-IN` grouping.
- Variant final price is computed, never stored, so a base price change flows through: `p.sales_price + v.extra_price AS final_price` in SQL. Client previews use paise integers.

### Dates

- Sale-window columns are Postgres `date`. Set a `pg` type parser for OID 1082 so dates arrive as `YYYY-MM-DD` strings, never JS `Date` (that shifts days across timezones). Timestamps stay `timestamptz`.
- `src/lib/dates.js`: `todayInBusinessTz()` → `YYYY-MM-DD` in `APP_TIMEZONE`; `formatDate(str)` → `1 Nov 2026`.
- Set parsers so `int8` (OID 20, from `count(*)`) is a JS number. Money stays a string.

### Lists

- Every list is paginated in SQL with `limit`/`offset` and a total from a database `count`. Default page size 20, maximum 100. Never load rows to count or filter in JS. `src/lib/pagination.js` parses `?page=` and `?q=` safely (bad values fall back to defaults) and returns `{ page, pageSize, offset, q }`.
- Search is `lower(name) LIKE lower(?)` with `%` and `_` in user input escaped.

### Schema (all tables have `created_at`, `updated_at` as timestamptz default now(); ids are `increments`)

`users`: `name varchar(120) not null`, `email varchar(254) not null`, `password_hash text null` (null until an invited staff member sets one), `role text not null default 'customer'` CHECK in (`admin`,`staff`,`customer`), `is_active boolean not null default true`. Unique index on `lower(email)`. Index on `(role, is_active)`.

`sessions`: `user_id` FK users ON DELETE CASCADE, `token_hash char(64) not null unique`, `expires_at timestamptz not null`. Index on `user_id`, index on `expires_at`.

`password_reset_tokens`: `user_id` FK users ON DELETE CASCADE, `token_hash char(64) not null unique`, `purpose text not null` CHECK in (`reset`,`invite`), `expires_at timestamptz not null`, `used_at timestamptz null`. Index on `user_id`.

`products`: `name varchar(160) not null`, `type text not null` CHECK in (`service`,`goods`), `sales_price numeric(12,2) not null` CHECK >= 0, `cost_price numeric(12,2) not null default 0` CHECK >= 0, `notes text`, `is_active boolean not null default true`. Partial unique index on `lower(name)` where `is_active`. Index on `(is_active, lower(name))`.

`product_variants`: `product_id` FK products ON DELETE RESTRICT, `attribute varchar(80) not null` (for example `Brand`), `value varchar(80) not null` (for example `Odoo`), `extra_price numeric(12,2) not null default 0` CHECK >= 0, `is_active boolean not null default true`. Partial unique index on `(product_id, lower(attribute), lower(value))` where `is_active`. Index on `(product_id, is_active)`.

`plans`: `name varchar(160) not null`, `price numeric(12,2) not null` CHECK >= 0, `billing_period text not null` CHECK in (`daily`,`weekly`,`monthly`,`yearly`), `min_quantity integer not null default 1` CHECK >= 1, `start_date date not null`, `end_date date not null`, CHECK `end_date >= start_date`, `auto_close`, `can_close_early`, `can_pause`, `can_renew` booleans not null default false, `is_active boolean not null default true`. Partial unique index on `lower(name)` where `is_active`. Index on `(is_active, start_date, end_date)`.

Archive instead of delete for products, variants and plans: later scenes will reference them. Restoring an archived row whose name now clashes must return a friendly error, not a 500.

Add `updated_at` maintenance through one shared trigger function created in the first migration, so no service has to remember it.

Unique-violation handling: `src/lib/errors.js` exports `isUniqueViolation(err, constraintName?)` (pg code `23505`). Validate first for good messages, and still catch `23505` because two requests can race.

## Auth rules

- Emails are trimmed and lowercased before storing or comparing. Duplicate sign-up returns a field error on `email`.
- Password rule (`passwordSchema` in `src/lib/validation/auth.js`): at least 9 characters, at most 72 **bytes** (bcrypt limit), at least one uppercase, one lowercase, one special character (not a letter, digit or whitespace). `Sharma@2026` passes. Show the rule on the form and validate on the server regardless of client checks.
- Public sign-up always creates `role='customer'`. The role never comes from form input.
- First admin comes from the seed (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`). There is no public way to become admin or staff.
- Sessions: 32 random bytes, stored only as a SHA-256 hash in `sessions`, 7-day expiry. Cookie `bl_session`: `httpOnly`, `sameSite: 'lax'`, `secure` in production, `path: '/'`. Logout deletes the row and clears the cookie. Purge a user's expired sessions on login.
- Login failure uses one generic message and takes similar time whether or not the email exists (compare against a dummy bcrypt hash). Inactive accounts and accounts with a null `password_hash` get the same generic message.
- Forgot password: always responds with the same message whether or not the email exists. Raw token is 32 random bytes in the link, only its SHA-256 hash is stored, expiry 1 hour, single use. Issuing a new token invalidates earlier unused ones for that user. Consume with an atomic `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING`. A successful reset updates the password and deletes all that user's sessions in one transaction. Do not email inactive accounts.
- Link format: `${APP_URL}/reset-password?token=<raw>`. Set `Referrer-Policy: no-referrer` on that route (`next.config.mjs` headers, foundation owns that file).
- Mailer: `sendMail({ to, subject, text, html })`. With SMTP configured it uses nodemailer. Without `SMTP_HOST` outside production it logs the message and link to the server console, so the flow works in local demos. Without `SMTP_HOST` in production it never logs a link or token: it logs a configuration error and the send fails. If sending fails, log it (never the link) and keep the forgot-password response identical.
- Staff invites: admin enters name and email. This creates `role='staff'` with `password_hash` null and sends an `invite` token (72-hour expiry) to `/reset-password?token=...`, which reuses the same page. If the email already has an account, return a field error on `email`.
- Resend invite (`staff.manage`): available for staff with a null `password_hash` and `is_active` true. It issues a fresh `invite` token, which invalidates older ones under the rule above, and sends it. `/staff` shows "Invite pending" while an unused unexpired token exists and "Invite expired" when none does, computed in the `listStaff` SQL with no per-row queries. Any live token counts, including a `reset` token, because either can set the password.
- Deactivating a user sets `is_active=false` and deletes their sessions in one transaction. An admin cannot deactivate themselves. Staff management lists only `role='staff'`.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | redirect to `homeForRole` if logged in, otherwise `/login` |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | public | logged-in users visiting login or sign-up are redirected home |
| `/dashboard` | `workspace.view` | summary cards using database counts (active products, active plans, plans on sale today, customers). `getDashboardCounts` lives in `src/services/dashboard.js`, and plans on sale uses the same filter as `listSellablePlans` |
| `/staff`, `/staff/new` | `staff.manage` | list, invite, resend invite, deactivate, reactivate |
| `/products`, `/products/[id]` | `products.read` | list with search and pagination, detail with variants |
| `/products/new`, `/products/[id]/edit` | `products.write` | |
| `/plans`, `/plans/[id]` | `plans.read` | list with search, pagination and an availability badge |
| `/plans/new`, `/plans/[id]/edit` | `plans.write` | |
| `/portal` | `portal.view` | welcome page with empty "My subscriptions" and "My invoices" sections |
| `/forbidden` | any | "You don't have access" with a link home |

## Scene-specific behaviour

**Products.** Create, edit, archive, restore. The list shows active products by default, with a filter for archived. The variants section on the product page lists each variant with its `+₹560.00` extra and computed final price, plus add, edit and archive. The form previews the final price. Export `listProductsForSale()` and `getVariantPrice(variantId)` from the service for later scenes.

**Plans.** Availability is derived, never stored: `scheduled` (today before `start_date`), `on_sale` (today within the range, inclusive of both ends), `ended` (today after `end_date`). Compute it in one exported function `planAvailability(plan, today)` and use `todayInBusinessTz()`. Export `listSellablePlans(onDate)`, filtering in SQL. Edit form uses four labelled checkboxes for the options. `end_date` must not be before `start_date`, enforced in zod and in the database. Price, minimum quantity and dates are validated on the server. The relationship between `plans.price` and subscription line prices is decided in scene 4.

## Seed data (`npm run db:seed`, idempotent, safe to re-run)

In `NODE_ENV=production` the seed creates the admin and nothing else. Everything after the admin below exists only when `NODE_ENV` is not `production`, because those logins have public passwords.

- Admin: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, defaulting to `admin@brightloop.in` / `Brightloop@2026`. In `NODE_ENV=production`, refuse to run without both set.
- Staff: `staff@brightloop.in` / `Brightloop@2026`.
- Customer: Sharma Traders, `owner@sharma.in` / `Sharma@2026`.
- Product: CloudCRM, type `service`, sales price `1000.00`, cost price `400.00`. Variant: attribute `Brand`, value `Odoo`, extra `560.00`, final ₹1,560.00.
- Plan: CloudCRM Monthly, price `1000.00`, monthly, minimum quantity 5, 2026-11-01 to 2027-12-31, `auto_close` and `can_pause` true, the other two false.

## Scripts (`package.json`)

`dev`, `build`, `start`, `lint`, `test` (vitest run), `db:migrate` (knex migrate:latest), `db:rollback`, `db:seed` (knex seed:run), `db:reset` (rollback all, migrate, seed).

## Working rules for parallel agents

- Only the integration agent runs `next build` or `next dev`: they share `.next`. Feature agents verify with `npm run lint` scoped to their files and `npx vitest run tests/<theirs>` with their own `TEST_DATABASE_URL`.
- Do not run `npm install`. If you need a package, put it in `requests`.
- Match the look of the shared UI components. Every page needs loading-safe empty states and works at phone width.
- Tests must verify behaviour, including the scene's worked example. Don't weaken a test to make it pass.
- Do not commit: the folder is not a git repository and the user hasn't asked for one.
