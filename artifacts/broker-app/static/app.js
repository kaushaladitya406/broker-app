const API = "";

let allProperties = [];
let editingId = null;

const propertyTypes = ["Apartment", "House", "Villa", "Office", "Shop", "Land", "Warehouse"];
const statusOptions = ["Available", "Reserved", "Sold", "Rented"];

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
  document.getElementById("statAvgPrice").textContent = total > 0 ? `$${Math.round(avgPrice).toLocaleString()}` : "-";
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
      <td>${p.size.toLocaleString()} sqm</td>
      <td>$${p.price.toLocaleString()}</td>
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
            <span>📐 ${p.size.toLocaleString()} sqm</span>
            <span>💰 $${p.price.toLocaleString()}</span>
          </div>
        </div>
      `).join("") + `</div>`;
    }
    resultDiv.innerHTML = html;
  } catch (err) {
    resultDiv.innerHTML = `<p class="match-error">Error connecting to AI. Please try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Find Matches";
  }
}

document.getElementById("searchInput").addEventListener("input", fetchProperties);
document.getElementById("statusFilter").addEventListener("change", fetchProperties);
document.getElementById("typeFilter").addEventListener("change", fetchProperties);
document.getElementById("propForm").addEventListener("submit", saveProperty);
document.getElementById("propModal").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

fetchProperties();
