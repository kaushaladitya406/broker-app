import os
import json
import sqlite3
import functools
from flask import Flask, request, jsonify, render_template, g, session, redirect, url_for

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-change-me")
DB_PATH = os.path.join(os.path.dirname(__file__), "broker.db")

BROKER_USERNAME = os.environ.get("BROKER_USERNAME", "admin")
BROKER_PASSWORD = os.environ.get("BROKER_PASSWORD", "broker123")

UNIT_TO_SQFT = {
    "Sq Ft": 1,
    "Sq Yards": 9,
    "Gaj": 9,
    "Marla": 272.25,
    "Kanal": 5445,
    "Bigha": 9070,
}
VALID_UNITS = list(UNIT_TO_SQFT.keys())
VALID_CONFIGS = ["1BHK", "2BHK", "3BHK", "4BHK+", "Shop/Office", "Plot", "Other"]

def to_sqft(value, unit):
    return round(float(value) * UNIT_TO_SQFT.get(unit, 1), 2)


# ─── DB helpers ────────────────────────────────────────────────────────────────

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


SEED_PROPERTIES = [
    ("Apartment", "Sector 17, Chandigarh",   "3BHK",       3,   "Marla",  6500000,  "Available"),
    ("Apartment", "Phase 7, Mohali",          "2BHK",       2,   "Marla",  4200000,  "Available"),
    ("House",     "Sector 8, Patiala",        "4BHK+",      4,   "Marla",  15000000, "Available"),
    ("Apartment", "Urban Estate, Patiala",    "1BHK",       1,   "Marla",  1800000,  "Rented"),
    ("Land",      "Sector 20, Panchkula",     "Plot",       10,  "Marla",  9500000,  "Available"),
    ("Apartment", "Zirakpur",                 "2BHK",       2,   "Marla",  3800000,  "Available"),
    ("Shop",      "Model Town, Ludhiana",     "Shop/Office",200, "Sq Ft",  8000000,  "Available"),
    ("House",     "Nabha Road, Patiala",      "3BHK",       5,   "Marla",  5500000,  "Available"),
    ("Apartment", "Sector 32, Chandigarh",    "2BHK",       2,   "Marla",  4800000,  "Reserved"),
    ("House",     "Sector 11, Mohali",        "4BHK+",      1,   "Kanal",  22000000, "Available"),
]


def _seed_properties(db):
    for prop_type, location, config, area_val, area_unit, price, status in SEED_PROPERTIES:
        sqft = to_sqft(area_val, area_unit)
        db.execute(
            "INSERT INTO properties (property_type, location, configuration, area_value, area_unit, size, price, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (prop_type, location, config, float(area_val), area_unit, sqft, float(price), status)
        )
    db.commit()


