const API = "";

let allProperties = [];
let allInquiries = [];
let allBuyers = [];
let allFollowups = [];
let editingId = null;
let editingInquiryId = null;
let editingBuyerId = null;
let editingFollowupId = null;
let lastMatchedIds = [];
let lastMatchMessage = "";
let brokerProfile = { broker_name: "", broker_phone: "", broker_tagline: "" };

const TODAY = new Date().toISOString().slice(0, 10);

const UNIT_TO_SQFT = {
  "Sq Ft": 1,
  "Sq Yards": 9,
  "Gaj": 9,
  "Marla": 272.25,
  "Kanal": 5445,
  "Bigha": 9070,
};

function toSqft(value, unit) {
  return Math.round(parseFloat(value) * (UNIT_TO_SQFT[unit] || 1) * 100) / 100;
}

function formatArea(p) {
  const v = p.area_value;
  const u = p.area_unit || "Sq Ft";
  const sqft = p.size;
  if (!v && !sqft) return "—";
  if (!v || u === "Sq Ft") return `${Number(sqft || v).toLocaleString("en-IN")} Sq Ft`;
  return `${Number(v).toLocaleString("en-IN")} ${u}<br><span class="sqft-sub">${Number(sqft).toLocaleString("en-IN")} Sq Ft</span>`;
}

function updateAreaConversion(valueId, unitId, displayId) {
  const val = parseFloat(document.getElementById(valueId)?.value);
  const unit = document.getElementById(unitId)?.value;
  const display = document.getElementById(displayId);
  if (!display) return;
  if (!isNaN(val) && val > 0 && unit && unit !== "Sq Ft") {
    const sqft = toSqft(val, unit);
    display.textContent = `≈ ${Number(sqft).toLocaleString("en-IN")} Sq Ft`;
  } else {
    display.textContent = "";
  }
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (res.status === 401) { window.location.href = "/login"; return null; }
  return res;
}

function formatPrice(n) {
  return "Rs " + Number(n).toLocaleString("en-IN");
}

// ─── Tab routing ──────────────────────────────────────────────────────────────

function showTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`tab-${tab}`).classList.add("active");
  document.getElementById(`panel-${tab}`).classList.add("active");
  if (tab === "inventory") fetchProperties();
  if (tab === "inquiries") fetchInquiries();
  if (tab === "buyers") fetchBuyers();
  if (tab === "followups") fetchFollowups();
  if (tab === "settings") fetchSettings();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function fetchSettings() {
  const res = await apiFetch(`${API}/api/settings`);
  if (!res) return;
  const data = await res.json();
  brokerProfile = { broker_name: "", broker_phone: "", broker_tagline: "", ...data };
  const nameEl = document.getElementById("settingName");
  const phoneEl = document.getElementById("settingPhone");
  const taglineEl = document.getElementById("settingTagline");
  if (nameEl) nameEl.value = brokerProfile.broker_name || "";
  if (phoneEl) phoneEl.value = brokerProfile.broker_phone || "";
  if (taglineEl) taglineEl.value = brokerProfile.broker_tagline || "";
  updateSettingsPreview();
}

function updateSettingsPreview() {
  const name = document.getElementById("settingName")?.value?.trim() || "";
  const phone = document.getElementById("settingPhone")?.value?.trim() || "";
  const tagline = document.getElementById("settingTagline")?.value?.trim() || "";
  const preview = document.getElementById("settingsPreview");
  if (!preview) return;
  if (name || phone) {
    const contact = name && phone ? `${name}: ${phone}` : name || phone;
    preview.style.display = "block";
    preview.innerHTML = `
      <div class="settings-preview-label">Preview in WhatsApp share:</div>
      <div class="settings-preview-text">📞 Contact ${contact}${tagline ? `\n_${tagline}_` : ""}</div>
    `;
  } else {
    preview.style.display = "none";
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    broker_name: document.getElementById("settingName").value.trim(),
    broker_phone: document.getElementById("settingPhone").value.trim(),
    broker_tagline: document.getElementById("settingTagline").value.trim(),
  };
  const btn = document.getElementById("saveSettingsBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    const res = await apiFetch(`${API}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res) return;
    brokerProfile = payload;
    updateSettingsPreview();
    const saved = document.getElementById("settingsSaved");
    saved.style.display = "inline";
    setTimeout(() => { saved.style.display = "none"; }, 2500);
  } finally {
    btn.disabled = false; btn.textContent = "Save Profile";
  }
}

// ─── Inventory ────────────────────────────────────────────────────────────────

async function fetchProperties() {
  const q = document.getElementById("searchInput").value;
  const status = document.getElementById("statusFilter").value;
  const type = document.getElementById("typeFilter").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  const res = await apiFetch(`${API}/api/properties?${params}`);
  if (!res) return;
  allProperties = await res.json();
  renderTable(allProperties);
  updateStats();
}

