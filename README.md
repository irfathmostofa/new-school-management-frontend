# School Management System (SMS) — v2 Rebuild

> Status: **Design phase** · Last updated: 2026-09-24
> Done: module map, architecture, foundation schema v0.1 (`01_foundation_schema.sql`, tested on PostgreSQL 16)
> Next: RLS layer → Student & Admission schema

---

## 1. Goals

1. **Normalize** the legacy schema (~230 tables, only 3 foreign keys, dates and money stored as text, names copied instead of IDs).
2. **Lookup tables for everything enum-like — including statuses.** No free-text status columns.
3. **Fully dynamic admin control:** admins define policies, rules, workflows and forms without a developer.
4. **Correct money:** proper chart of accounts (double-entry), immutable payslips, invoices and receipts.
5. **Secure by default:** database-enforced access (RLS), audit trail, no secrets in the browser.
6. **One platform, two apps:** Admin/Staff app and Student/Parent portal.

---

## 2. Tech stack — fully Neon-based backend, Vercel-hosted frontend

Neon shipped a full backend suite in beta (Jul 2026): **Postgres, Auth, Data API, Object Storage, Functions, AI Gateway** — one project, one `neon.ts` config, branches carry all of it together. We use that suite for everything backend. **Vercel hosts only the two static/SPA frontends** (and can also host webhook receivers if we ever need compute outside Neon Functions).

| Layer | Choice | Notes |
|---|---|---|
| Frontend hosting | **Vercel** | Two static/SPA deployments: `admin.<domain>`, `portal.<domain>` |
| Frontend | **React + Vite + TypeScript** | Single admin SPA (portal later); static build, no Vercel server runtime |
| Styling / UI | **Tailwind CSS + shadcn/ui** | Tokens in `src/` |
| Data fetching | **TanStack Query** | Caching, pagination, optimistic updates |
| Tables / forms | **TanStack Table**, **React Hook Form + Zod** | Pagination is mandatory on every list |
| Routing | **TanStack Router** | Type-safe search params for filters and pagination |
| Database | **Neon Postgres** | `school` project, branch per environment / per PR |
| Auth | **Neon Auth** (Managed Better Auth) | Identity only; school roles live in our `iam` schema. Syncs to `neon_auth.users_sync` |
| CRUD API | **Neon Data API** (PostgREST-compatible) via `@neondatabase/neon-js` | Supabase-style `.from().select()`; security = RLS. Called directly from the Vercel-hosted SPAs |
| Business logic | **Neon Functions** (long-running compute on the Neon branch) | Payroll runs, invoicing, the rule engine, device ingestion, cron, payment-gateway webhooks |
| File storage | **Neon Object Storage** (S3-compatible, branches with the DB) | Photos, CVs, PDFs, uploads; DB stores references only (`shared.file`) |
| Config-as-code | **`neon.ts`** | Declares Postgres, Auth, Data API, Storage buckets, Functions per branch; deployed with `neon deploy` |
| Migrations | **SQL-first versioned migrations** (e.g. dbmate), run against each Neon branch | Triggers, functions and RLS don't fit ORM schema tools |
| Types | `neon-js gen-types` | Generated from the live schema |
| Testing | Vitest, Playwright, SQL tests for RLS | RLS is tested like code |
| CI/CD | GitHub Actions: `neon deploy` (backend) + Vercel Git integration (frontend), one Neon branch per PR | Vercel's Neon Native Integration auto-syncs `DATABASE_URL` and Neon Auth env vars per preview |

### How the frontend talks to Neon

```
                        ┌────────────────────────  Neon project "school"  ────────────────────────┐
Vercel (SPA)            │                                                                          │
 admin.<domain>   ──────┼──► Neon Auth (login, session, JWT) ──────────────────────────────────┐   │
 portal.<domain>  ──────┤                                                                       │   │
                        │                                                                       ▼   │
                  ──────┼──(JWT)──► Neon Data API ──► Postgres  (RLS enforces every read/write) │   │
                        │                                                                           │
                  ──────┼──(JWT)──► Neon Functions ──► Postgres + Neon Object Storage             │
                        │            (payroll, invoicing, rules, devices, webhooks, cron)           │
                        └──────────────────────────────────────────────────────────────────────────┘
```

Nothing but static assets is deployed to Vercel — no server connection string ever ships to a Vercel server function, because there isn't one. The browser holds only a short-lived Neon Auth JWT.