def init_db():
    db = sqlite3.connect(DB_PATH)

    # Check current schema
    existing_tables = [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='properties'"
    ).fetchall()]
    existing_cols = [r[1] for r in db.execute("PRAGMA table_info(properties)").fetchall()] if existing_tables else []

    # Create properties table (new installs)
    db.execute("""
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_type TEXT NOT NULL,
            location TEXT NOT NULL,
            configuration TEXT NOT NULL DEFAULT 'Other',
            area_value REAL NOT NULL DEFAULT 0,
            area_unit TEXT NOT NULL DEFAULT 'Sq Ft',
            size REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'Available',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    if existing_cols and 'configuration' not in existing_cols:
        # Old schema — add missing columns, clear stale seed data, re-seed
        for stmt in [
            "ALTER TABLE properties ADD COLUMN configuration TEXT DEFAULT 'Other'",
            "ALTER TABLE properties ADD COLUMN area_value REAL DEFAULT 0",
            "ALTER TABLE properties ADD COLUMN area_unit TEXT DEFAULT 'Sq Ft'",
        ]:
            try:
                db.execute(stmt)
            except Exception:
                pass
        db.execute("DELETE FROM properties")
        _seed_properties(db)
    elif not existing_cols:
        # Fresh install — seed
        _seed_properties(db)

    db.execute("""
        CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name TEXT NOT NULL,
            whatsapp_message TEXT NOT NULL,
            matched_property_ids TEXT NOT NULL DEFAULT '[]',
            notes TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'New',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS buyers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            property_type TEXT DEFAULT '',
            location TEXT DEFAULT '',
            budget_min REAL DEFAULT 0,
            budget_max REAL DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS followups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name TEXT NOT NULL,
            note TEXT NOT NULL,
            reminder_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.commit()
    db.close()


# ─── Auth ────────────────────────────────────────────────────────────────────

def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("logged_in"):
        return redirect("/")
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        if username == BROKER_USERNAME and password == BROKER_PASSWORD:
            session["logged_in"] = True
            session["username"] = username
            return redirect("/")
        else:
            error = "Invalid username or password."
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


# ─── Pages ──────────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def index():
    return render_template("index.html", username=session.get("username", ""))


# ─── Properties ─────────────────────────────────────────────────────────────

def find_matching_buyers(db, prop):
    buyers = [dict(r) for r in db.execute("SELECT * FROM buyers ORDER BY created_at DESC").fetchall()]
    matches = []
    for b in buyers:
        if b["property_type"] and b["property_type"] != prop["property_type"]:
            continue
        if b["location"] and b["location"].strip().lower() not in prop["location"].lower():
            continue
        price = prop["price"]
        if b["budget_min"] and b["budget_min"] > 0 and price < b["budget_min"]:
            continue
        if b["budget_max"] and b["budget_max"] > 0 and price > b["budget_max"]:
            continue
        matches.append(b)
    return matches


@app.route("/api/properties", methods=["GET"])
@login_required
def get_properties():
    db = get_db()
    q = request.args.get("q", "").strip().lower()
    status_filter = request.args.get("status", "").strip()
    type_filter = request.args.get("type", "").strip()
    config_filter = request.args.get("config", "").strip()

    sql = "SELECT * FROM properties WHERE 1=1"
    params = []

    if q:
        sql += " AND (LOWER(location) LIKE ? OR LOWER(property_type) LIKE ? OR LOWER(configuration) LIKE ?)"
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
    if status_filter:
        sql += " AND status = ?"
        params.append(status_filter)
    if type_filter:
        sql += " AND property_type = ?"
        params.append(type_filter)
    if config_filter:
        sql += " AND configuration = ?"
        params.append(config_filter)

    sql += " ORDER BY created_at DESC"
    rows = db.execute(sql, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/properties", methods=["POST"])
@login_required
def add_property():
    data = request.get_json()
    required = ["property_type", "location", "configuration", "area_value", "area_unit", "price", "status"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    sqft = to_sqft(data["area_value"], data["area_unit"])
    db = get_db()
    cursor = db.execute(
        "INSERT INTO properties (property_type, location, configuration, area_value, area_unit, size, price, status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (data["property_type"], data["location"], data["configuration"],
         float(data["area_value"]), data["area_unit"], sqft,
         float(data["price"]), data["status"])
    )
    db.commit()
    row = db.execute("SELECT * FROM properties WHERE id = ?", (cursor.lastrowid,)).fetchone()
    prop = dict(row)
    buyer_matches = find_matching_buyers(db, prop)
    return jsonify({"property": prop, "buyer_matches": buyer_matches}), 201


@app.route("/api/properties/<int:prop_id>", methods=["DELETE"])
@login_required
def delete_property(prop_id):
    db = get_db()
    db.execute("DELETE FROM properties WHERE id = ?", (prop_id,))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/properties/<int:prop_id>", methods=["PUT"])
@login_required
def update_property(prop_id):
    data = request.get_json()
    sqft = to_sqft(data["area_value"], data["area_unit"])
    db = get_db()
    db.execute(
        "UPDATE properties SET property_type=?, location=?, configuration=?, area_value=?, area_unit=?, size=?, price=?, status=? WHERE id=?",
        (data["property_type"], data["location"], data["configuration"],
         float(data["area_value"]), data["area_unit"], sqft,
         float(data["price"]), data["status"], prop_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM properties WHERE id = ?", (prop_id,)).fetchone()
    return jsonify(dict(row))


# ─── Inquiries ──────────────────────────────────────────────────────────────

@app.route("/api/inquiries", methods=["GET"])
@login_required
def get_inquiries():
    db = get_db()
    status_filter = request.args.get("status", "").strip()
    sql = "SELECT * FROM inquiries WHERE 1=1"
    params = []
    if status_filter:
        sql += " AND status = ?"
        params.append(status_filter)
    sql += " ORDER BY created_at DESC"
    rows = db.execute(sql, params).fetchall()
    result = []
    for r in rows:
        row = dict(r)
        row["matched_property_ids"] = json.loads(row["matched_property_ids"])
        result.append(row)
    return jsonify(result)


@app.route("/api/inquiries", methods=["POST"])
@login_required
def add_inquiry():
    data = request.get_json()
    if not all(k in data for k in ["client_name", "whatsapp_message"]):
        return jsonify({"error": "Missing required fields"}), 400
    matched_ids = json.dumps(data.get("matched_property_ids", []))
    db = get_db()
    cursor = db.execute(
        "INSERT INTO inquiries (client_name, whatsapp_message, matched_property_ids, notes, status) VALUES (?, ?, ?, ?, ?)",
        (data["client_name"], data["whatsapp_message"], matched_ids,
         data.get("notes", ""), data.get("status", "New"))
    )
    db.commit()
    row = db.execute("SELECT * FROM inquiries WHERE id = ?", (cursor.lastrowid,)).fetchone()
    result = dict(row)
    result["matched_property_ids"] = json.loads(result["matched_property_ids"])
    return jsonify(result), 201


@app.route("/api/inquiries/<int:inq_id>", methods=["DELETE"])
@login_required
def delete_inquiry(inq_id):
    db = get_db()
    db.execute("DELETE FROM inquiries WHERE id = ?", (inq_id,))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/inquiries/<int:inq_id>", methods=["PUT"])
@login_required
def update_inquiry(inq_id):
    data = request.get_json()
    db = get_db()
    db.execute(
        "UPDATE inquiries SET client_name=?, notes=?, status=? WHERE id=?",
        (data["client_name"], data.get("notes", ""), data["status"], inq_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM inquiries WHERE id = ?", (inq_id,)).fetchone()
    result = dict(row)
    result["matched_property_ids"] = json.loads(result["matched_property_ids"])
    return jsonify(result)


# ─── Buyers ─────────────────────────────────────────────────────────────────

@app.route("/api/buyers", methods=["GET"])
@login_required
def get_buyers():
    db = get_db()
    rows = db.execute("SELECT * FROM buyers ORDER BY created_at DESC").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/buyers", methods=["POST"])
@login_required
def add_buyer():
    data = request.get_json()
    if not data.get("name") or not data.get("phone"):
        return jsonify({"error": "Name and phone are required"}), 400
    db = get_db()
    cursor = db.execute(
        "INSERT INTO buyers (name, phone, property_type, location, budget_min, budget_max, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (data["name"], data["phone"], data.get("property_type", ""),
         data.get("location", ""), float(data.get("budget_min") or 0),
         float(data.get("budget_max") or 0), data.get("notes", ""))
    )
    db.commit()
    row = db.execute("SELECT * FROM buyers WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/buyers/<int:buyer_id>", methods=["DELETE"])
@login_required
def delete_buyer(buyer_id):
    db = get_db()
    db.execute("DELETE FROM buyers WHERE id = ?", (buyer_id,))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/buyers/<int:buyer_id>", methods=["PUT"])
@login_required
def update_buyer(buyer_id):
    data = request.get_json()
    db = get_db()
    db.execute(
        "UPDATE buyers SET name=?, phone=?, property_type=?, location=?, budget_min=?, budget_max=?, notes=? WHERE id=?",
        (data["name"], data["phone"], data.get("property_type", ""),
         data.get("location", ""), float(data.get("budget_min") or 0),
         float(data.get("budget_max") or 0), data.get("notes", ""), buyer_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM buyers WHERE id = ?", (buyer_id,)).fetchone()
    return jsonify(dict(row))


# ─── Follow-ups ─────────────────────────────────────────────────────────────

@app.route("/api/followups", methods=["GET"])
@login_required
def get_followups():
    db = get_db()
    rows = db.execute("SELECT * FROM followups ORDER BY reminder_date ASC, created_at DESC").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/followups", methods=["POST"])
@login_required
def add_followup():
    data = request.get_json()
    if not data.get("client_name") or not data.get("note") or not data.get("reminder_date"):
        return jsonify({"error": "client_name, note, and reminder_date are required"}), 400
    db = get_db()
    cursor = db.execute(
        "INSERT INTO followups (client_name, note, reminder_date, status) VALUES (?, ?, ?, ?)",
        (data["client_name"], data["note"], data["reminder_date"], data.get("status", "Pending"))
    )
    db.commit()
    row = db.execute("SELECT * FROM followups WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/followups/<int:fu_id>", methods=["DELETE"])
@login_required
def delete_followup(fu_id):
    db = get_db()
    db.execute("DELETE FROM followups WHERE id = ?", (fu_id,))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/followups/<int:fu_id>", methods=["PUT"])
@login_required
def update_followup(fu_id):
    data = request.get_json()
    db = get_db()
    db.execute(
        "UPDATE followups SET client_name=?, note=?, reminder_date=?, status=? WHERE id=?",
        (data["client_name"], data["note"], data["reminder_date"], data["status"], fu_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM followups WHERE id = ?", (fu_id,)).fetchone()
    return jsonify(dict(row))


# ─── AI Parse Property ──────────────────────────────────────────────────────

@app.route("/api/parse-property", methods=["POST"])
@login_required
def parse_property():
    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400

    from openai import OpenAI
    client = OpenAI(
        base_url=os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL"),
        api_key=os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY"),
    )

    units_list = ", ".join(VALID_UNITS)
    configs_list = ", ".join(VALID_CONFIGS)

    prompt = f"""You are a real estate data extraction assistant in India (Punjab region). Extract property details from this plain-text description:

"{text}"

Return a JSON object with exactly these fields:
- "property_type": one of exactly: Apartment, House, Villa, Office, Shop, Land, Warehouse
  (flat/BHK → Apartment; kothi/makan → House; plot/land → Land; dukan/shop → Shop; godown → Warehouse)
- "configuration": one of exactly: {configs_list}
  (1BHK/2BHK/3BHK/4BHK+ based on bedroom count; shop/office/commercial → Shop/Office; plot/land → Plot; if unclear → Other)
- "area_value": numeric value of the area (just the number)
- "area_unit": one of exactly: {units_list}
  (sq ft/sqft → Sq Ft; sq yard/sq yards → Sq Yards; gaj → Gaj; marla → Marla; kanal → Kanal; bigha → Bigha)
- "price": numeric value in Rs
  (convert: "lakh" = 100000, "crore" = 10000000; if monthly rent mentioned, use that number directly)
- "status": one of exactly: Available, Rented, Sold, Reserved
  (rent/for rent/monthly → Rented; sold/bikya → Sold; booked/reserved → Reserved; default → Available)
- "notes": a brief 1-line note about any assumptions made (empty string if all was clear)

Conversion context (Punjab standard):
- 1 Marla = 272.25 Sq Ft, 1 Kanal = 5445 Sq Ft, 1 Bigha = 9070 Sq Ft, 1 Sq Yard = 9 Sq Ft, 1 Gaj = 9 Sq Ft

Example: "5 marla plot Sector 22 Chandigarh 25 lakh" →
{{"property_type": "Land", "configuration": "Plot", "area_value": 5, "area_unit": "Marla", "price": 2500000, "status": "Available", "notes": ""}}

Return ONLY valid JSON, no markdown, no extra text."""

    response = client.chat.completions.create(
        model="gpt-5-mini",
        max_completion_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        import re
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            return jsonify({"error": "Could not parse AI response. Please try rephrasing."}), 500

    valid_types = {"Apartment", "House", "Villa", "Office", "Shop", "Land", "Warehouse"}
    if result.get("property_type") not in valid_types:
        result["property_type"] = "Apartment"
    if result.get("configuration") not in set(VALID_CONFIGS):
        result["configuration"] = "Other"
    if result.get("area_unit") not in set(VALID_UNITS):
        result["area_unit"] = "Sq Ft"
    if result.get("status") not in {"Available", "Rented", "Sold", "Reserved"}:
        result["status"] = "Available"

    result["size_sqft"] = to_sqft(result.get("area_value", 0), result.get("area_unit", "Sq Ft"))
    return jsonify(result)


# ─── AI Match ───────────────────────────────────────────────────────────────

@app.route("/api/match", methods=["POST"])
@login_required
def match_properties():
    data = request.get_json()
    message = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "No message provided"}), 400

    db = get_db()
    rows = db.execute("SELECT * FROM properties ORDER BY created_at DESC").fetchall()
    inventory = [dict(r) for r in rows]

    if not inventory:
        return jsonify({"matches": [], "summary": "No properties in inventory to match against."})

    def area_display(p):
        v = p.get("area_value", 0)
        u = p.get("area_unit", "Sq Ft")
        sqft = p.get("size", 0)
        if u == "Sq Ft":
            return f"{v:g} Sq Ft"
        return f"{v:g} {u} ({sqft:g} Sq Ft)"

    inventory_text = "\n".join([
        f"ID {p['id']}: {p['configuration']} {p['property_type']} in {p['location']}, "
        f"{area_display(p)}, Rs {p['price']:,.0f}, Status: {p['status']}"
        for p in inventory
    ])

    from openai import OpenAI
    client = OpenAI(
        base_url=os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL"),
        api_key=os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY"),
    )

    prompt = f"""You are a real estate broker assistant in India. A client sent this WhatsApp message:

"{message}"

Here is the current property inventory:
{inventory_text}

Analyze the client's request and return a JSON object with:
1. "matches": array of property IDs that best match the client's requirements (most relevant first, max 5)
2. "summary": a brief natural-language explanation of what the client is looking for and why you selected these properties

Return ONLY valid JSON, no markdown, no extra text."""

    response = client.chat.completions.create(
        model="gpt-5-mini",
        max_completion_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        import re
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = {"matches": [], "summary": "Could not parse AI response."}

    matched_ids = result.get("matches", [])
    matched_props = [p for p in inventory if p["id"] in matched_ids]
    matched_props.sort(key=lambda p: matched_ids.index(p["id"]) if p["id"] in matched_ids else 999)

    return jsonify({
        "matches": matched_props,
        "matched_ids": matched_ids,
        "summary": result.get("summary", ""),
    })


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=False)