function updateStats() {
  const total = allProperties.length;
  const available = allProperties.filter(p => p.status === "Available").length;
  const sold = allProperties.filter(p => p.status === "Sold").length;
  const avgPrice = total > 0 ? allProperties.reduce((s, p) => s + p.price, 0) / total : 0;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statAvailable").textContent = available;
  document.getElementById("statSold").textContent = sold;
  document.getElementById("statAvgPrice").textContent = total > 0 ? formatPrice(Math.round(avgPrice)) : "-";
}

function statusBadge(status) {
  const map = { Available: "badge-available", Reserved: "badge-reserved", Sold: "badge-sold", Rented: "badge-rented" };
  return `<span class="badge ${map[status] || "badge-available"}">${status}</span>`;
}

function configTag(config) {
  return `<span class="config-tag">${config || "—"}</span>`;
}

// ─── Share ────────────────────────────────────────────────────────────────────

function buildShareText(p) {
  const typeEmoji = { Apartment: "🏢", House: "🏠", Villa: "🏡", Shop: "🏪", Office: "🏗️", Land: "🌳", Warehouse: "🏭" };
  const statusEmoji = { Available: "✅", Reserved: "🔒", Sold: "❌", Rented: "🔑" };
  const areaLine = (p.area_value && p.area_unit && p.area_unit !== "Sq Ft")
    ? `${Number(p.area_value).toLocaleString("en-IN")} ${p.area_unit} (${Number(p.size).toLocaleString("en-IN")} Sq Ft)`
    : `${Number(p.size || p.area_value).toLocaleString("en-IN")} Sq Ft`;
  const n = Number(p.price);
  const priceFormatted = n >= 10000000
    ? `Rs ${(n / 10000000).toFixed(2).replace(/\.?0+$/, "")} Cr`
    : n >= 100000
    ? `Rs ${(n / 100000).toFixed(2).replace(/\.?0+$/, "")} Lakh`
    : `Rs ${n.toLocaleString("en-IN")}`;
  const emoji = typeEmoji[p.property_type] || "🏘️";

  const lines = [
    `${emoji} *${p.configuration} ${p.property_type}*`,
    `📍 ${p.location}`,
    `📐 ${areaLine}`,
    `💰 ${priceFormatted}`,
    `${statusEmoji[p.status] || "ℹ️"} ${p.status}`,
  ];

  if (p.notes && p.notes.trim()) {
    lines.push(``, `📝 ${p.notes.trim()}`);
  }

  lines.push(``);

  const name = brokerProfile.broker_name?.trim() || "";
  const phone = brokerProfile.broker_phone?.trim() || "";
  const tagline = brokerProfile.broker_tagline?.trim() || "";

  if (name || phone) {
    const contact = name && phone ? `${name}: ${phone}` : name || phone;
    lines.push(`📞 Contact ${contact}`);
    if (tagline) lines.push(`_${tagline}_`);
  } else {
    lines.push(`_Contact us for details_ 📞`);
  }

  return lines.join("\n");
}

async function shareProperty(id, btn) {
  const p = allProperties.find(x => x.id === id);
  if (!p) return;
  const text = buildShareText(p);
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "✅";
    btn.title = "Copied!";
    btn.classList.add("btn-share-copied");
    setTimeout(() => { btn.textContent = "📤"; btn.title = "Copy WhatsApp message"; btn.classList.remove("btn-share-copied"); }, 1800);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    btn.textContent = "✅";
    setTimeout(() => { btn.textContent = "📤"; }, 1800);
  }
}

// ─── Expandable notes ─────────────────────────────────────────────────────────

function toggleNotes(id) {
  const row = document.getElementById(`notes-row-${id}`);
  const btn = document.getElementById(`notes-toggle-${id}`);
  if (!row) return;
  const isHidden = row.style.display === "none" || !row.style.display;
  row.style.display = isHidden ? "table-row" : "none";
  if (btn) {
    btn.textContent = isHidden ? "▲" : "💬";
    btn.classList.toggle("notes-toggle-active", isHidden);
  }
}

