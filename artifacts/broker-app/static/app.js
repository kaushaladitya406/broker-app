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

const TODAY = new Date().toISOString().slice(0, 10);

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

function renderTable(props) {
  const tbody = document.getElementById("propertiesBody");
  if (!Array.isArray(props) || props.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No properties found. Add your first one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = props.map(p => `
    <tr class="prop-row">
      <td><span class="type-tag">${p.property_type}</span></td>
      <td>${p.location}</td>
      <td>${Number(p.size).toLocaleString("en-IN")} sq ft</td>
      <td>${formatPrice(p.price)}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="actions-cell">
        <button class="btn-icon btn-edit" onclick="openEditModal(${p.id})" title="Edit">✏️</button>
        <button class="btn-icon btn-delete" onclick="deleteProperty(${p.id})" title="Delete">🗑️</button>
      </td>
    </tr>
  `).join("");
}

function openAddModal() {
  editingId = null;
  document.getElementById("modalTitle").textContent = "Add Property";
  document.getElementById("propForm").reset();
  document.getElementById("propModal").classList.add("open");
}

function openEditModal(id) {
  const p = allProperties.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById("modalTitle").textContent = "Edit Property";
  document.getElementById("propType").value = p.property_type;
  document.getElementById("propLocation").value = p.location;
  document.getElementById("propSize").value = p.size;
  document.getElementById("propPrice").value = p.price;
  document.getElementById("propStatus").value = p.status;
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
    size: parseFloat(document.getElementById("propSize").value),
    price: parseFloat(document.getElementById("propPrice").value),
    status: document.getElementById("propStatus").value,
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
          <div class="match-card-header"><span class="type-tag">${p.property_type}</span>${statusBadge(p.status)}</div>
          <div class="match-card-location">📍 ${p.location}</div>
          <div class="match-card-details">
            <span>📐 ${Number(p.size).toLocaleString("en-IN")} sq ft</span>
            <span>💰 ${formatPrice(p.price)}</span>
          </div>
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
      <td><strong>${inq.client_name}</strong></td>
      <td class="msg-cell" title="${inq.whatsapp_message}">${shortMsg}</td>
      <td><span class="prop-count-badge">${propCount} propert${propCount !== 1 ? "ies" : "y"}</span></td>
      <td>${inquiryStatusBadge(inq.status)}</td>
      <td><div class="inq-meta">${date}</div>${inq.notes ? `<div class="inq-notes">${inq.notes}</div>` : ""}</td>
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
      <td><strong>${b.name}</strong></td>
      <td><a href="tel:${b.phone}" class="phone-link">📞 ${b.phone}</a></td>
      <td>${b.property_type ? `<span class="type-tag">${b.property_type}</span>` : '<span class="text-muted">Any</span>'}</td>
      <td>${b.location || '<span class="text-muted">Any</span>'}</td>
      <td class="budget-cell">
        ${b.budget_min || b.budget_max
          ? `${b.budget_min ? formatPrice(b.budget_min) : "—"} – ${b.budget_max ? formatPrice(b.budget_max) : "—"}`
          : '<span class="text-muted">Not set</span>'}
      </td>
      <td class="msg-cell">${b.notes || ""}</td>
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
      <td><strong>${f.client_name}</strong></td>
      <td>${f.note}</td>
      <td>${dateBadge}</td>
      <td>${statusBadgeHtml}</td>
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

["propModal","saveInquiryModal","editInquiryModal","addBuyerModal","addFollowupModal","buyerMatchModal"].forEach(id => {
  document.getElementById(id).addEventListener("click", function(e) { if (e.target === this) this.classList.remove("open"); });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

fetchProperties();
apiFetch(`${API}/api/followups`).then(r => r && r.json()).then(data => {
  if (Array.isArray(data)) { allFollowups = data; updateOverdueBadge(data); }
});
