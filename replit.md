# BrokerApp

A Flask-based property management dashboard for real estate brokers — manage inventory, search listings, and use AI to match WhatsApp client messages to available properties.

## Run & Operate

- `python artifacts/broker-app/app.py` — run BrokerApp Flask server (port 8000)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-set by Replit AI Integrations

## Stack

- Python 3.11, Flask 3.1
- SQLite (broker.db in artifacts/broker-app/)
- OpenAI via Replit AI Integrations (gpt-5-mini for WhatsApp matching)
- Vanilla JS + custom CSS (mobile-friendly, no framework needed)
- pnpm workspaces, Node.js 24, TypeScript 5.9 (for api-server)

## Where things live

- `artifacts/broker-app/app.py` — Flask backend, all routes and AI logic
- `artifacts/broker-app/templates/index.html` — dashboard HTML
- `artifacts/broker-app/static/style.css` — all styles
- `artifacts/broker-app/static/app.js` — frontend JS
- `artifacts/broker-app/broker.db` — SQLite database (auto-created on first run)

## Architecture decisions

- SQLite chosen for simplicity — no Postgres needed for single-broker inventory
- AI matching uses gpt-5-mini for cost efficiency (property matching is a structured task)
- All filtering happens server-side via query params (instant, no debounce needed)
- Flask serves static files directly (no CDN/build step)
- Mobile-first CSS with CSS custom properties for theming

## Product

- **Inventory Management**: Add, edit, delete properties (type, location, size, price, status)
- **Instant Search & Filter**: Search by location/type, filter by status and property type
- **AI WhatsApp Matcher**: Paste a client's WhatsApp message → AI returns ranked matching properties with explanation

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always restart BrokerApp workflow after changes to app.py
- The SQLite DB is at `artifacts/broker-app/broker.db` — delete to reset
- `init_db()` is called at server startup — schema auto-creates on first run

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
