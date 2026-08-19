# Duet

A responsive couple dashboard prototype built with React and Vite.

## Run locally

```bash
npm install
npm run dev
```

The app includes a shared home dashboard, full calendar and event management, wishlist CRUD and filters, memories, shared tasks, couple settings, invitation sharing, two personal themes, responsive five-tab mobile navigation, anonymous partner pairing, and Supabase realtime data.

## Connect Supabase

1. Open your Supabase project and run `supabase/schema.sql` in **SQL Editor**.
2. Copy `.env.example` to `.env`.
3. In Supabase **Project Settings → API**, copy the Project URL and publishable/anon key into `.env`.
4. Restart `npm run dev`.

## Simple onboarding

Duet uses Supabase anonymous authentication. A user chooses **Create** or **Join**, enters their name, and stays connected on that browser without an email or password. Creators can copy a private invitation link from the sidebar. If browser data is cleared, anonymous access cannot currently be recovered; optional recovery will be added later.

Never place the Supabase service-role key in this front-end project. The publishable/anon key is intended for browser use and is protected by the row-level security policies in the schema.
