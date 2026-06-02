import os
import json
import functools
import re as _re
from datetime import date, timedelta
from flask import Flask, request, jsonify, render_template, session, redirect

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-change-me")
app.permanent_session_lifetime = timedelta(hours=24)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

from supabase import create_client

def supa():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# ─── Asset versioning & cache headers ────────────────────────────────────────

def _asset_version(filename):
    try:
        return int(os.path.getmtime(os.path.join(STATIC_DIR, filename)))
    except OSError:
        return 0


@app.context_processor
def inject_asset_versions():
    return {
        "css_v": _asset_version("style.css"),
        "js_v": _asset_version("app.js"),
        "supabase_url": SUPABASE_URL,
        "supabase_anon_key": SUPABASE_ANON_KEY,
    }


@app.after_request
def add_no_cache_for_static(response):
    if request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# ─── Constants ───────────────────────────────────────────────────────────────

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
VALID_PROPERTY_STATUSES = ["Available", "Reserved", "Under Negotiation", "Sold", "Rented", "Withdrawn"]
CLOSED_PROPERTY_STATUSES = ("Sold", "Rented")


def to_sqft(value, unit):
    return round(float(value) * UNIT_TO_SQFT.get(unit, 1), 2)


def _resolve_closed_at(status, existing_closed_at):
    if status in CLOSED_PROPERTY_STATUSES:
        return existing_closed_at or date.today().isoformat()
    return None


def enrich_property(p):
    """Add backward-compat 'size' alias for area_sqft."""
    if p:
        p["size"] = p.get("area_sqft", 0)
    return p


# ─── Auth ────────────────────────────────────────────────────────────────────

def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated


def current_user_id():
    return session.get("user_id")


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("user_id"):
        return redirect("/")
    error = None
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "").strip()
        try:
            sb = supa()
            response = sb.auth.sign_in_with_password({"email": email, "password": password})
            user = response.user
            if user:
                session.permanent = True
                session["user_id"] = user.id
                session["user_email"] = user.email
                meta = user.user_metadata or {}
                session["user_name"] = meta.get("full_name") or email.split("@")[0]
                return redirect("/")
            else:
                error = "Invalid email or password."
        except Exception as e:
            msg = str(e).lower()
            if "invalid" in msg or "credentials" in msg or "password" in msg:
                error = "Invalid email or password."
            elif "email not confirmed" in msg:
                error = "Please confirm your email address first, then try logging in."
            else:
                error = "Login failed. Please try again."
    return render_template("login.html", error=error)


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if session.get("user_id"):
        return redirect("/")
    error = None
    success = None
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "").strip()
        if not name or not email or not password:
            error = "All fields are required."
        elif len(password) < 6:
            error = "Password must be at least 6 characters."
        else:
            try:
                sb = supa()
                response = sb.auth.sign_up({
                    "email": email,
                    "password": password,
                    "options": {"data": {"full_name": name}},
                })
                user = response.user
                if user:
                    success = "Account created! You can now sign in."
                else:
                    error = "Signup failed. Please try again."
            except Exception as e:
                msg = str(e).lower()
                if "already" in msg or "exists" in msg or "registered" in msg:
                    error = "An account with this email already exists."
                else:
                    error = f"Signup failed: {str(e)}"
    return render_template("signup.html", error=error, success=success)


@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    sent = False
    error = None
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        if not email:
            error = "Please enter your email address."
        else:
            try:
                redirect_url = request.url_root.rstrip("/") + "/reset-password"
                supa().auth.reset_password_for_email(email, {"redirect_to": redirect_url})
                sent = True
            except Exception as e:
                error = f"Could not send reset email: {str(e)}"
    return render_template("forgot_password.html", sent=sent, error=error)