| Use Data API + RLS | Use Neon Functions |
|---|---|
| Lists, detail pages, simple create/update | Payroll runs, fee invoice generation, rule evaluation |
| Lookups, settings, dashboards | Multi-table money transactions |
| Portal reads (results, attendance, dues) | Attendance-device receiver, SMS / payment-gateway callbacks, cron |
| Uploading a file to Object Storage directly (presigned) | Anything needing a secret key or server-side validation before writing |

**Security rule:** never turn on the Data API for a table until RLS is on and grants are correct. Never ship a database connection string to any client, including a Vercel server function.

### Why this split (and the one open risk)
- Object Storage, Functions and the AI Gateway are **beta** (July 2026) and only run in `aws-us-east-2` today. Our Neon project (`school`, `us-east-2`) already matches that region.
- Neon Functions is Neon's own long-running compute, not Vercel's. Vercel's job here is purely to serve the two React SPAs fast over its CDN and give us preview deployments per PR (with a matching Neon branch via the Vercel Marketplace integration).
- **Risk to track:** beta features can change before GA. Keep `packages/rules` (the rule evaluator) portable — if Neon Functions' interface changes, that package should still run unmodified in a plain Node/Hono server as a fallback.

---

## 3. Architecture principles

### Data
- Schemas per domain: `core`, `iam`, `shared` (later `student`, `hr`, `fee`, `acc`, …).
- `snake_case`, singular table names, `<thing>_id` foreign keys, real FKs everywhere.
- Correct types: `date`, `timestamptz`, `numeric(14,2)` for money, `boolean`.
- Never copy names into child tables — store IDs (`class_offering_id`, not `'Grade 1'`). **Exception:** financial and academic *snapshots* (payslip, receipt, report card) are frozen on purpose.
- `session_id` foreign key replaces the repeated `session` string.
- One `person` table shared by students, guardians and employees; yearly facts (class, section, house) live in `student_enrollment`.
- Every business table has `created_at`, `updated_at`, `created_by`, `updated_by`.

### Lookups and statuses
- `core.lookup_type` + `core.lookup_value` hold gender, religion, blood group, relationship types **and all status sets** (record, approval, rule, session, user, notification, …).
- `is_final` marks terminal statuses (approved, closed, archived).
- `core.lv('record_status','active')` returns an ID and can be used in column defaults.
- `core.bind_lookup(table, column, type)` adds a trigger so a column only accepts values of its own lookup type.

### Dynamic admin control (three tiers)
1. **Settings** — typed, scoped (global / campus / employee group …), effective-dated.
2. **Rule builder** — `IF conditions THEN actions`; conditions are a JSON tree over facts the system provides; actions come from a developer-maintained catalog (`deduct_days`, `add_allowance`, `require_approval`, `notify`, …).
3. **Formulas** — sandboxed expressions (json-logic / CEL). **No arbitrary code or SQL from admins, ever.**

Safeguards: draft → publish, versions, effective dating, simulation on past data, `rule_evaluation_log` for explainability, frozen snapshots, audit log.

### Workflow, approvals, audit
- One approval engine (`shared.workflow`, `workflow_step`, `approval_request`, `approval_action`) serves requisitions, discounts, leave, loans, result publishing and more. The entity's own status stays in lookups.
- Audit trigger on security / policy tables. Server functions run `SET LOCAL app.user_id = '<id>'` so the actor is recorded.

### Logic placement
- Business logic in **server functions**, not database triggers. Triggers are only for integrity (lookup binding, `updated_at`, audit).

---

## 4. Repository layout

Single app (not a monorepo). Admin UI and local API share one `package.json`.

```
sms/
├─ src/                 # Admin SPA (React + Vite)
├─ server/              # Local IAM API (Neon Auth / Data API stand-in)
├─ schema/              # Versioned SQL (Postgres target)
├─ docs/                # Per-module design notes
├─ start.sh             # Starts API + Vite together
└─ README.md
```

### Generic CRUD engine
Give it an entity config (table, fields, types, required / unique, lookup bindings, permissions) and it renders a **server-paginated** list and a validated form (Zod generated from config). Most master-data screens are configuration, not code.

---

## 5. Modules (26)

