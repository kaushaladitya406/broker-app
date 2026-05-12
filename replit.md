# BrokerApp

A Flask-based property management dashboard for real estate brokers — manage inventory, search listings, use AI to match WhatsApp client messages to available properties, track buyers, log follow-ups, and manage inquiries.

## Run & Operate

- `python artifacts/broker-app/app.py` — run BrokerApp Flask server (port 8000)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-set by Replit AI Integrations
- Auth env: `SESSION_SECRET` (set), `BROKER_USERNAME` (default: admin), `BROKER_PASSWORD` (default: broker123)

## Stack

- Python 3.11, Flask 3.1
- SQLite (broker.db in artifacts/broker-app/)
- OpenAI via Replit AI Integrations (gpt-5-mini for WhatsApp matching)
- Vanilla JS + custom CSS (mobile-friendly, no framework needed)
- pnpm workspaces, Node.js 24, TypeScript 5.9 (for api-server)

## Where things live

- `artifacts/broker-app/app.py` — Flask backend, all routes and AI logic
- `artifacts/broker-app/templates/index.html` — dashboard HTML (tabbed)
- `artifacts/broker-app/templates/login.html` — login page
- `artifacts/broker-app/static/style.css` — all styles
- `artifacts/broker-app/static/app.js` — frontend JS
- `artifacts/broker-app/broker.db` — SQLite database (auto-created on first run)

## Architecture decisions

- SQLite chosen for simplicity — no Postgres needed for single-broker inventory
- AI matching uses gpt-5-mini for cost efficiency (property matching is a structured task)
- All filtering happens server-side via query params (instant, no debounce needed)
- Flask serves static files directly (no CDN/build step)
- Mobile-first CSS with CSS custom properties for theming
- Flask session-based auth with SESSION_SECRET; credentials via env vars
- Currency: Rs (Indian Rupee), size: sq ft

## Product

- **Inventory Management**: Add, edit, delete properties (type, location, size in sq ft, price in Rs, status)
- **Instant Search & Filter**: Search by location/type, filter by status and property type
- **AI WhatsApp Matcher**: Paste a client's WhatsApp message → AI returns ranked matching properties with explanation; save result as inquiry
- **Client Inquiries**: Save matched searches as inquiries with client name, status, notes
- **Buyers Database**: Save buyer requirements (name, phone, property type, location, budget range); auto-match alert when a new property is added
- **Follow-ups**: Log reminders with client name, note, reminder date; overdue follow-ups shown in red at top with count badge on tab
- **Login**: Simple session auth; default admin/broker123, configurable via env vars

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always restart BrokerApp workflow after changes to app.py
- The SQLite DB is at `artifacts/broker-app/broker.db` — delete to reset
- `init_db()` is called at server startup — schema auto-creates on first run
- POST /api/properties returns `{property, buyer_matches}` — frontend checks buyer_matches and shows alert modal
- Follow-up overdue = status=="Pending" AND reminder_date < TODAY (ISO date comparison)
- Login credentials: BROKER_USERNAME (default: admin) / BROKER_PASSWORD (default: broker123) env vars

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