@app.route("/reset-password")
def reset_password():
    return render_template("reset_password.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


# ─── Pages ───────────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def index():
    return render_template(
        "index.html",
        user_email=session.get("user_email", ""),
        user_name=session.get("user_name", ""),
    )


# ─── Properties ──────────────────────────────────────────────────────────────

def find_matching_buyers(user_id, prop):
    """Return Looking clients whose requirements match the given property."""
    result = supa().table("clients").select("*").eq("user_id", user_id).eq("status", "Looking").execute()
    buyers = result.data or []
    matches = []
    for b in buyers:
        if b.get("property_type") and b["property_type"] != prop["property_type"]:
            continue
        if b.get("configuration") and b["configuration"] != prop.get("configuration"):
            continue
        if b.get("location") and b["location"].strip().lower() not in prop["location"].lower():
            continue
        price = float(prop["price"])
        if b.get("budget_min") and float(b["budget_min"]) > 0 and price < float(b["budget_min"]):
            continue
        if b.get("budget_max") and float(b["budget_max"]) > 0 and price > float(b["budget_max"]):
            continue
        matches.append(b)
    return matches


def find_matching_properties(user_id, client):
    """Return Available properties that match the given client's requirements."""
    result = supa().table("properties").select("*").eq("user_id", user_id).eq("status", "Available").execute()
    props = [enrich_property(r) for r in (result.data or [])]
    matches = []
    for p in props:
        if client.get("property_type") and client["property_type"] != p["property_type"]:
            continue
        if client.get("configuration") and client["configuration"] != p.get("configuration"):
            continue
        if client.get("location") and client["location"].strip().lower() not in p["location"].lower():
            continue
        price = float(p["price"])
        if client.get("budget_min") and float(client["budget_min"]) > 0 and price < float(client["budget_min"]):
            continue
        if client.get("budget_max") and float(client["budget_max"]) > 0 and price > float(client["budget_max"]):
            continue
        matches.append(p)
    return matches


@app.route("/api/properties", methods=["GET"])
@login_required
def get_properties():
    uid = current_user_id()
    q = request.args.get("q", "").strip().lower()
    status_filter = request.args.get("status", "").strip()
    type_filter = request.args.get("type", "").strip()
    config_filter = request.args.get("config", "").strip()

    result = supa().table("properties").select("*").eq("user_id", uid).order("created_at", desc=True).execute()
    rows = result.data or []

    if q:
        rows = [r for r in rows if
                q in (r.get("location") or "").lower() or
                q in (r.get("property_type") or "").lower() or
                q in (r.get("configuration") or "").lower()]
    if status_filter:
        rows = [r for r in rows if r.get("status") == status_filter]
    if type_filter:
        rows = [r for r in rows if r.get("property_type") == type_filter]
    if config_filter:
        rows = [r for r in rows if r.get("configuration") == config_filter]

    return jsonify([enrich_property(r) for r in rows])


@app.route("/api/properties", methods=["POST"])
@login_required
def add_property():
    uid = current_user_id()
    data = request.get_json()
    required = ["property_type", "location", "configuration", "area_value", "area_unit", "price", "status"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400
    if data["status"] not in VALID_PROPERTY_STATUSES:
        return jsonify({"error": "Invalid status"}), 400

    sqft = to_sqft(data["area_value"], data["area_unit"])
    closed_at = date.today().isoformat() if data["status"] in CLOSED_PROPERTY_STATUSES else None
    row_data = {
        "user_id": uid,
        "property_type": data["property_type"],
        "location": data["location"],
        "configuration": data["configuration"],
        "area_value": float(data["area_value"]),
        "area_unit": data["area_unit"],
        "area_sqft": sqft,
        "price": float(data["price"]),
        "status": data["status"],
        "notes": data.get("notes", ""),
        "closed_at": closed_at,
    }
    result = supa().table("properties").insert(row_data).execute()
    prop = enrich_property(result.data[0])
    buyer_matches = find_matching_buyers(uid, prop)
    return jsonify({"property": prop, "buyer_matches": buyer_matches}), 201


@app.route("/api/properties/<int:prop_id>", methods=["DELETE"])
@login_required
def delete_property(prop_id):
    uid = current_user_id()
    supa().table("properties").delete().eq("id", prop_id).eq("user_id", uid).execute()
    return jsonify({"success": True})


@app.route("/api/properties/<int:prop_id>", methods=["PUT"])
@login_required
def update_property(prop_id):
    uid = current_user_id()
    data = request.get_json()
    if data.get("status") not in VALID_PROPERTY_STATUSES:
        return jsonify({"error": "Invalid status"}), 400

    sqft = to_sqft(data["area_value"], data["area_unit"])
    existing_result = supa().table("properties").select("closed_at").eq("id", prop_id).eq("user_id", uid).execute()
    existing_closed = (existing_result.data[0].get("closed_at") if existing_result.data else None)
    closed_at = _resolve_closed_at(data["status"], existing_closed)

    update_data = {
        "property_type": data["property_type"],
        "location": data["location"],
        "configuration": data["configuration"],
        "area_value": float(data["area_value"]),
        "area_unit": data["area_unit"],
        "area_sqft": sqft,
        "price": float(data["price"]),
        "status": data["status"],
        "notes": data.get("notes", ""),
        "closed_at": closed_at,
    }
    result = supa().table("properties").update(update_data).eq("id", prop_id).eq("user_id", uid).execute()
    return jsonify(enrich_property(result.data[0]))


@app.route("/api/properties/<int:prop_id>/status", methods=["PATCH"])
@login_required
def update_property_status(prop_id):
    uid = current_user_id()
    data = request.get_json()
    new_status = (data.get("status") or "").strip()
    if not new_status:
        return jsonify({"error": "status is required"}), 400
    if new_status not in VALID_PROPERTY_STATUSES:
        return jsonify({"error": "Invalid status"}), 400

    sb = supa()
    existing_result = sb.table("properties").select("*").eq("id", prop_id).eq("user_id", uid).execute()
    if not existing_result.data:
        return jsonify({"error": "Property not found"}), 404
    existing = existing_result.data[0]

    linked_client = None
    link_client_id = data.get("link_client_id")
    if link_client_id and new_status in CLOSED_PROPERTY_STATUSES:
        crow_result = sb.table("clients").select("*").eq("id", link_client_id).eq("user_id", uid).execute()
        if not crow_result.data:
            return jsonify({"error": "Linked client not found"}), 404
        sb.table("clients").update({"status": "Deal Done"}).eq("id", link_client_id).eq("user_id", uid).execute()
        updated = sb.table("clients").select("*").eq("id", link_client_id).execute()
        linked_client = updated.data[0] if updated.data else None

    closed_at = _resolve_closed_at(new_status, existing.get("closed_at"))
    result = sb.table("properties").update({"status": new_status, "closed_at": closed_at}).eq("id", prop_id).eq("user_id", uid).execute()
    prop = enrich_property(result.data[0])
    return jsonify({"property": prop, "linked_client": linked_client})


# ─── Clients ─────────────────────────────────────────────────────────────────

@app.route("/api/clients", methods=["GET"])
@login_required
def get_clients():
    uid = current_user_id()
    status_filter = request.args.get("status", "").strip()
    query = supa().table("clients").select("*").eq("user_id", uid)
    if status_filter:
        query = query.eq("status", status_filter)
    result = query.order("created_at", desc=True).execute()
    return jsonify(result.data or [])


@app.route("/api/clients", methods=["POST"])
@login_required
def add_client():
    uid = current_user_id()
    data = request.get_json()
    if not data.get("name"):
        return jsonify({"error": "Name is required"}), 400
    row_data = {
        "user_id": uid,
        "name": data["name"],
        "phone": data.get("phone", ""),
        "property_type": data.get("property_type", ""),
        "location": data.get("location", ""),
        "budget_min": float(data.get("budget_min") or 0),
        "budget_max": float(data.get("budget_max") or 0),
        "configuration": data.get("configuration", ""),
        "notes": data.get("notes", ""),
        "status": data.get("status", "New Lead"),
    }
    result = supa().table("clients").insert(row_data).execute()
    client = result.data[0]
    property_matches = find_matching_properties(uid, client)
    return jsonify({"client": client, "property_matches": property_matches}), 201


@app.route("/api/clients/<int:client_id>", methods=["PUT"])
@login_required
def update_client(client_id):
    uid = current_user_id()
    data = request.get_json()
    update_data = {
        "name": data["name"],
        "phone": data.get("phone", ""),
        "property_type": data.get("property_type", ""),
        "location": data.get("location", ""),
        "budget_min": float(data.get("budget_min") or 0),
        "budget_max": float(data.get("budget_max") or 0),
        "configuration": data.get("configuration", ""),
        "notes": data.get("notes", ""),
        "status": data["status"],
    }
    result = supa().table("clients").update(update_data).eq("id", client_id).eq("user_id", uid).execute()
    return jsonify(result.data[0])


@app.route("/api/clients/<int:client_id>", methods=["DELETE"])
@login_required
def delete_client(client_id):
    uid = current_user_id()
    supa().table("clients").delete().eq("id", client_id).eq("user_id", uid).execute()
    return jsonify({"success": True})


# ─── Follow-ups ──────────────────────────────────────────────────────────────

@app.route("/api/followups", methods=["GET"])
@login_required
def get_followups():
    uid = current_user_id()
    result = supa().table("followups").select("*").eq("user_id", uid).order("reminder_date").execute()
    return jsonify(result.data or [])


@app.route("/api/followups", methods=["POST"])
@login_required
def add_followup():
    uid = current_user_id()
    data = request.get_json()
    if not data.get("client_name") or not data.get("note") or not data.get("reminder_date"):
        return jsonify({"error": "client_name, note, and reminder_date are required"}), 400
    row_data = {
        "user_id": uid,
        "client_name": data["client_name"],
        "phone": data.get("phone", ""),
        "note": data["note"],
        "reminder_date": data["reminder_date"],
        "status": data.get("status", "Pending"),
    }
    result = supa().table("followups").insert(row_data).execute()
    return jsonify(result.data[0]), 201


@app.route("/api/followups/<int:fu_id>", methods=["DELETE"])
@login_required
def delete_followup(fu_id):
    uid = current_user_id()
    supa().table("followups").delete().eq("id", fu_id).eq("user_id", uid).execute()
    return jsonify({"success": True})


@app.route("/api/followups/<int:fu_id>", methods=["PUT"])
@login_required
def update_followup(fu_id):
    uid = current_user_id()
    data = request.get_json()
    update_data = {
        "client_name": data["client_name"],
        "phone": data.get("phone", ""),
        "note": data["note"],
        "reminder_date": data["reminder_date"],
        "status": data["status"],
    }
    result = supa().table("followups").update(update_data).eq("id", fu_id).eq("user_id", uid).execute()
    return jsonify(result.data[0])


# ─── Profile / Settings ───────────────────────────────────────────────────────

@app.route("/api/profile", methods=["GET"])
@login_required
def get_profile():
    uid = current_user_id()
    result = supa().table("profiles").select("*").eq("id", uid).execute()
    if result.data:
        p = result.data[0]
        return jsonify({
            "broker_name": p.get("full_name", ""),
            "broker_phone": p.get("phone", ""),
            "broker_tagline": p.get("tagline", ""),
            "email": session.get("user_email", ""),
        })
    return jsonify({"broker_name": "", "broker_phone": "", "broker_tagline": "", "email": session.get("user_email", "")})


@app.route("/api/settings", methods=["GET"])
@login_required
def get_settings():
    return get_profile()


@app.route("/api/settings", methods=["PUT"])
@login_required
def update_settings():
    uid = current_user_id()
    data = request.get_json()
    update_data = {
        "full_name": data.get("broker_name", ""),
        "phone": data.get("broker_phone", ""),
        "tagline": data.get("broker_tagline", ""),
    }
    supa().table("profiles").upsert({"id": uid, **update_data}).execute()
    if update_data["full_name"]:
        session["user_name"] = update_data["full_name"]
    return jsonify({
        "broker_name": update_data["full_name"],
        "broker_phone": update_data["phone"],
        "broker_tagline": update_data["tagline"],
        "email": session.get("user_email", ""),
    })


# ─── AI Parse Property ────────────────────────────────────────────────────────

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

    prompt = f"""You are a real estate data extraction assistant in India (Punjab region).
Extract property details from this plain-text description and return EXACTLY the JSON object described.

Input: "{text}"

Return a JSON object with EXACTLY these 9 fields:

1. "property_type": one of: Apartment, House, Villa, Office, Shop, Land, Warehouse
   (flat/BHK/apartment → Apartment; kothi/makan → House; plot/zameen → Land; dukan/shop → Shop; godown → Warehouse)

2. "configuration": one of: {configs_list}
   (1BHK/2BHK/3BHK/4BHK+ by bedroom count; shop/commercial/office → Shop/Office; plot/land → Plot; else → Other)

3. "location": the area/sector/city mentioned — extract the FULL location string, e.g. "Sector 22, Chandigarh" or "Phase 7, Mohali"
   IMPORTANT: Always extract this. If only a city is mentioned, use just the city name.

4. "area_value": the NUMERIC area value ONLY — a plain number like 6 or 1200
   IMPORTANT: This must ALWAYS be a number, never null or missing. Extract the number before the unit.

5. "area_unit": one of: {units_list}
   (sq ft/sqft → Sq Ft; sq yards → Sq Yards; gaj → Gaj; marla → Marla; kanal → Kanal; bigha → Bigha)

6. "price": the price as a plain INTEGER in rupees — no decimals, no commas
   PRICE CONVERSION RULES (use exact integer arithmetic):
   - X lakh  = X × 100000   → "70 lakh" = 7000000, "25 lakh" = 2500000, "1.5 lakh" = 150000
   - X crore = X × 10000000 → "1.5 crore" = 15000000, "2 crore" = 20000000, "1.2 crore" = 12000000
   - Monthly rent: use the monthly figure directly (e.g. "15000 rent" = 15000)
   IMPORTANT: Always return a whole integer. Never use floating point.

7. "status": one of: Available, Rented, Sold, Reserved
   (for rent/monthly/kiraya → Rented; sold/bikya → Sold; booked/reserved → Reserved; default → Available)

8. "features": a comma-separated string of property amenities and features extracted from the text
   Examples: "East facing, lift, covered parking, gated society, newly renovated, corner plot"
   Leave as empty string "" if no features/amenities are mentioned.

9. "assumptions": a brief note about any major assumptions you had to make
   Leave as empty string "" if everything was clearly stated in the text.

EXAMPLE:
Input: "3BHK apartment Sector 22 Chandigarh 6 Marla 70 lakh available east facing with lift covered parking gated society"
Output: {{"property_type": "Apartment", "configuration": "3BHK", "location": "Sector 22, Chandigarh", "area_value": 6, "area_unit": "Marla", "price": 7000000, "status": "Available", "features": "East facing, lift, covered parking, gated society", "assumptions": ""}}

Return ONLY valid JSON. No markdown, no code blocks, no extra text before or after."""

    response = client.chat.completions.create(
        model="gpt-5-mini",
        max_completion_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )

    import re

    raw = response.choices[0].message.content.strip()

    def extract_json(text):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        stripped = _re.sub(r'^```(?:json)?\s*', '', text.strip(), flags=_re.IGNORECASE)
        stripped = _re.sub(r'\s*```$', '', stripped.strip())
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass
        brace_match = _re.search(r'\{[\s\S]*\}', text)
        if brace_match:
            try:
                return json.loads(brace_match.group())
            except json.JSONDecodeError:
                pass
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
        return None

    result = extract_json(raw)
    if result is None:
        return jsonify({
            "error": "AI returned an unexpected format. Please check the fields below and correct any blanks.",
            "raw": raw[:500],
            "property_type": "Apartment",
            "configuration": "Other",
            "location": "",
            "area_value": 0,
            "area_unit": "Sq Ft",
            "price": 0,
            "status": "Available",
            "notes": "",
            "assumptions": "Could not auto-extract — please fill in manually.",
            "size_sqft": 0,
        }), 200

    valid_types = {"Apartment", "House", "Villa", "Office", "Shop", "Land", "Warehouse"}
    if result.get("property_type") not in valid_types:
        result["property_type"] = "Apartment"
    if result.get("configuration") not in set(VALID_CONFIGS):
        result["configuration"] = "Other"
    if result.get("area_unit") not in set(VALID_UNITS):
        result["area_unit"] = "Sq Ft"
    if result.get("status") not in {"Available", "Rented", "Sold", "Reserved"}:
        result["status"] = "Available"

    try:
        result["area_value"] = float(result["area_value"]) if result.get("area_value") else 0.0
    except (TypeError, ValueError):
        result["area_value"] = 0.0

    try:
        result["price"] = int(round(float(result.get("price", 0))))
    except (TypeError, ValueError):
        result["price"] = 0

    result["notes"] = result.pop("features", "") or ""
    result["size_sqft"] = to_sqft(result["area_value"], result.get("area_unit", "Sq Ft"))
    return jsonify(result)


# ─── AI Match ────────────────────────────────────────────────────────────────

@app.route("/api/match", methods=["POST"])
@login_required
def match_properties():
    uid = current_user_id()
    data = request.get_json()
    message = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "No message provided"}), 400

    result = supa().table("properties").select("*").eq("user_id", uid).order("created_at", desc=True).execute()
    inventory = [enrich_property(r) for r in (result.data or [])]

    if not inventory:
        return jsonify({"matches": [], "summary": "No properties in inventory to match against."})

    def area_display(p):
        v = p.get("area_value", 0)
        u = p.get("area_unit", "Sq Ft")
        sqft = p.get("area_sqft", 0)
        if u == "Sq Ft":
            return f"{v:g} Sq Ft"
        return f"{v:g} {u} ({sqft:g} Sq Ft)"

    inventory_text = "\n".join([
        f"ID {p['id']}: {p.get('configuration','')} {p['property_type']} in {p['location']}, "
        f"{area_display(p)}, Rs {p['price']:,.0f}, Status: {p['status']}"
        + (f", Features: {p['notes']}" if p.get('notes') else "")
        for p in inventory
    ])

    from openai import OpenAI
    ai_client = OpenAI(
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

    response = ai_client.chat.completions.create(
        model="gpt-5-mini",
        max_completion_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()
    try:
        ai_result = json.loads(raw)
    except json.JSONDecodeError:
        json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if json_match:
            ai_result = json.loads(json_match.group())
        else:
            ai_result = {"matches": [], "summary": "Could not parse AI response."}

    matched_ids = ai_result.get("matches", [])
    matched_props = [p for p in inventory if p["id"] in matched_ids]
    matched_props.sort(key=lambda p: matched_ids.index(p["id"]) if p["id"] in matched_ids else 999)

    return jsonify({
        "matches": matched_props,
        "matched_ids": matched_ids,
        "summary": ai_result.get("summary", ""),
    })


# ─── Startup ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=False)
