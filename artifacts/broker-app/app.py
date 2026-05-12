import os
import json
import sqlite3
from flask import Flask, request, jsonify, render_template, g

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), "broker.db")


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


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute("""
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_type TEXT NOT NULL,
            location TEXT NOT NULL,
            size REAL NOT NULL,
            price REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'Available',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.commit()
    db.close()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/properties", methods=["GET"])
def get_properties():
    db = get_db()
    q = request.args.get("q", "").strip().lower()
    status_filter = request.args.get("status", "").strip()
    type_filter = request.args.get("type", "").strip()

    sql = "SELECT * FROM properties WHERE 1=1"
    params = []

    if q:
        sql += " AND (LOWER(location) LIKE ? OR LOWER(property_type) LIKE ?)"
        params.extend([f"%{q}%", f"%{q}%"])
    if status_filter:
        sql += " AND status = ?"
        params.append(status_filter)
    if type_filter:
        sql += " AND property_type = ?"
        params.append(type_filter)

    sql += " ORDER BY created_at DESC"
    rows = db.execute(sql, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/properties", methods=["POST"])
def add_property():
    data = request.get_json()
    required = ["property_type", "location", "size", "price", "status"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    db = get_db()
    cursor = db.execute(
        "INSERT INTO properties (property_type, location, size, price, status) VALUES (?, ?, ?, ?, ?)",
        (data["property_type"], data["location"], float(data["size"]), float(data["price"]), data["status"])
    )
    db.commit()
    row = db.execute("SELECT * FROM properties WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/properties/<int:prop_id>", methods=["DELETE"])
def delete_property(prop_id):
    db = get_db()
    db.execute("DELETE FROM properties WHERE id = ?", (prop_id,))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/properties/<int:prop_id>", methods=["PUT"])
def update_property(prop_id):
    data = request.get_json()
    db = get_db()
    db.execute(
        "UPDATE properties SET property_type=?, location=?, size=?, price=?, status=? WHERE id=?",
        (data["property_type"], data["location"], float(data["size"]), float(data["price"]), data["status"], prop_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM properties WHERE id = ?", (prop_id,)).fetchone()
    return jsonify(dict(row))


@app.route("/api/match", methods=["POST"])
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

    inventory_text = "\n".join([
        f"ID {p['id']}: {p['property_type']} in {p['location']}, {p['size']} sqm, "
        f"${p['price']:,.0f}, Status: {p['status']}"
        for p in inventory
    ])

    from openai import OpenAI
    client = OpenAI(
        base_url=os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL"),
        api_key=os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY"),
    )

    prompt = f"""You are a real estate broker assistant. A client sent this WhatsApp message:

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
        "summary": result.get("summary", ""),
    })


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=False)
