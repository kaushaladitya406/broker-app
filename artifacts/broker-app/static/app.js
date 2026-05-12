const API = "";

let allProperties = [];
let allInquiries = [];
let editingId = null;
let editingInquiryId = null;
let lastMatchedIds = [];
let lastMatchMessage = "";

function formatPrice(n) {
  return "Rs " + Number(n).toLocaleString("en-IN");
}

async function fetchProperties() {
  const q = document.getElementById("searchInput").value;
  const status = document.getElementById("statusFilter").value;
  const type = document.getElementById("typeFilter").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  const res = await fetch(`${API}/api/properties?${params}`);
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
  const map = {
    Available: "badge-available",
    Reserved: "badge-reserved",
    Sold: "badge-sold",
    Rented: "badge-rented",
  };
  return `<span class="badge ${map[status] || "badge-available"}">${status}</span>`;
}

function inquiryStatusBadge(status) {
  const map = {
    New: "badge-inq-new",
    "In Progress": "badge-inq-progress",
    Closed: "badge-inq-closed",
    Lost: "badge-inq-lost",
  };
  return `<span class="badge ${map[status] || "badge-inq-new"}">${status}</span>`;
}

function renderTable(props) {
  const tbody = document.getElementById("propertiesBody");
  if (props.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No properties found. Add your first property above.</td></tr>`;
    return;
  }
  tbody.innerHTML = props.map(p => `
    <tr class="prop-row" data-id="${p.id}">
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
      await fetch(`${API}/api/properties/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`${API}/api/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    closeModal();
    await fetchProperties();
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Property";
  }
}

async function deleteProperty(id) {
  if (!confirm("Delete this property?")) return;
  await fetch(`${API}/api/properties/${id}`, { method: "DELETE" });
  await fetchProperties();
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
    const res = await fetch(`${API}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (data.error) {
      resultDiv.innerHTML = `<p class="match-error">${data.error}</p>`;
      return;
    }
    const matches = data.matches || [];
    const summary = data.summary || "";
    lastMatchedIds = data.matched_ids || [];
    lastMatchMessage = message;

    let html = `<div class="match-summary"><p>${summary}</p></div>`;
    if (matches.length === 0) {
      html += `<p class="match-none">No matching properties found in inventory.</p>`;
    } else {
      html += `<div class="match-count">${matches.length} match${matches.length !== 1 ? "es" : ""} found</div>`;
      html += `<div class="match-list">` + matches.map(p => `
        <div class="match-card">
          <div class="match-card-header">
            <span class="type-tag">${p.property_type}</span>
            ${statusBadge(p.status)}
          </div>
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

function closeSaveInquiryModal() {
  document.getElementById("saveInquiryModal").classList.remove("open");
}

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
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    await fetch(`${API}/api/inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    closeSaveInquiryModal();
    await fetchInquiries();
    showTab("inquiries");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Inquiry";
  }
}

async function fetchInquiries() {
  const statusFilter = document.getElementById("inqStatusFilter")?.value || "";
  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  const res = await fetch(`${API}/api/inquiries?${params}`);
  allInquiries = await res.json();
  renderInquiries(allInquiries);
  updateInquiryStats();
}

function updateInquiryStats() {
  const total = allInquiries.length;
  const newCount = allInquiries.filter(i => i.status === "New").length;
  const inProgress = allInquiries.filter(i => i.status === "In Progress").length;
  const closed = allInquiries.filter(i => i.status === "Closed").length;
  document.getElementById("inqStatTotal").textContent = total;
  document.getElementById("inqStatNew").textContent = newCount;
  document.getElementById("inqStatProgress").textContent = inProgress;
  document.getElementById("inqStatClosed").textContent = closed;
}

function renderInquiries(inquiries) {
  const tbody = document.getElementById("inquiriesBody");
  if (inquiries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No inquiries yet. Use the AI matcher and save a result.</td></tr>`;
    return;
  }
  tbody.innerHTML = inquiries.map(inq => {
    const date = new Date(inq.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const propCount = Array.isArray(inq.matched_property_ids) ? inq.matched_property_ids.length : 0;
    const shortMsg = inq.whatsapp_message.length > 60
      ? inq.whatsapp_message.slice(0, 60) + "…"
      : inq.whatsapp_message;
    return `
      <tr class="prop-row">
        <td><strong>${inq.client_name}</strong></td>
        <td class="msg-cell" title="${inq.whatsapp_message}">${shortMsg}</td>
        <td><span class="prop-count-badge">${propCount} propert${propCount !== 1 ? "ies" : "y"}</span></td>
        <td>${inquiryStatusBadge(inq.status)}</td>
        <td>
          <div class="inq-meta">${date}</div>
          ${inq.notes ? `<div class="inq-notes">${inq.notes}</div>` : ""}
        </td>
        <td class="actions-cell">
          <button class="btn-icon btn-edit" onclick="openEditInquiry(${inq.id})" title="Edit">✏️</button>
          <button class="btn-icon btn-delete" onclick="deleteInquiry(${inq.id})" title="Delete">🗑️</button>
        </td>
      </tr>
    `;
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

function closeEditInquiryModal() {
  document.getElementById("editInquiryModal").classList.remove("open");
  editingInquiryId = null;
}

async function updateInquiry(e) {
  e.preventDefault();
  const payload = {
    client_name: document.getElementById("editInqClientName").value.trim(),
    notes: document.getElementById("editInqNotes").value.trim(),
    status: document.getElementById("editInqStatus").value,
  };
  const btn = document.getElementById("updateInquiryBtn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    await fetch(`${API}/api/inquiries/${editingInquiryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    closeEditInquiryModal();
    await fetchInquiries();
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Changes";
  }
}

async function deleteInquiry(id) {
  if (!confirm("Delete this inquiry?")) return;
  await fetch(`${API}/api/inquiries/${id}`, { method: "DELETE" });
  await fetchInquiries();
}

function showTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`tab-${tab}`).classList.add("active");
  document.getElementById(`panel-${tab}`).classList.add("active");
  if (tab === "inquiries") fetchInquiries();
  if (tab === "inventory") fetchProperties();
}

document.getElementById("searchInput").addEventListener("input", fetchProperties);
document.getElementById("statusFilter").addEventListener("change", fetchProperties);
document.getElementById("typeFilter").addEventListener("change", fetchProperties);
document.getElementById("propForm").addEventListener("submit", saveProperty);
document.getElementById("propModal").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});
document.getElementById("saveInquiryModal").addEventListener("click", function(e) {
  if (e.target === this) closeSaveInquiryModal();
});
document.getElementById("editInquiryModal").addEventListener("click", function(e) {
  if (e.target === this) closeEditInquiryModal();
});
document.getElementById("saveInquiryForm").addEventListener("submit", saveInquiry);
document.getElementById("editInquiryForm").addEventListener("submit", updateInquiry);
document.getElementById("inqStatusFilter").addEventListener("change", fetchInquiries);

fetchProperties();
