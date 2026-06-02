# BrokerApp

A Flask-based property management dashboard for real estate brokers — manage inventory, search listings, use AI to match WhatsApp client messages to available properties, track buyers, log follow-ups, and manage inquiries.

## Run & Operate

- `python artifacts/broker-app/app.py` — run BrokerApp Flask server (port 8000)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-set by Replit AI Integrations
- Auth env: `SESSION_SECRET` (set), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Stack

- Python 3.11, Flask 3.1, supabase-py 2.x
- Supabase (Postgres + Auth) — replaces SQLite
- OpenAI via Replit AI Integrations (gpt-5-mini for AI matching/parsing)
- Vanilla JS + custom CSS (mobile-friendly, no framework needed)
- pnpm workspaces, Node.js 24, TypeScript 5.9 (for api-server)

## Where things live

- `artifacts/broker-app/app.py` — Flask backend, all routes and AI logic
- `artifacts/broker-app/templates/index.html` — dashboard HTML (tabbed)
- `artifacts/broker-app/templates/login.html` — email+password login
- `artifacts/broker-app/templates/signup.html` — new broker registration
- `artifacts/broker-app/templates/forgot_password.html` — password reset request
- `artifacts/broker-app/templates/reset_password.html` — password reset (uses supabase-js CDN)
- `artifacts/broker-app/static/style.css` — all styles
- `artifacts/broker-app/static/app.js` — frontend JS
- `artifacts/broker-app/supabase_migration.sql` — run once in Supabase SQL Editor

## Architecture decisions

- Supabase (Postgres + Auth) chosen for multi-user support — each broker has isolated data
- Server uses service role key for all DB queries (bypasses RLS), explicit `user_id` filtering on every query
- RLS policies set as a security backstop (all tables policy: `auth.uid() = user_id`)
- Flask session stores user_id + user_email + user_name after Supabase login; 24h session lifetime
- Supabase Auth handles email/password login, signup, forgot-password email
- Password reset uses supabase-js CDN (client-side) on reset_password.html to handle URL hash token
- `/api/settings` GET/PUT maps to `profiles` table (broker_name→full_name, broker_phone→phone, broker_tagline→tagline) for frontend compatibility
- Asset cache-busting via `?v={{ css_v }}`/`?v={{ js_v }}` (file mtime) + no-cache headers on /static/
- Currency: Rs (Indian Rupee), size: sq ft
- Properties: `area_sqft` column in Supabase; API response includes `size` alias for frontend compatibility

## Product

- **Inventory Management**: Add, edit, delete properties (type, location, size in sq ft, price in Rs, status). Property statuses: Available, Reserved, Under Negotiation, Sold, Rented, Withdrawn (color-coded badges). Quick-action "Status" button opens a menu; choosing Sold/Rented prompts to link a client
- **Instant Search & Filter**: Search by location/type, filter by status and property type
- **AI WhatsApp Matcher**: Paste a client's WhatsApp message → AI returns ranked matching properties with explanation; save result as Client (New Lead status)
- **Clients**: Unified buyer+inquiry database. Statuses: Looking (serious buyer), New Lead (inquiry), Negotiating, Deal Done, Not Interested. Filter pills, client cards with WhatsApp button
- **Auto-Match Alert**: When a property is added, Looking clients with matching requirements trigger a popup with WhatsApp links
- **Follow-ups**: Log reminders with client name, phone, note, reminder date; overdue follow-ups shown in red at top with count badge on tab. Cards collapsed by default; tap to expand
- **Settings**: Broker profile (name, phone, tagline) + account email shown (read-only). Changes sync to Supabase profiles table
- **Auth**: Email + password login; signup page for new brokers; forgot/reset password via Supabase email

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always restart BrokerApp workflow after changes to app.py
- Static assets (`/static/*.js`, `/static/*.css`) are cache-busted via `?v={{ css_v }}`/`?v={{ js_v }}` (file mtime, injected by `inject_asset_versions` context processor) AND served with `no-cache` headers via `add_no_cache_for_static` after_request. This is required because the preview iframe aggressively caches static JS/CSS — without it, frontend changes appear not to take effect
- Run `artifacts/broker-app/supabase_migration.sql` in Supabase SQL Editor before first use — creates tables, RLS, and the profile auto-create trigger
- Supabase email confirmation: disable "Confirm email" in Supabase Auth → Providers → Email for instant login after signup (recommended for single-broker use)
- `supa()` creates a fresh supabase client per call using service role key — safe for multi-request Flask but slightly wasteful; module-level client would be more efficient if needed
- Property `closed_at` (TEXT, ISO date) is set when status becomes Sold/Rented; "Deals This Month" counts properties whose `closed_at` falls in the current calendar month
- `PATCH /api/properties/<id>/status` body `{status, link_client_id}` — if link_client_id set and status is Sold/Rented, that client becomes Deal Done
- Client status values: Looking / New Lead / Negotiating / Deal Done / Not Interested
- Password reset flow uses supabase-js from CDN (jsdelivr) on reset_password.html — reads URL hash fragment and calls supabase.auth.updateUser client-side

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
