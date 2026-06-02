---
name: Supabase migration pattern
description: How BrokerApp connects to Supabase — service role for DB, anon key for client-side auth reset page, profile trigger.
---

# Supabase Migration Pattern

**Rule:** Server always uses the service role key (`SUPABASE_SERVICE_ROLE_KEY`) for all DB table queries — this bypasses RLS. Every query explicitly includes `.eq("user_id", uid)` to enforce data isolation. RLS policies are a backstop, not the primary enforcement.

**Why:** Flask server can't forward user JWTs per-request easily. Service role + explicit user_id filter is simpler, just as secure, and matches the single-process server model.

**How to apply:**
- `supa()` creates a fresh `create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` each call
- Auth operations (sign_in, sign_up, reset_password_for_email) also use the service role client — works fine
- `SUPABASE_ANON_KEY` is only needed for the client-side reset_password.html (supabase-js CDN reads URL hash fragment to set session and update password)
- Profile auto-creation: SQL trigger `handle_new_user` inserts into `profiles` table on `auth.users` insert — no app-level code needed
- Run `supabase_migration.sql` once in Supabase SQL Editor to create tables + RLS + trigger
- Disable "Confirm email" in Supabase Auth → Providers → Email for single-broker instant login