| # | Module | Key components | Depends on |
|---|---|---|---|
| **A. Foundation** | | | |
| 1 | **Platform Setup** | Campus, session, wing, class level / offering / section, subject, house, department, designation, geography, lookups, ID sequences, person | — |
| 2 | **Identity & Access** | Neon Auth link, roles, permission matrix, user-role (campus scoped), devices | 1 |
| 3 | **Shared Services** | Settings, rule engine, approval workflow, custom fields, templates, notification queue, file refs, audit log | 1, 2 |
| **B. Front of school** | | | |
| 4 | **Front Office** | Enquiries, visitor book, call log, postal in/out, complaints, gate & temporary passes | 1–3 |
| 5 | **Admission** | Form sale, online application, review, admission test, eligibility & approval, enrolment conversion, waitlist | 1–3, 6 |
| **C. Students & academics** | | | |
| 6 | **Student Management** | Student, guardians, addresses, health, previous schools, yearly enrolment, promotion, clubs, incidents, TC / exit, alumni | 1–3 |
| 7 | **Academic** | Teacher assignments, timetable & substitutions, lesson plans, diary, homework, classwork, submissions, extra classes, group projects | 1, 6, 8 |
| 8 | **Academic Calendar & Events** | Terms, weeks, holidays, **working-day calendars per employee group**, events, notices | 1, 3 |
| 9 | **Attendance** | Student and staff attendance, shifts, admin-set rules (grace, late, half-day, absent) | 6, 8, 19, 20 |
| 10 | **Attendance Devices** | Device registry, person mapping, raw punch log, punch processing | 9 |
| 11 | **Examination & Result** | Exam schedule, tests, configurable assessment schemes, grade scales, marks, report cards (senior / junior / pre-school), publishing | 6, 7, 8 |
| 12 | **Hifz** | Halaqa groups, membership, daily progress, term / month targets, Quran reference tables | 6, 18 |
| **D. Money** | | | |
| 13 | **Fees** | Fee structure, discounts, extra facilities, invoices, fines, dues | 6, 22 |
| 14 | **Payments** | Receipts (cash / bank / online), allocations, gateway transactions, refunds, advances | 13, 15 |
| 15 | **Accounts** | Chart of accounts, fiscal periods, vouchers & journal, cost centers, subledgers, posting rules, petty cash, budgets, bank reconciliation, trial balance / ledger / P&L / balance sheet | 1, 3 |
| 16 | **Inventory & Procurement** | Products, stock ledger, transfers, suppliers, requisition → comparative statement → PO → GRN, store sales | 3, 15 |
| 17 | **Library** | Catalog, copies, members, issue / return, fines | 6, 18 |
| **E. People** | | | |
| 18 | **HR Core** | Employee profile & history, contracts, probation, recruitment, resignation, clearance, letters, evaluations, daily tasks | 1–3 |
| 19 | **Roster & Duty** | Shifts, duty types, roster patterns, assignments, swaps, duty allowances | 8, 18 |
| 20 | **Leave Management** | Leave types, policy per group, **annual leave budget per employee**, application & approval, admin-set rules | 3, 8, 18 |
| 21 | **Payroll & Salary Generator** | Salary structure, components, rule-driven cuts, overtime, bonus, loans, AIT tax, salary run → approve → post to Accounts → payslips | 8, 9, 15, 19, 20 |
| 22 | **Transport** | Routes, checkpoints, drivers, student subscriptions | 6, 13 |
| **F. Outputs** | | | |
| 23 | **Communication** | SMS / push campaigns, announcements | 3 |
| 24 | **Student Portal** | Timetable, homework, results, attendance, notices | 6–11 |
| 25 | **Parent Portal** | Children, dues & online payment, results, attendance, leave / pass / TC requests, complaints | 6–14 |
| 26 | **Reports & Dashboards** | Principal, accounts and HR dashboards; collection, attendance, result analytics | all |

### How the people modules connect
```
Calendar (working days) + Roster (expected duty) + Attendance (actual)
        + Leave (approved absence) + Rules (salary-cut logic)
                         │
                         ▼
                      Payroll ──► Accounts (ledger posting) ──► Payslips (frozen)
```

---

## 6. Delivery process

### Per-module definition of done
1. **Design note** in `docs/` — entities, lookups, statuses, approvals, rules, settings.
2. **Migration** (SQL) + seed lookups.
3. **RLS policies** and grants, plus SQL tests for each role.
4. **Server functions** (only if the module needs them).
5. **Regenerate types.**
6. **UI** — engine config for master data, custom screens for workflows.
7. **Tests** — unit (rules), integration (server functions), E2E for the main flow.
8. **Legacy mapping** — where the old columns and tables go.