function renderTable(props) {
  const tbody = document.getElementById("propertiesBody");
  if (!Array.isArray(props) || props.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No properties found. Add your first one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = props.map(p => {
    const hasNotes = p.notes && p.notes.trim();
    return `
    <tr class="prop-row">
      <td data-label="Type"><span class="type-tag">${p.property_type}</span></td>
      <td data-label="Location">
        <span class="location-text">${p.location}</span>
        ${hasNotes ? `<button class="notes-toggle-btn" id="notes-toggle-${p.id}" onclick="toggleNotes(${p.id})" title="View notes & features">💬</button>` : ""}
      </td>
      <td data-label="Config">${configTag(p.configuration)}</td>
      <td data-label="Area" class="area-cell">${formatArea(p)}</td>
      <td data-label="Price">${formatPrice(p.price)}</td>
      <td data-label="Status">${statusBadge(p.status)}</td>
      <td class="actions-cell">
        <button class="btn-icon btn-share" onclick="shareProperty(${p.id}, this)" title="Copy WhatsApp message">📤</button>
        <button class="btn-icon btn-edit" onclick="openEditModal(${p.id})" title="Edit">✏️</button>
        <button class="btn-icon btn-delete" onclick="deleteProperty(${p.id})" title="Delete">🗑️</button>
      </td>
    </tr>
    ${hasNotes ? `
    <tr class="notes-expand-row" id="notes-row-${p.id}" style="display:none">
      <td colspan="7">
        <div class="notes-expand-content">
          <span class="notes-expand-label">📝 Features & Notes</span>
          <span class="notes-expand-text">${p.notes}</span>
        </div>
      </td>
    </tr>` : ""}
  `;}).join("");
}

function openAddModal() {
  editingId = null;
  document.getElementById("modalTitle").textContent = "Add Property";
  document.getElementById("propForm").reset();
  document.getElementById("propAreaConversion").textContent = "";
  document.getElementById("propNotes").value = "";
  document.getElementById("propModal").classList.add("open");
}

function openEditModal(id) {
  const p = allProperties.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById("modalTitle").textContent = "Edit Property";
  document.getElementById("propType").value = p.property_type;
  document.getElementById("propLocation").value = p.location;
  document.getElementById("propConfig").value = p.configuration || "Other";
  document.getElementById("propAreaValue").value = p.area_value || "";
  document.getElementById("propAreaUnit").value = p.area_unit || "Sq Ft";
  document.getElementById("propPrice").value = p.price;
  document.getElementById("propStatus").value = p.status;
  document.getElementById("propNotes").value = p.notes || "";
  updateAreaConversion("propAreaValue", "propAreaUnit", "propAreaConversion");
  document.getElementById("propModal").classList.add("open");
}

function closeModal() {
  document.getElementById("propModal").classList.remove("open");
  editingId = null;
}

async function saveProperty(e) {
  e.preventDefault();
  const payload = {
    property_type: document.getElementById("propType").value,
    location: document.getElementById("propLocation").value,
    configuration: document.getElementById("propConfig").value,
    area_value: parseFloat(document.getElementById("propAreaValue").value),
    area_unit: document.getElementById("propAreaUnit").value,
    price: parseFloat(document.getElementById("propPrice").value),
    status: document.getElementById("propStatus").value,
    notes: document.getElementById("propNotes").value.trim(),
  };
  const btn = document.getElementById("saveBtn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    if (editingId) {
      await apiFetch(`${API}/api/properties/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      closeModal();
      await fetchProperties();
    } else {
      const res = await apiFetch(`${API}/api/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res) return;
      const data = await res.json();
      closeModal();
      await fetchProperties();
      if (data.buyer_matches && data.buyer_matches.length > 0) {
        showBuyerMatchModal(data.buyer_matches, data.property);
      }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Property";
  }
}

async function deleteProperty(id) {
  if (!confirm("Delete this property?")) return;
  await apiFetch(`${API}/api/properties/${id}`, { method: "DELETE" });
  await fetchProperties();
}

// ─── Buyer Match Alert ────────────────────────────────────────────────────────

function showBuyerMatchModal(buyers, prop) {
  const list = document.getElementById("buyerMatchList");
  list.innerHTML = buyers.map(b => `
    <div class="buyer-match-card">
      <div class="buyer-match-name">👤 ${b.name} <span class="buyer-phone">📞 ${b.phone}</span></div>
      <div class="buyer-match-detail">
        ${b.property_type ? `<span class="type-tag">${b.property_type}</span>` : ""}
        ${b.location ? `📍 ${b.location}` : ""}
        ${(b.budget_min || b.budget_max) ? `💰 ${b.budget_min ? formatPrice(b.budget_min) : "Any"} – ${b.budget_max ? formatPrice(b.budget_max) : "Any"}` : ""}
      </div>
      ${b.notes ? `<div class="buyer-match-notes">${b.notes}</div>` : ""}
    </div>
  `).join("");
  document.getElementById("buyerMatchModal").classList.add("open");
}

function closeBuyerMatchModal() {
  document.getElementById("buyerMatchModal").classList.remove("open");
}

// ─── AI Matcher ───────────────────────────────────────────────────────────────

async function matchProperties() {
  const message = document.getElementById("whatsappMsg").value.trim();
  if (!message) return;
  const btn = document.getElementById("matchBtn");
  const resultDiv = document.getElementById("matchResult");
  btn.disabled = true;
  btn.textContent = "Analyzing...";
  resultDiv.innerHTML = `<div class="match-loading"><div class="spinner"></div><p>AI is searching your inventory...</p></div>`;
  try {
    const res = await apiFetch(`${API}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) { resultDiv.innerHTML = `<p class="match-error">${data.error}</p>`; return; }
    const matches = data.matches || [];
    lastMatchedIds = data.matched_ids || [];
    lastMatchMessage = message;
    let html = `<div class="match-summary"><p>${data.summary || ""}</p></div>`;
    if (matches.length === 0) {
      html += `<p class="match-none">No matching properties found in inventory.</p>`;
    } else {
      html += `<div class="match-count">${matches.length} match${matches.length !== 1 ? "es" : ""} found</div>`;
      html += `<div class="match-list">` + matches.map(p => `
        <div class="match-card">
          <div class="match-card-header">
            <span class="config-tag">${p.configuration || ""}</span>
            <span class="type-tag">${p.property_type}</span>
            ${statusBadge(p.status)}
          </div>
          <div class="match-card-location">📍 ${p.location}</div>
          <div class="match-card-details">
            <span>📐 ${p.area_value ? `${Number(p.area_value).toLocaleString("en-IN")} ${p.area_unit}` : `${Number(p.size).toLocaleString("en-IN")} Sq Ft`}</span>
            <span>💰 ${formatPrice(p.price)}</span>
          </div>
          ${p.notes ? `<div class="match-card-notes">📝 ${p.notes}</div>` : ""}
        </div>
      `).join("") + `</div>`;
      html += `<button class="save-inquiry-btn" onclick="openSaveInquiryModal()">💾 Save as Inquiry</button>`;
    }
    resultDiv.innerHTML = html;
  } catch (err) {
    resultDiv.innerHTML = `<p class="match-error">Error connecting to AI. Please try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Find Matches";
  }
}

function openSaveInquiryModal() {
  document.getElementById("inqClientName").value = "";
  document.getElementById("inqNotes").value = "";
  document.getElementById("inqStatus").value = "New";
  document.getElementById("saveInquiryModal").classList.add("open");
}
function closeSaveInquiryModal() { document.getElementById("saveInquiryModal").classList.remove("open"); }

async function saveInquiry(e) {
  e.preventDefault();
  const payload = {
    client_name: document.getElementById("inqClientName").value.trim(),
    whatsapp_message: lastMatchMessage,
    matched_property_ids: lastMatchedIds,
    notes: document.getElementById("inqNotes").value.trim(),
    status: document.getElementById("inqStatus").value,
  };
  if (!payload.client_name) return;
  const btn = document.getElementById("saveInquiryBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    await apiFetch(`${API}/api/inquiries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    closeSaveInquiryModal();
    showTab("inquiries");
  } finally { btn.disabled = false; btn.textContent = "Save Inquiry"; }
}

// ─── Inquiries ────────────────────────────────────────────────────────────────

async function fetchInquiries() {
  const statusFilter = document.getElementById("inqStatusFilter")?.value || "";
  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  const res = await apiFetch(`${API}/api/inquiries?${params}`);
  if (!res) return;
  allInquiries = await res.json();
  renderInquiries(allInquiries);
  updateInquiryStats();
}

function updateInquiryStats() {
  document.getElementById("inqStatTotal").textContent = allInquiries.length;
  document.getElementById("inqStatNew").textContent = allInquiries.filter(i => i.status === "New").length;
  document.getElementById("inqStatProgress").textContent = allInquiries.filter(i => i.status === "In Progress").length;
  document.getElementById("inqStatClosed").textContent = allInquiries.filter(i => i.status === "Closed").length;
}

function inquiryStatusBadge(status) {
  const map = { New: "badge-inq-new", "In Progress": "badge-inq-progress", Closed: "badge-inq-closed", Lost: "badge-inq-lost" };
  return `<span class="badge ${map[status] || "badge-inq-new"}">${status}</span>`;
}

function renderInquiries(inquiries) {
  const tbody = document.getElementById("inquiriesBody");
  if (!Array.isArray(inquiries) || inquiries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No inquiries yet. Use the AI matcher and save a result.</td></tr>`;
    return;
  }
  tbody.innerHTML = inquiries.map(inq => {
    const date = new Date(inq.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const propCount = Array.isArray(inq.matched_property_ids) ? inq.matched_property_ids.length : 0;
    const shortMsg = inq.whatsapp_message.length > 60 ? inq.whatsapp_message.slice(0, 60) + "…" : inq.whatsapp_message;
    return `<tr class="prop-row">
      <td data-label="Client"><strong>${inq.client_name}</strong></td>
      <td data-label="Message" class="msg-cell" title="${inq.whatsapp_message}">${shortMsg}</td>
      <td data-label="Matched"><span class="prop-count-badge">${propCount} propert${propCount !== 1 ? "ies" : "y"}</span></td>
      <td data-label="Status">${inquiryStatusBadge(inq.status)}</td>
      <td data-label="Date"><div class="inq-meta">${date}</div>${inq.notes ? `<div class="inq-notes">${inq.notes}</div>` : ""}</td>
      <td class="actions-cell">
        <button class="btn-icon btn-edit" onclick="openEditInquiry(${inq.id})" title="Edit">✏️</button>
        <button class="btn-icon btn-delete" onclick="deleteInquiry(${inq.id})" title="Delete">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

function openEditInquiry(id) {
  const inq = allInquiries.find(x => x.id === id);
  if (!inq) return;
  editingInquiryId = id;
  document.getElementById("editInqClientName").value = inq.client_name;
  document.getElementById("editInqNotes").value = inq.notes || "";
  document.getElementById("editInqStatus").value = inq.status;
  document.getElementById("editInquiryModal").classList.add("open");
}
function closeEditInquiryModal() { document.getElementById("editInquiryModal").classList.remove("open"); editingInquiryId = null; }

async function updateInquiry(e) {
  e.preventDefault();
  const payload = {
    client_name: document.getElementById("editInqClientName").value.trim(),
    notes: document.getElementById("editInqNotes").value.trim(),
    status: document.getElementById("editInqStatus").value,
  };
  const btn = document.getElementById("updateInquiryBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    await apiFetch(`${API}/api/inquiries/${editingInquiryId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    closeEditInquiryModal();
    await fetchInquiries();
  } finally { btn.disabled = false; btn.textContent = "Save Changes"; }
}

async function deleteInquiry(id) {
  if (!confirm("Delete this inquiry?")) return;
  await apiFetch(`${API}/api/inquiries/${id}`, { method: "DELETE" });
  await fetchInquiries();
}

// ─── Buyers ───────────────────────────────────────────────────────────────────

async function fetchBuyers() {
  const res = await apiFetch(`${API}/api/buyers`);
  if (!res) return;
  allBuyers = await res.json();
  renderBuyers(allBuyers);
}

function renderBuyers(buyers) {
  const tbody = document.getElementById("buyersBody");
  if (!Array.isArray(buyers) || buyers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No buyers saved yet. Add one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = buyers.map(b => `
    <tr class="prop-row">
      <td data-label="Name"><strong>${b.name}</strong></td>
      <td data-label="Phone"><a href="tel:${b.phone}" class="phone-link">📞 ${b.phone}</a></td>
      <td data-label="Type">${b.property_type ? `<span class="type-tag">${b.property_type}</span>` : '<span class="text-muted">Any</span>'}</td>
      <td data-label="Location">${b.location || '<span class="text-muted">Any</span>'}</td>
      <td data-label="Budget" class="budget-cell">
        ${b.budget_min || b.budget_max
          ? `${b.budget_min ? formatPrice(b.budget_min) : "—"} – ${b.budget_max ? formatPrice(b.budget_max) : "—"}`
          : '<span class="text-muted">Not set</span>'}
      </td>
      <td data-label="Notes" class="msg-cell">${b.notes || ""}</td>
      <td class="actions-cell">
        <button class="btn-icon btn-edit" onclick="openEditBuyerModal(${b.id})" title="Edit">✏️</button>
        <button class="btn-icon btn-delete" onclick="deleteBuyer(${b.id})" title="Delete">🗑️</button>
      </td>
    </tr>
  `).join("");
}

function openAddBuyerModal() {
  editingBuyerId = null;
  document.getElementById("buyerModalTitle").textContent = "Add Buyer";
  document.getElementById("buyerForm").reset();
  document.getElementById("addBuyerModal").classList.add("open");
}

function openEditBuyerModal(id) {
  const b = allBuyers.find(x => x.id === id);
  if (!b) return;
  editingBuyerId = id;
  document.getElementById("buyerModalTitle").textContent = "Edit Buyer";
  document.getElementById("buyerName").value = b.name;
  document.getElementById("buyerPhone").value = b.phone;
  document.getElementById("buyerType").value = b.property_type || "";
  document.getElementById("buyerLocation").value = b.location || "";
  document.getElementById("buyerBudgetMin").value = b.budget_min || "";
  document.getElementById("buyerBudgetMax").value = b.budget_max || "";
  document.getElementById("buyerNotes").value = b.notes || "";
  document.getElementById("addBuyerModal").classList.add("open");
}

function closeAddBuyerModal() { document.getElementById("addBuyerModal").classList.remove("open"); editingBuyerId = null; }

async function saveBuyer(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("buyerName").value.trim(),
    phone: document.getElementById("buyerPhone").value.trim(),
    property_type: document.getElementById("buyerType").value,
    location: document.getElementById("buyerLocation").value.trim(),
    budget_min: document.getElementById("buyerBudgetMin").value || 0,
    budget_max: document.getElementById("buyerBudgetMax").value || 0,
    notes: document.getElementById("buyerNotes").value.trim(),
  };
  const btn = document.getElementById("saveBuyerBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    if (editingBuyerId) {
      await apiFetch(`${API}/api/buyers/${editingBuyerId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await apiFetch(`${API}/api/buyers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    closeAddBuyerModal();
    await fetchBuyers();
  } finally { btn.disabled = false; btn.textContent = "Save Buyer"; }
}

async function deleteBuyer(id) {
  if (!confirm("Delete this buyer?")) return;
  await apiFetch(`${API}/api/buyers/${id}`, { method: "DELETE" });
  await fetchBuyers();
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────

async function fetchFollowups() {
  const res = await apiFetch(`${API}/api/followups`);
  if (!res) return;
  allFollowups = await res.json();
  renderFollowups(allFollowups);
  updateOverdueBadge(allFollowups);
}

function updateOverdueBadge(followups) {
  if (!Array.isArray(followups)) return;
  const overdue = followups.filter(f => f.status === "Pending" && f.reminder_date < TODAY).length;
  const badge = document.getElementById("overdueBadge");
  if (overdue > 0) {
    badge.textContent = overdue;
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}

function renderFollowups(followups) {
  const tbody = document.getElementById("followupsBody");
  const overdueDiv = document.getElementById("overdueAlert");

  if (!Array.isArray(followups) || followups.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No follow-ups yet. Add one above.</td></tr>`;
    if (overdueDiv) overdueDiv.style.display = "none";
    return;
  }

  const overdue = followups.filter(f => f.status === "Pending" && f.reminder_date < TODAY);
  const rest = followups.filter(f => !(f.status === "Pending" && f.reminder_date < TODAY));
  const sorted = [...overdue, ...rest];

  if (overdueDiv) {
    if (overdue.length > 0) {
      overdueDiv.style.display = "block";
      overdueDiv.innerHTML = `⚠️ <strong>${overdue.length} overdue follow-up${overdue.length !== 1 ? "s" : ""}</strong> — shown in red below. Mark them done once actioned.`;
    } else {
      overdueDiv.style.display = "none";
    }
  }

  tbody.innerHTML = sorted.map(f => {
    const isOverdue = f.status === "Pending" && f.reminder_date < TODAY;
    const isToday = f.reminder_date === TODAY;
    const displayDate = new Date(f.reminder_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const rowClass = isOverdue ? "prop-row fu-overdue" : isToday ? "prop-row fu-today" : "prop-row";
    const dateBadge = isOverdue
      ? `<span class="fu-date-badge overdue">${displayDate} ⚠️ Overdue</span>`
      : isToday
      ? `<span class="fu-date-badge today">${displayDate} — Today</span>`
      : `<span class="fu-date-badge">${displayDate}</span>`;
    const statusBadgeHtml = f.status === "Done"
      ? `<span class="badge badge-available">Done</span>`
      : `<span class="badge badge-reserved">Pending</span>`;
    return `<tr class="${rowClass}">
      <td data-label="Client"><strong>${f.client_name}</strong></td>
      <td data-label="Note">${f.note}</td>
      <td data-label="Date">${dateBadge}</td>
      <td data-label="Status">${statusBadgeHtml}</td>
      <td class="actions-cell">
        ${f.status === "Pending" ? `<button class="btn-icon" onclick="markFollowupDone(${f.id})" title="Mark Done">✅</button>` : ""}
        <button class="btn-icon btn-edit" onclick="openEditFollowupModal(${f.id})" title="Edit">✏️</button>
        <button class="btn-icon btn-delete" onclick="deleteFollowup(${f.id})" title="Delete">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

function openAddFollowupModal() {
  editingFollowupId = null;
  document.getElementById("followupModalTitle").textContent = "Add Follow-up";
  document.getElementById("followupForm").reset();
  document.getElementById("fuDate").value = TODAY;
  document.getElementById("addFollowupModal").classList.add("open");
}

function openEditFollowupModal(id) {
  const f = allFollowups.find(x => x.id === id);
  if (!f) return;
  editingFollowupId = id;
  document.getElementById("followupModalTitle").textContent = "Edit Follow-up";
  document.getElementById("fuClientName").value = f.client_name;
  document.getElementById("fuNote").value = f.note;
  document.getElementById("fuDate").value = f.reminder_date;
  document.getElementById("fuStatus").value = f.status;
  document.getElementById("addFollowupModal").classList.add("open");
}

function closeAddFollowupModal() { document.getElementById("addFollowupModal").classList.remove("open"); editingFollowupId = null; }

async function saveFollowup(e) {
  e.preventDefault();
  const payload = {
    client_name: document.getElementById("fuClientName").value.trim(),
    note: document.getElementById("fuNote").value.trim(),
    reminder_date: document.getElementById("fuDate").value,
    status: document.getElementById("fuStatus").value,
  };
  const btn = document.getElementById("saveFollowupBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    if (editingFollowupId) {
      await apiFetch(`${API}/api/followups/${editingFollowupId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await apiFetch(`${API}/api/followups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    closeAddFollowupModal();
    await fetchFollowups();
  } finally { btn.disabled = false; btn.textContent = "Save Follow-up"; }
}

async function markFollowupDone(id) {
  const f = allFollowups.find(x => x.id === id);
  if (!f) return;
  await apiFetch(`${API}/api/followups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...f, status: "Done" }),
  });
  await fetchFollowups();
}

async function deleteFollowup(id) {
  if (!confirm("Delete this follow-up?")) return;
  await apiFetch(`${API}/api/followups/${id}`, { method: "DELETE" });
  await fetchFollowups();
}

// ─── Quick Add via AI ─────────────────────────────────────────────────────────

let parsedProperty = null;

function toggleQuickAdd() {
  const body = document.getElementById("quickAddBody");
  const btn = document.getElementById("quickAddToggle");
  const isHidden = body.style.display === "none";
  body.style.display = isHidden ? "block" : "none";
  btn.textContent = isHidden ? "▲ Hide" : "▼ Show";
}

async function parsePropertyText() {
  const text = document.getElementById("quickAddText").value.trim();
  if (!text) return;
  const btn = document.getElementById("parseBtn");
  const resultDiv = document.getElementById("parseResult");
  btn.disabled = true;
  btn.textContent = "Parsing...";
  resultDiv.innerHTML = `<div class="parse-loading"><div class="spinner" style="border-top-color:var(--purple)"></div><p>AI is reading your description…</p></div>`;
  try {
    const res = await apiFetch(`${API}/api/parse-property`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res) return;
    const data = await res.json();
    if (data.error && !data.property_type) {
      // Hard error — AI completely failed, no fields to show
      resultDiv.innerHTML = `<p class="parse-error">⚠️ ${data.error}</p>`;
      return;
    }
    parsedProperty = data;
    renderConfirmCard(data);
  } catch (err) {
    resultDiv.innerHTML = `<p class="parse-error">⚠️ Error connecting to AI. Please try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ Parse with AI";
  }
}

function renderConfirmCard(p) {
  const resultDiv = document.getElementById("parseResult");
  const CONFIGS = ["1BHK","2BHK","3BHK","4BHK+","Shop/Office","Plot","Other"];
  const TYPES = ["Apartment","House","Villa","Office","Shop","Land","Warehouse"];
  const UNITS = ["Sq Ft","Sq Yards","Gaj","Marla","Kanal","Bigha"];
  const STATUSES = ["Available","Reserved","Sold","Rented"];

  const initSqft = p.area_value && p.area_unit && p.area_unit !== "Sq Ft"
    ? `≈ ${Number(toSqft(p.area_value, p.area_unit)).toLocaleString("en-IN")} Sq Ft`
    : "";

  resultDiv.innerHTML = `
    <div class="confirm-card">
      <div class="confirm-card-title">
        <span class="confirm-card-icon">🔍</span>
        <span>Confirm extracted details</span>
        ${p.assumptions ? `<span class="confirm-note" title="${p.assumptions}">ℹ️ AI made some assumptions</span>` : ""}
      </div>
      ${p.assumptions ? `<div class="confirm-assumption">${p.assumptions}</div>` : ""}
      <div class="confirm-fields">
        <div class="confirm-field">
          <label>Configuration</label>
          <select id="confirmConfig">
            ${CONFIGS.map(c => `<option ${c === p.configuration ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
        <div class="confirm-field">
          <label>Property Type</label>
          <select id="confirmType">
            ${TYPES.map(t => `<option ${t === p.property_type ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="confirm-field" style="grid-column:1/-1">
          <label>Location</label>
          <input type="text" id="confirmLocation" value="${(p.location || "").replace(/"/g, "&quot;")}" placeholder="e.g. Sector 22, Chandigarh" />
        </div>
        <div class="confirm-field" style="grid-column:1/-1">
          <label>Area</label>
          <div class="area-input-row">
            <input type="number" id="confirmAreaValue" value="${p.area_value > 0 ? p.area_value : ""}" min="0.01" step="0.01"
              oninput="updateAreaConversion('confirmAreaValue','confirmAreaUnit','confirmAreaConv')"
              placeholder="e.g. 6"
            />
            <select id="confirmAreaUnit"
              onchange="updateAreaConversion('confirmAreaValue','confirmAreaUnit','confirmAreaConv')">
              ${UNITS.map(u => `<option ${u === p.area_unit ? "selected" : ""}>${u}</option>`).join("")}
            </select>
          </div>
          <div class="area-conversion" id="confirmAreaConv">${initSqft}</div>
        </div>
        <div class="confirm-field">
          <label>Price (Rs)</label>
          <input type="number" id="confirmPrice" value="${p.price > 0 ? p.price : ""}" min="0" placeholder="e.g. 7000000" />
        </div>
        <div class="confirm-field">
          <label>Status</label>
          <select id="confirmStatus">
            ${STATUSES.map(s => `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="confirm-field" style="grid-column:1/-1">
          <label>Notes / Features <span style="font-size:11px;color:#6b7280;font-weight:400;">(auto-extracted)</span></label>
          <textarea id="confirmNotes" rows="2" style="width:100%;border:1.5px solid #e5e7eb;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box;" placeholder="e.g. East facing, lift, covered parking, gated society">${p.notes || ""}</textarea>
        </div>
      </div>
      <div class="confirm-actions">
        <button class="btn-cancel" onclick="discardParsed()">✕ Discard</button>
        <button class="btn-primary" id="confirmAddBtn" onclick="saveParsedProperty()">✅ Add to Inventory</button>
      </div>
    </div>
  `;
}

function discardParsed() {
  parsedProperty = null;
  document.getElementById("parseResult").innerHTML = "";
  document.getElementById("quickAddText").value = "";
}

async function saveParsedProperty() {
  const payload = {
    property_type: document.getElementById("confirmType").value,
    location: document.getElementById("confirmLocation").value.trim(),
    configuration: document.getElementById("confirmConfig").value,
    area_value: parseFloat(document.getElementById("confirmAreaValue").value),
    area_unit: document.getElementById("confirmAreaUnit").value,
    price: parseFloat(document.getElementById("confirmPrice").value),
    status: document.getElementById("confirmStatus").value,
    notes: document.getElementById("confirmNotes")?.value?.trim() || "",
  };
  if (!payload.location || isNaN(payload.area_value) || isNaN(payload.price)) {
    alert("Please fill in all fields before adding.");
    return;
  }
  const btn = document.getElementById("confirmAddBtn");
  btn.disabled = true;
  btn.textContent = "Adding...";
  try {
    const res = await apiFetch(`${API}/api/properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res) return;
    const data = await res.json();
    discardParsed();
    await fetchProperties();
    if (data.buyer_matches && data.buyer_matches.length > 0) {
      showBuyerMatchModal(data.buyer_matches, data.property);
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "✅ Add to Inventory";
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.getElementById("searchInput").addEventListener("input", fetchProperties);
document.getElementById("statusFilter").addEventListener("change", fetchProperties);
document.getElementById("typeFilter").addEventListener("change", fetchProperties);
document.getElementById("propForm").addEventListener("submit", saveProperty);
document.getElementById("saveInquiryForm").addEventListener("submit", saveInquiry);
document.getElementById("editInquiryForm").addEventListener("submit", updateInquiry);
document.getElementById("inqStatusFilter").addEventListener("change", fetchInquiries);
document.getElementById("buyerForm").addEventListener("submit", saveBuyer);
document.getElementById("followupForm").addEventListener("submit", saveFollowup);
document.getElementById("settingsForm").addEventListener("submit", saveSettings);

document.getElementById("propAreaValue").addEventListener("input", () =>
  updateAreaConversion("propAreaValue", "propAreaUnit", "propAreaConversion"));
document.getElementById("propAreaUnit").addEventListener("change", () =>
  updateAreaConversion("propAreaValue", "propAreaUnit", "propAreaConversion"));

document.getElementById("settingName").addEventListener("input", updateSettingsPreview);
document.getElementById("settingPhone").addEventListener("input", updateSettingsPreview);
document.getElementById("settingTagline").addEventListener("input", updateSettingsPreview);

["propModal","saveInquiryModal","editInquiryModal","addBuyerModal","addFollowupModal","buyerMatchModal"].forEach(id => {
  document.getElementById(id).addEventListener("click", function(e) { if (e.target === this) this.classList.remove("open"); });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

fetchSettings();
fetchProperties();
apiFetch(`${API}/api/followups`).then(r => r && r.json()).then(data => {
  if (Array.isArray(data)) { allFollowups = data; updateOverdueBadge(data); }
});
