const API = "";

const WHATSAPP_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 4.9L2 22l5.2-1.4c1.4.8 3 1.2 4.8 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>`;

let allProperties = [];
let allClients = [];
let allFollowups = [];
let editingId = null;
let editingClientId = null;
let editingFollowupId = null;
let clientFilter = "";
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

function roundArea(n) {
  return Math.round(Number(n)).toLocaleString("en-IN");
}

function formatArea(p) {
  const v = p.area_value;
  const u = p.area_unit || "Sq Ft";
  const sqft = p.size;
  if (!v && !sqft) return "—";
  if (!v || u === "Sq Ft") return `${roundArea(sqft || v)} Sq Ft`;
  return `${roundArea(v)} ${u}`;
}

function updateAreaConversion(valueId, unitId, displayId) {
  const val = parseFloat(document.getElementById(valueId)?.value);
  const unit = document.getElementById(unitId)?.value;
  const display = document.getElementById(displayId);
  if (!display) return;
  if (!isNaN(val) && val > 0 && unit && unit !== "Sq Ft") {
    const sqft = toSqft(val, unit);
    display.textContent = `≈ ${Math.round(sqft).toLocaleString("en-IN")} Sq Ft`;
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

// Parse broker price input: plain numbers, "80L"/"80 lakh", "1.5Cr"/"1.5 crore", commas
function parsePriceInput(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().toLowerCase();
  if (!s) return NaN;
  s = s.replace(/rs\.?|inr|₹/g, "").replace(/,/g, "").trim();
  const crMatch = s.match(/^([\d.]+)\s*(cr|crore|crores)$/);
  if (crMatch) return Math.round(parseFloat(crMatch[1]) * 10000000);
  const lMatch = s.match(/^([\d.]+)\s*(l|lac|lacs|lakh|lakhs)$/);
  if (lMatch) return Math.round(parseFloat(lMatch[1]) * 100000);
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  return NaN;
}

// Format a number into Indian words: "Rs 80 Lakh", "Rs 1.5 Cr", or "Rs 50,000"
function formatPriceWords(n) {
  n = Number(n);
  if (!n || isNaN(n) || n <= 0) return "";
  if (n >= 10000000) return "Rs " + (n / 10000000).toFixed(2).replace(/\.?0+$/, "") + " Cr";
  if (n >= 100000) return "Rs " + (n / 100000).toFixed(2).replace(/\.?0+$/, "") + " Lakh";
  return "Rs " + n.toLocaleString("en-IN");
}

// Live helper text below a price/budget input
function updatePriceConversion(inputId, displayId) {
  const display = document.getElementById(displayId);
  if (!display) return;
  const n = parsePriceInput(document.getElementById(inputId)?.value);
  display.textContent = (!isNaN(n) && n > 0) ? "≈ " + formatPriceWords(n) : "";
}

// ─── Tab routing ──────────────────────────────────────────────────────────────

function showTab(tab) {
  document.querySelectorAll(".topnav-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".bottom-tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  const navEl = document.getElementById(`nav-${tab}`);
  const btabEl = document.getElementById(`btab-${tab}`);
  if (navEl) navEl.classList.add("active");
  if (btabEl) btabEl.classList.add("active");
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.classList.add("active");
  if (tab === "dashboard") renderDashboard();
  if (tab === "inventory") fetchProperties();
  if (tab === "clients") fetchClients();
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
  const placeholder = document.getElementById("settingsPlaceholder");
  const avatarEl = document.getElementById("settingsAvatar");
  if (avatarEl) {
    const initials = name
      ? name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2)
      : "?";
    avatarEl.textContent = initials;
  }
  if (!preview) return;
  if (name || phone) {
    const contact = name && phone ? `${name}: ${phone}` : name || phone;
    preview.style.display = "block";
    if (placeholder) placeholder.style.display = "none";
    preview.innerHTML = `
      <div class="settings-preview-label">Preview in WhatsApp share:</div>
      <div class="settings-preview-text">Contact ${contact}${tagline ? `\n${tagline}` : ""}</div>
    `;
  } else {
    preview.style.display = "none";
    if (placeholder) placeholder.style.display = "flex";
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
  renderMobileList(allProperties);
  updateStats();
}

function updateStats() {
  const total = allProperties.length;
  const available = allProperties.filter(p => p.status === "Available").length;
  const sold = allProperties.filter(p => p.status === "Sold").length;
  const monthStr = TODAY.slice(0, 7);
  const dealsThisMonth = allProperties.filter(p =>
    (p.status === "Sold" || p.status === "Rented") && (p.closed_at || "").startsWith(monthStr)
  ).length;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statAvailable").textContent = available;
  document.getElementById("statSold").textContent = sold;
  document.getElementById("statDealsMonth").textContent = dealsThisMonth;
}

function statusBadge(status) {
  const map = {
    Available: "badge-available",
    Reserved: "badge-reserved",
    "Under Negotiation": "badge-negotiation",
    Sold: "badge-sold",
    Rented: "badge-rented",
    Withdrawn: "badge-withdrawn",
  };
  return `<span class="badge ${map[status] || "badge-available"}">${status}</span>`;
}

function configTag(config) {
  return `<span class="config-tag">${config || "—"}</span>`;
}

// ─── Share ────────────────────────────────────────────────────────────────────

function buildShareText(p) {
  const typeEmoji = { Apartment: "🏢", House: "🏠", Villa: "🏡", Shop: "🏪", Office: "🏗️", Land: "🌳", Warehouse: "🏭" };
  const statusEmoji = { Available: "✅", Reserved: "🔒", "Under Negotiation": "🤝", Sold: "❌", Rented: "🔑", Withdrawn: "🚫" };
  const areaLine = (p.area_value && p.area_unit && p.area_unit !== "Sq Ft")
    ? `${roundArea(p.area_value)} ${p.area_unit}`
    : `${roundArea(p.size || p.area_value)} Sq Ft`;
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
  const label = btn.querySelector(".btn-action-label");
  const showCopied = () => {
    btn.classList.add("btn-share-copied");
    btn.title = "Copied!";
    if (label) label.textContent = "Copied!";
    setTimeout(() => {
      btn.classList.remove("btn-share-copied");
      btn.title = "Share on WhatsApp";
      if (label) label.textContent = "Share";
    }, 1800);
  };
  try {
    await navigator.clipboard.writeText(text);
    showCopied();
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showCopied();
  }
}

// ─── Expandable notes ─────────────────────────────────────────────────────────

function toggleNotes(id) {
  const row = document.getElementById(`notes-row-${id}`);
  const btn = document.getElementById(`notes-toggle-${id}`);
  if (!row) return;
  const isHidden = row.style.display === "none" || !row.style.display;
  row.style.display = isHidden ? "table-row" : "none";
  const propRow = row.previousElementSibling;
  if (propRow && propRow.classList.contains("prop-row")) {
    propRow.classList.toggle("row-expanded", isHidden);
  }
  if (btn) {
    btn.textContent = isHidden ? "▲" : "▾";
    btn.classList.toggle("notes-toggle-active", isHidden);
  }
}

function renderTable(props) {
  const tbody = document.getElementById("propertiesBody");
  if (!Array.isArray(props) || props.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row"><div class="empty-state"><div class="empty-state-title">No properties found</div><div class="empty-state-msg">Add your first property using Quick Add AI above, or click + Add Property.</div><button class="btn-primary" onclick="openAddModal()">+ Add Property</button></div></td></tr>`;
    return;
  }
  tbody.innerHTML = props.map(p => {
    const hasNotes = p.notes && p.notes.trim();
    return `
    <tr class="prop-row">
      <td data-label="Type"><span class="type-tag">${p.property_type}</span></td>
      <td data-label="Location">
        <span class="location-text">${p.location}</span>
        ${hasNotes ? `<button class="notes-toggle-btn" id="notes-toggle-${p.id}" onclick="toggleNotes(${p.id})" title="View notes & features">▾</button>` : ""}
      </td>
      <td data-label="Config">${configTag(p.configuration)}</td>
      <td data-label="Area" class="area-cell">${formatArea(p)}</td>
      <td data-label="Price">${formatPrice(p.price)}</td>
      <td data-label="Status">${statusBadge(p.status)}</td>
      <td class="actions-cell">
        <button class="btn-share" onclick="shareProperty(${p.id}, this)" title="Share on WhatsApp">${WHATSAPP_ICON}<span class="btn-action-label">Share</span></button>
        <button class="btn-action-pill btn-status" onclick="openQuickStatusModal(${p.id})" title="Change status">Status</button>
        <button class="btn-action-pill btn-edit" onclick="openEditModal(${p.id})" title="Edit">Edit</button>
        <button class="btn-action-pill btn-delete" onclick="deleteProperty(${p.id})" title="Delete">Delete</button>
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

function renderMobileList(props) {
  const container = document.getElementById("propMobileList");
  if (!container) return;
  if (!Array.isArray(props) || props.length === 0) {
    container.innerHTML = `<div class="prop-mobile-empty"><div class="empty-state-title">No properties found</div><div class="empty-state-msg">Add your first property using Quick Add AI above, or click + Add Property.</div><button class="btn-primary" onclick="openAddModal()">+ Add Property</button></div>`;
    return;
  }
  container.innerHTML = props.map(p => {
    const parts = [p.configuration, formatArea(p), formatPrice(p.price)].filter(Boolean);
    const line2 = parts.join(" · ");
    const hasNotes = p.notes && p.notes.trim();
    return `
      <div class="prop-mobile-item" id="mobile-item-${p.id}">
        <div class="prop-mobile-summary" onclick="toggleMobileRow(${p.id})">
          <div class="prop-mobile-main">
            <div class="prop-mobile-line1">${p.property_type} · ${p.location}</div>
            <div class="prop-mobile-line2">${line2}</div>
          </div>
          <div class="prop-mobile-right">
            ${statusBadge(p.status)}
            <span class="prop-mobile-expand">▾</span>
          </div>
        </div>
        <div class="prop-mobile-detail" id="mobile-detail-${p.id}" style="display:none">
          ${hasNotes ? `<div class="prop-mobile-notes">📝 ${p.notes}</div>` : ""}
          <div class="prop-mobile-actions">
            <button class="btn-share btn-share-row" onclick="shareProperty(${p.id}, this)">${WHATSAPP_ICON}<span class="btn-action-label">Share</span></button>
            <button class="btn-action-pill btn-status" onclick="openQuickStatusModal(${p.id})">Status</button>
            <button class="btn-action-pill btn-edit" onclick="openEditModal(${p.id})">Edit</button>
            <button class="btn-action-pill btn-delete" onclick="deleteProperty(${p.id})">Delete</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

function toggleMobileRow(id) {
  const item = document.getElementById(`mobile-item-${id}`);
  const detail = document.getElementById(`mobile-detail-${id}`);
  if (!item || !detail) return;
  const isExpanded = item.classList.contains("expanded");
  item.classList.toggle("expanded", !isExpanded);
  detail.style.display = isExpanded ? "none" : "block";
}

function openAddModal() {
  editingId = null;
  document.getElementById("modalTitle").textContent = "Add Property";
  document.getElementById("propForm").reset();
  document.getElementById("propAreaConversion").textContent = "";
  document.getElementById("propPriceConv").textContent = "";
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
  updatePriceConversion("propPrice", "propPriceConv");
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
    price: parsePriceInput(document.getElementById("propPrice").value),
    status: document.getElementById("propStatus").value,
    notes: document.getElementById("propNotes").value.trim(),
  };
  if (isNaN(payload.price) || payload.price <= 0) {
    alert("Please enter a valid price (e.g. 5000000, 50L, or 1.5Cr).");
    document.getElementById("propPrice").focus();
    return;
  }
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

// ─── Quick status change ──────────────────────────────────────────────────────

let quickStatusPropId = null;
let pendingStatusChange = null; // { propId, status } awaiting client link

function openQuickStatusModal(id) {
  const p = allProperties.find(x => x.id === id);
  if (!p) return;
  quickStatusPropId = id;
  document.getElementById("quickStatusProp").innerHTML =
    `<div class="qs-prop-title">${p.configuration} ${p.property_type}</div>
     <div class="qs-prop-sub">${p.location} · ${formatPrice(p.price)}</div>
     <div class="qs-prop-current">Current: ${statusBadge(p.status)}</div>`;
  document.getElementById("quickStatusModal").classList.add("open");
}

function closeQuickStatusModal() {
  document.getElementById("quickStatusModal").classList.remove("open");
  quickStatusPropId = null;
}

async function quickSetStatus(status) {
  const id = quickStatusPropId;
  if (!id) return;
  if (status === "Sold" || status === "Rented") {
    // Ask whether to link a client before committing
    pendingStatusChange = { propId: id, status };
    closeQuickStatusModal();
    openLinkClientModal(status);
    return;
  }
  closeQuickStatusModal();
  await applyStatusChange(id, status, null);
}

async function applyStatusChange(propId, status, linkClientId) {
  const res = await apiFetch(`${API}/api/properties/${propId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, link_client_id: linkClientId || null }),
  });
  if (!res) return;
  const data = await res.json();
  await fetchProperties();
  await fetchClients();
  if (typeof renderDashboard === "function") renderDashboard();
  if (data.linked_client) {
    alert(`Marked as ${status}. ${data.linked_client.name} is now Closed Won.`);
  }
}

function openLinkClientModal(status) {
  const select = document.getElementById("linkClientSelect");
  const eligible = allClients.filter(c => c.status === "Active" || c.status === "Deal In Progress");
  document.getElementById("linkClientMsg").textContent =
    `You're marking this property as ${status}. Link it to a client to record the deal?`;
  select.innerHTML = `<option value="">— Don't link —</option>` +
    eligible.map(c => `<option value="${c.id}">${c.name}${c.phone ? " · " + c.phone : ""} (${c.status})</option>`).join("");
  document.getElementById("linkClientModal").classList.add("open");
}

function closeLinkClientModal() {
  document.getElementById("linkClientModal").classList.remove("open");
  pendingStatusChange = null;
}

async function confirmLinkClient(skip) {
  if (!pendingStatusChange) { closeLinkClientModal(); return; }
  const { propId, status } = pendingStatusChange;
  const linkId = skip ? null : (document.getElementById("linkClientSelect").value || null);
  document.getElementById("linkClientModal").classList.remove("open");
  pendingStatusChange = null;
  await applyStatusChange(propId, status, linkId);
}

// ─── Buyer Match Alert ────────────────────────────────────────────────────────

function showBuyerMatchModal(buyers, prop) {
  const list = document.getElementById("buyerMatchList");
  list.innerHTML = buyers.map(b => `
    <div class="buyer-match-card">
      <div class="buyer-match-name">${b.name} <span class="buyer-phone">${b.phone}</span></div>
      <div class="buyer-match-detail">
        ${b.property_type ? `<span class="type-tag">${b.property_type}</span>` : ""}
        ${b.location ? `${b.location}` : ""}
        ${(b.budget_min || b.budget_max) ? `${b.budget_min ? formatPrice(b.budget_min) : "Any"} – ${b.budget_max ? formatPrice(b.budget_max) : "Any"}` : ""}
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

function toggleMatchSummary() {
  const st = document.getElementById("matchSummaryText");
  const tg = document.getElementById("matchSummaryToggle");
  if (!st || !tg) return;
  const clamped = st.classList.toggle("clamped");
  tg.textContent = clamped ? "Read more" : "Read less";
}

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
    let html = `<div class="match-summary">
      <p class="match-summary-text clamped" id="matchSummaryText">${data.summary || ""}</p>
      <button type="button" class="match-summary-toggle" id="matchSummaryToggle" onclick="toggleMatchSummary()" style="display:none;">Read more</button>
    </div>`;
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
          <div class="match-card-location">${p.location}</div>
          <div class="match-card-details">
            <span>${p.area_value ? `${roundArea(p.area_value)} ${p.area_unit}` : `${roundArea(p.size)} Sq Ft`}</span>
            <span>${formatPrice(p.price)}</span>
          </div>
          ${p.notes ? `<div class="match-card-notes">${p.notes}</div>` : ""}
        </div>
      `).join("") + `</div>`;
      html += `<button class="save-inquiry-btn" onclick="openSaveInquiryModal()">Save as Inquiry</button>`;
    }
    resultDiv.innerHTML = html;
    const st = document.getElementById("matchSummaryText");
    const tg = document.getElementById("matchSummaryToggle");
    if (st && tg && st.scrollHeight > st.clientHeight + 1) tg.style.display = "inline-block";
  } catch (err) {
    resultDiv.innerHTML = `<p class="match-error">Error connecting to AI. Please try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Find Matches";
  }
}

function openSaveInquiryModal() {
  document.getElementById("inqClientName").value = "";
  document.getElementById("inqClientPhone").value = "";
  document.getElementById("inqNotes").value = "";
  document.getElementById("saveInquiryModal").classList.add("open");
}
function closeSaveInquiryModal() { document.getElementById("saveInquiryModal").classList.remove("open"); }

async function saveInquiry(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("inqClientName").value.trim(),
    phone: document.getElementById("inqClientPhone").value.trim(),
    notes: document.getElementById("inqNotes").value.trim(),
    status: "Inquiry",
  };
  if (!payload.name) return;
  const btn = document.getElementById("saveInquiryBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    await apiFetch(`${API}/api/clients`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    closeSaveInquiryModal();
    await fetchClients();
    showTab("clients");
  } finally { btn.disabled = false; btn.textContent = "Save Client"; }
}

// ─── Clients ──────────────────────────────────────────────────────────────────

async function fetchClients() {
  const res = await apiFetch(`${API}/api/clients`);
  if (!res) return;
  allClients = await res.json();
  updateClientStats();
  renderClients();
}

function updateClientStats() {
  const el = id => document.getElementById(id);
  if (el("clientStatActive")) el("clientStatActive").textContent = allClients.filter(c => c.status === "Active").length;
  if (el("clientStatInquiry")) el("clientStatInquiry").textContent = allClients.filter(c => c.status === "Inquiry").length;
  if (el("clientStatClosed")) el("clientStatClosed").textContent = allClients.filter(c => c.status === "Closed Won" || c.status === "Closed Lost").length;
}

function setClientFilter(btn, filter) {
  clientFilter = filter;
  document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  renderClients();
}

function getClientMatches(c) {
  if (c.status !== "Active") return [];
  return allProperties.filter(p => {
    if (p.status !== "Available") return false;
    if (c.property_type && p.property_type !== c.property_type) return false;
    if (c.configuration && p.configuration !== c.configuration) return false;
    if (c.location && !p.location.toLowerCase().includes(c.location.toLowerCase())) return false;
    if (c.budget_max && c.budget_max > 0 && p.price > c.budget_max) return false;
    if (c.budget_min && c.budget_min > 0 && p.price < c.budget_min) return false;
    return true;
  });
}

function clientStatusBadge(status) {
  const map = {
    Active: "badge-client-active",
    Inquiry: "badge-client-inquiry",
    "Deal In Progress": "badge-client-progress",
    "Closed Won": "badge-client-won",
    "Closed Lost": "badge-client-lost",
  };
  return `<span class="badge ${map[status] || "badge-client-inquiry"}">${status}</span>`;
}

function renderClients() {
  const list = document.getElementById("clientsList");
  if (!list) return;
  const filtered = clientFilter ? allClients.filter(c => c.status === clientFilter) : allClients;
  if (filtered.length === 0) {
    const emptyMsg = clientFilter ? `No ${clientFilter.toLowerCase()} clients.` : "No clients yet. Add buyers and leads here.";
    list.innerHTML = `<div class="empty-state"><div class="empty-state-title">${emptyMsg}</div>${!clientFilter ? `<button class="btn-primary" onclick="openAddClientModal()">+ Add Client</button>` : ""}</div>`;
    return;
  }
  list.innerHTML = filtered.map(c => {
    const matches = getClientMatches(c);
    const matchBadge = c.status === "Active"
      ? (matches.length > 0
          ? `<button class="client-match-badge" onclick="event.stopPropagation(); showClientMatches(${c.id})">${matches.length} propert${matches.length !== 1 ? "ies" : "y"} match</button>`
          : `<span class="client-no-match">No matches</span>`)
      : "";
    const budgetText = (c.budget_min || c.budget_max)
      ? `${c.budget_min ? formatPrice(c.budget_min) : "Any"} – ${c.budget_max ? formatPrice(c.budget_max) : "Any"}`
      : null;
    const lookingFor = [c.configuration, c.property_type].filter(Boolean).join(" ") || "";
    const lookingForFull = [lookingFor, c.location].filter(Boolean).join(" in ") || null;
    const waHref = c.phone
      ? `https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${c.name}!`)}`
      : null;
    return `
      <div class="client-card" id="client-card-${c.id}">
        <div class="client-card-summary" role="button" tabindex="0" aria-expanded="false" aria-controls="client-detail-${c.id}" onclick="toggleClientCard(${c.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleClientCard(${c.id});}">
          <span class="client-card-name">${c.name}</span>
          ${c.phone ? `<a href="tel:${c.phone}" class="client-card-phone" onclick="event.stopPropagation()">${c.phone}</a>` : ""}
          <div class="client-card-badges">
            ${clientStatusBadge(c.status)}
            ${matchBadge}
          </div>
          <span class="client-card-chevron" aria-hidden="true">▾</span>
        </div>
        <div class="client-card-detail" id="client-detail-${c.id}">
          ${lookingForFull || budgetText || c.notes ? `
          <div class="client-card-body">
            ${lookingForFull ? `<div class="client-detail-row"><span class="client-detail-label">Needs</span><span class="client-detail-value">${lookingForFull}</span></div>` : ""}
            ${budgetText ? `<div class="client-detail-row"><span class="client-detail-label">Budget</span><span class="client-detail-value">${budgetText}</span></div>` : ""}
            ${c.notes ? `<div class="client-detail-row"><span class="client-detail-label">Notes</span><span class="client-detail-value">${c.notes}</span></div>` : ""}
          </div>` : ""}
          <div class="client-card-footer">
            ${waHref ? `<a href="${waHref}" target="_blank" class="btn-wa">WhatsApp</a>` : "<span></span>"}
            <div style="display:flex;gap:6px;">
              <button class="btn-fu-edit" onclick="openEditClientModal(${c.id})">Edit</button>
              <button class="btn-fu-delete" onclick="deleteClient(${c.id})">Delete</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
}

function toggleClientCard(id) {
  const card = document.getElementById(`client-card-${id}`);
  if (!card) return;
  const expanded = card.classList.toggle("expanded");
  const summary = card.querySelector(".client-card-summary");
  if (summary) summary.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function showClientMatches(id) {
  const c = allClients.find(x => x.id === id);
  if (!c) return;
  const matches = getClientMatches(c);
  document.getElementById("clientMatchTitle").textContent = `Matches for ${c.name}`;
  document.getElementById("clientMatchDesc").textContent = `${matches.length} available propert${matches.length !== 1 ? "ies" : "y"} match${matches.length === 1 ? "es" : ""} their requirements.`;
  document.getElementById("clientMatchList").innerHTML = matches.map(p => `
    <div class="buyer-match-item">
      <div>
        <div style="font-weight:600;font-size:14px;">${p.configuration} ${p.property_type}</div>
        <div style="font-size:13px;color:var(--text-2);">${p.location}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px;">${formatArea(p)} · ${formatPrice(p.price)} · ${p.status}</div>
      </div>
      ${c.phone ? `<a href="https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${c.name}! I have a property that matches your requirements: ${p.configuration} ${p.property_type} in ${p.location}, ${formatArea(p)} at ${formatPrice(p.price)}. Interested?`)}" target="_blank" class="btn-wa" style="flex-shrink:0;">WhatsApp</a>` : ""}
    </div>`).join("");
  document.getElementById("clientMatchModal").classList.add("open");
}
function closeClientMatchModal() { document.getElementById("clientMatchModal").classList.remove("open"); }

function openAddClientModal() {
  editingClientId = null;
  document.getElementById("clientModalTitle").textContent = "Add Client";
  document.getElementById("clientForm").reset();
  document.getElementById("clientStatus").value = "Inquiry";
  document.getElementById("clientBudgetMinConv").textContent = "";
  document.getElementById("clientBudgetMaxConv").textContent = "";
  document.getElementById("addClientModal").classList.add("open");
}

function openEditClientModal(id) {
  const c = allClients.find(x => x.id === id);
  if (!c) return;
  editingClientId = id;
  document.getElementById("clientModalTitle").textContent = "Edit Client";
  document.getElementById("clientName").value = c.name;
  document.getElementById("clientPhone").value = c.phone || "";
  document.getElementById("clientType").value = c.property_type || "";
  document.getElementById("clientConfig").value = c.configuration || "";
  document.getElementById("clientLocation").value = c.location || "";
  document.getElementById("clientBudgetMin").value = c.budget_min || "";
  document.getElementById("clientBudgetMax").value = c.budget_max || "";
  document.getElementById("clientStatus").value = c.status;
  document.getElementById("clientNotes").value = c.notes || "";
  updatePriceConversion("clientBudgetMin", "clientBudgetMinConv");
  updatePriceConversion("clientBudgetMax", "clientBudgetMaxConv");
  document.getElementById("addClientModal").classList.add("open");
}

function closeAddClientModal() { document.getElementById("addClientModal").classList.remove("open"); editingClientId = null; }

async function saveClient(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("clientName").value.trim(),
    phone: document.getElementById("clientPhone").value.trim(),
    property_type: document.getElementById("clientType").value,
    configuration: document.getElementById("clientConfig").value,
    location: document.getElementById("clientLocation").value.trim(),
    budget_min: 0,
    budget_max: 0,
    status: document.getElementById("clientStatus").value,
    notes: document.getElementById("clientNotes").value.trim(),
  };
  const minRaw = document.getElementById("clientBudgetMin").value.trim();
  const maxRaw = document.getElementById("clientBudgetMax").value.trim();
  if (minRaw) {
    const v = parsePriceInput(minRaw);
    if (isNaN(v)) { alert("Budget Min isn't valid. Try e.g. 4000000, 40L, or 1.5Cr."); document.getElementById("clientBudgetMin").focus(); return; }
    payload.budget_min = v;
  }
  if (maxRaw) {
    const v = parsePriceInput(maxRaw);
    if (isNaN(v)) { alert("Budget Max isn't valid. Try e.g. 8000000, 80L, or 1.5Cr."); document.getElementById("clientBudgetMax").focus(); return; }
    payload.budget_max = v;
  }
  const btn = document.getElementById("saveClientBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    if (editingClientId) {
      await apiFetch(`${API}/api/clients/${editingClientId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await apiFetch(`${API}/api/clients`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    closeAddClientModal();
    await fetchClients();
  } finally { btn.disabled = false; btn.textContent = "Save Client"; }
}

async function deleteClient(id) {
  if (!confirm("Delete this client?")) return;
  await apiFetch(`${API}/api/clients/${id}`, { method: "DELETE" });
  await fetchClients();
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
  const count = followups.filter(f => f.status === "Pending" && f.reminder_date < TODAY).length;
  [
    document.getElementById("overdueBadge"),
    document.getElementById("sidebarOverdueBadge"),
    document.getElementById("btabOverdueBadge"),
  ].forEach(el => {
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? "inline-flex" : "none";
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function renderDashboard() {
  const totalEl = document.getElementById("dashClientsTotal");
  const activeEl = document.getElementById("dashClientsActive");
  const followupsEl = document.getElementById("dashFollowupsCount");
  if (totalEl) totalEl.textContent = allClients.length;
  if (activeEl) activeEl.textContent = allClients.filter(c => c.status === "Active").length;
  if (followupsEl) {
    const pending = allFollowups.filter(f => f.status === "Pending" && f.reminder_date <= TODAY).length;
    followupsEl.textContent = pending;
  }
  const recentEl = document.getElementById("dashRecentProps");
  if (!recentEl) return;
  const recent = allProperties.slice(0, 6);
  if (recent.length === 0) {
    recentEl.innerHTML = `<div class="empty-state"><div class="empty-state-title">No properties yet</div><div class="empty-state-msg">Add your first property to get started.</div><button class="btn-primary" onclick="openAddModal()">+ Add Property</button></div>`;
    return;
  }
  recentEl.innerHTML = `<div class="dash-recent-list">${recent.map(p => {
    const line2 = [p.configuration, formatArea(p), formatPrice(p.price)].filter(Boolean).join(" · ");
    return `<div class="dash-recent-item">
      <div class="dash-recent-row">
        <div class="dash-recent-main">
          <div class="dash-recent-line1">${p.property_type} · ${p.location}</div>
          <div class="dash-recent-line2">${line2}</div>
        </div>
        <div class="dash-recent-right">${statusBadge(p.status)}</div>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function renderFollowups(followups) {
  const container = document.getElementById("followupsCards");
  const overdueDiv = document.getElementById("overdueAlert");

  if (!Array.isArray(followups) || followups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No follow-ups yet</div>
        <div class="empty-state-msg">Add reminders to follow up with clients. Overdue reminders appear in red, today's in orange.</div>
        <button class="btn-primary" onclick="openAddFollowupModal()">+ Add Follow-up</button>
      </div>`;
    if (overdueDiv) overdueDiv.style.display = "none";
    return;
  }

  const overdue = followups.filter(f => f.status === "Pending" && f.reminder_date < TODAY);
  const rest = followups.filter(f => !(f.status === "Pending" && f.reminder_date < TODAY));
  const sorted = [...overdue, ...rest];

  if (overdueDiv) {
    if (overdue.length > 0) {
      overdueDiv.style.display = "block";
      overdueDiv.innerHTML = `<strong>${overdue.length} overdue follow-up${overdue.length !== 1 ? "s" : ""}</strong> — shown below in red. Mark them done once actioned.`;
    } else {
      overdueDiv.style.display = "none";
    }
  }

  container.innerHTML = sorted.map(f => {
    const isOverdue = f.status === "Pending" && f.reminder_date < TODAY;
    const isToday = f.reminder_date === TODAY;
    const displayDate = new Date(f.reminder_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const isDone = f.status === "Done";
    const cardClass = isOverdue ? "followup-card fu-overdue"
      : isToday ? "followup-card fu-today"
      : isDone ? "followup-card fu-done"
      : "followup-card fu-future";
    const dateBadge = isOverdue
      ? `<span class="fu-date-badge overdue">${displayDate} — Overdue</span>`
      : isToday
      ? `<span class="fu-date-badge today">Today</span>`
      : `<span class="fu-date-badge">${displayDate}</span>`;
    const statusBadgeHtml = f.status === "Done"
      ? `<span class="badge badge-available">Done</span>`
      : `<span class="badge badge-reserved">Pending</span>`;
    const waText = encodeURIComponent(`Hi, just a reminder: ${f.note}`);
    return `
      <div class="${cardClass}">
        <div class="followup-card-header">
          <span class="followup-client">${f.client_name}</span>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${dateBadge} ${statusBadgeHtml}</div>
        </div>
        <div class="followup-note">${f.note}</div>
        <div class="followup-card-footer">
          <a href="https://wa.me/?text=${waText}" target="_blank" class="btn-wa">WhatsApp</a>
          ${f.status === "Pending" ? `<button class="btn-done" onclick="markFollowupDone(${f.id})">Mark Done</button>` : ""}
          <button class="btn-fu-edit" onclick="openEditFollowupModal(${f.id})">Edit</button>
          <button class="btn-fu-delete" onclick="deleteFollowup(${f.id})">Delete</button>
        </div>
      </div>`;
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
  btn.classList.toggle("active", isHidden);
  btn.textContent = isHidden ? "✕ Close AI" : "✨ AI Add";
  if (isHidden) document.getElementById("quickAddText").focus();
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
      resultDiv.innerHTML = `<p class="parse-error">${data.error}</p>`;
      return;
    }
    parsedProperty = data;
    renderConfirmCard(data);
  } catch (err) {
    resultDiv.innerHTML = `<p class="parse-error">Error connecting to AI. Please try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Parse with AI";
  }
}

function renderConfirmCard(p) {
  const resultDiv = document.getElementById("parseResult");
  const CONFIGS = ["1BHK","2BHK","3BHK","4BHK+","Shop/Office","Plot","Other"];
  const TYPES = ["Apartment","House","Villa","Office","Shop","Land","Warehouse"];
  const UNITS = ["Sq Ft","Sq Yards","Gaj","Marla","Kanal","Bigha"];
  const STATUSES = ["Available","Reserved","Under Negotiation","Sold","Rented","Withdrawn"];

  const initSqft = p.area_value && p.area_unit && p.area_unit !== "Sq Ft"
    ? `≈ ${roundArea(toSqft(p.area_value, p.area_unit))} Sq Ft`
    : "";

  resultDiv.innerHTML = `
    <div class="confirm-card">
      <div class="confirm-card-title">
        <span>Confirm extracted details</span>
        ${p.assumptions ? `<span class="confirm-note" title="${p.assumptions}">AI made some assumptions</span>` : ""}
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
          <input type="text" id="confirmPrice" value="${p.price > 0 ? p.price : ""}" inputmode="text" placeholder="e.g. 7000000 or 70L" oninput="updatePriceConversion('confirmPrice','confirmPriceConv')" />
          <div class="area-conversion" id="confirmPriceConv">${p.price > 0 ? "≈ " + formatPriceWords(p.price) : ""}</div>
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
        <button class="btn-cancel" onclick="discardParsed()">Discard</button>
        <button class="btn-primary" id="confirmAddBtn" onclick="saveParsedProperty()">Add to Inventory</button>
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
    price: parsePriceInput(document.getElementById("confirmPrice").value),
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
    btn.textContent = "Add to Inventory";
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.getElementById("searchInput").addEventListener("input", fetchProperties);
document.getElementById("statusFilter").addEventListener("change", fetchProperties);
document.getElementById("typeFilter").addEventListener("change", fetchProperties);
document.getElementById("propForm").addEventListener("submit", saveProperty);
document.getElementById("saveInquiryForm").addEventListener("submit", saveInquiry);
document.getElementById("clientForm").addEventListener("submit", saveClient);
document.getElementById("followupForm").addEventListener("submit", saveFollowup);
document.getElementById("settingsForm").addEventListener("submit", saveSettings);

document.getElementById("propAreaValue").addEventListener("input", () =>
  updateAreaConversion("propAreaValue", "propAreaUnit", "propAreaConversion"));
document.getElementById("propAreaUnit").addEventListener("change", () =>
  updateAreaConversion("propAreaValue", "propAreaUnit", "propAreaConversion"));

document.getElementById("settingName").addEventListener("input", updateSettingsPreview);
document.getElementById("settingPhone").addEventListener("input", updateSettingsPreview);
document.getElementById("settingTagline").addEventListener("input", updateSettingsPreview);

["propModal","saveInquiryModal","addClientModal","clientMatchModal","addFollowupModal","buyerMatchModal"].forEach(id => {
  document.getElementById(id).addEventListener("click", function(e) { if (e.target === this) this.classList.remove("open"); });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initApp() {
  await fetchProperties();
  await Promise.all([
    fetchClients(),
    fetchFollowups(),
    fetchSettings(),
  ]);
  renderDashboard();
}

initApp();