### Phases (proposed order — adjustable)

| Phase | Scope | Outcome |
|---|---|---|
| **0** | `neon.ts` (Auth + Data API + Storage + Functions declared), branches, monorepo, Vercel projects + Neon Marketplace integration, CI, RLS layer (`iam.current_user_id()`, `iam.has_permission()`, generated policies) | Secure base, deployable end to end |
| **1** | Modules 1–3 UI: lookup manager, roles & permissions, settings, rule / workflow skeleton | Admin can configure the system |
| **2** | 8 Calendar, 6 Student, 5 Admission, 4 Front Office | Students enrolled |
| **3** | 7 Academic, 9 Attendance, 10 Devices | Daily school operations |
| **4** | 11 Examination & Result | Report cards |
| **5** | 13 Fees, 14 Payments, 15 Accounts | Money in, ledger correct |
| **6** | 18 HR, 19 Roster, 20 Leave, 21 Payroll | Salary sheets generated from rules |
| **7** | 16 Inventory, 17 Library, 12 Hifz, 22 Transport | Support operations |
| **8** | 23 Communication, 24 / 25 Portals, 26 Reports | Parents and students onboarded |
| **9** | Legacy data migration, parallel run, go-live | Cut-over |

Phases 6 and 8 depend on earlier phases by design: Payroll needs Calendar, Attendance, Leave, Rules and Accounts; Portals only consume other modules.

### Environments
- Neon branches: `main` (production), `staging`, and a short-lived branch per pull request. Auth, Data API config, Storage buckets and Functions all branch together with the database via `neon.ts`.
- Vercel: two projects (`admin`, `portal`), each with a Preview deployment per PR. The Vercel ↔ Neon Marketplace integration creates the matching Neon branch and injects `DATABASE_URL` and the Neon Auth keys into that Vercel preview automatically.
- `.env` files never hold a raw Postgres connection string on the frontend side — only the Data API URL and Neon Auth publishable key are public; the pooled connection string (like the one for the `school` database) is used solely by migration tooling and Neon Functions, never bundled into a browser build.

---

## 7. Legacy data migration

- Source: MariaDB dump (`rooh_db`), converted to Postgres.
- Keep `legacy_id` columns on migrated tables so old and new records can be traced.
- Import with `OVERRIDING SYSTEM VALUE` when IDs must be preserved.
- Free-text values become lookups (gender, statuses, fee types); names become IDs (class, section, session).
- **Do not migrate password hashes or push tokens.** Users are re-invited through Neon Auth.
- Each phase's tables are rehearsed on a Neon branch before production.
- Scrub personal and credential data from any dump shared outside the team.

---

## 8. Open decisions and risks

| Item | Why it matters |
|---|---|
| Neon Auth, Data API, Object Storage, Functions are all **beta** (Jul 2026) | Interfaces can change before GA; keep `packages/rules` portable as a fallback (see §2) |
| Phone-number OTP for parents | Neon Auth's phone-number plugin exists but 2FA/MFA is still roadmap — confirm OTP-only login is sufficient, no second factor required |
| Data API and custom schemas | Confirm the API can expose `core`, `iam`, `shared` — otherwise expose them or add views |
| `.rpc()` support | Needed for calling Postgres functions from the client; test early |
| Object Storage region lock | Currently only `aws-us-east-2` (Ohio) — our `school` project is already there; don't move regions without checking this |
| Neon Functions cold start / limits | It's "long-running compute alongside the database", not edge functions — confirm cold-start and timeout behavior for a payroll run before relying on it for large batch jobs |
| Attendance device brand and model | Decides the integration protocol (push, SDK, bridge) |
| Student attendance: daily or per period | Changes table design |
| Accounting depth | Proposed: proper double-entry COA from day one |
| Hostel | Exists only as a fee today; add a module later if needed |
| Realtime | Neon has none; use polling or server-sent events for notifications |

---

## 9. Repository files

| File | Purpose |
|---|---|
| `01_foundation_schema.sql` | Modules 1–3: platform setup, identity & access, shared services (rules, settings, workflow, audit) with lookup / status engine |
| `README.md` | This document |