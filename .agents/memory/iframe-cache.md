---
name: Iframe cache-busting for static assets
description: The Replit preview iframe aggressively caches JS/CSS — fix requires both mtime-based query param versioning and no-cache response headers.
---

# Iframe Cache-Busting

**Rule:** Always add `?v=<mtime>` to static asset URLs AND serve `/static/` paths with `Cache-Control: no-cache, no-store, must-revalidate` headers.

**Why:** The Replit preview iframe caches static JS/CSS aggressively. Without both mechanisms, frontend code changes appear not to take effect — the user sees the old version even after editing the file. This caused repeated user reports of features "not working" when the code was actually correct.

**How to apply:**
- `_asset_version(filename)` → `int(os.path.getmtime(path))` for mtime-based token
- `inject_asset_versions` context processor → exposes `css_v`, `js_v` to all templates
- Templates use: `href="/static/style.css?v={{ css_v }}"` and `src="/static/app.js?v={{ js_v }}"`
- `add_no_cache_for_static` after_request → sets `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` + `Expires: 0` for all `/static/` responses
- Static JS/CSS changes need no server restart — mtime changes automatically update the token
