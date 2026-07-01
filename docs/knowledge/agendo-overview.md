# Agendo overview

_What agendo is, how it relates to Sling, and the plan for shift creation._

_Last updated: 2026-06-22_

Agendo is an internal **shift-scheduling tool for Duda's customer-support team**.
Support managers (accounts of type `admin`) schedule every support agent's
shifts and sync them to each agent's **Google Calendar**, so agents see their
schedule and protected time is blocked (e.g. an "Unavailable" shift stops
customers from booking meetings during it).

## Sling is the source of truth for shifts today — not agendo

Shifts are created in **Sling** (an external scheduling product) because its UX
is better: copy a day's shifts to another day, choose who to duplicate,
templates, and so on. Agendo reads the Sling calendar and pushes shifts into
people's Google Calendars. The agendo UI shows **two shift views: a Sling view
and an agendo view.** Agendo also has its own native shift creation, but it is
secondary today.

## Plan / intent

Eventually migrate shift creation fully into agendo and retire the Sling
dependency — but only once agendo's scheduling UX catches up to Sling. Until
then both coexist, which is why there are two separate calendar-sync paths (see
[calendar sync paths](agendo-sync-paths.md)).

## Shape of the system

Two services run via docker-compose:

- `calendar-api-backend` — Express (ESM), port 3001
- `calendar-api-frontend` — React + Vite + TypeScript + Tailwind/Radix, port 5173

- **Auth:** Clerk. Account type is `normal` | `admin`, stored on the Mongo
  `User.type` and mirrored in Clerk `publicMetadata.type`. Admin-only API routes
  use an `adminOnly` middleware (which bypasses in `NODE_ENV=development`).
- **Data:** MongoDB via Mongoose. **Supabase** backs a separate AI vector-search
  module (`discovai`). Redis/Upstash is used for caching.
- **External integrations:** the **Sling API** (shift source) and the **Google
  Calendar API** (sync target).

There is no top-level README or CLAUDE.md — this knowledge base is the
orientation.
