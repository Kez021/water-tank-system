/* ============================================================
   ADMIN DASHBOARD — admin.js
   Automated Overhead Tank System
   ============================================================

   ✅ DEPLOYMENT CONFIG:
   Change RAILWAY_URL to your Railway URL after deploying.
   For local testing keep: "http://localhost:8080"
   ============================================================ */

const RAILWAY_URL = "http://localhost:8080"; // 👈 Change this after Railway deployment

/* ===== ADMIN CREDENTIALS (hardcoded — keep this private) ===== */
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "tank@admin2024"; // Change this to your own password

/* ===== GLOBAL STATE ===== */
let allUsersData = [];
let allTanksData = [];
let allLogsData = [];
let allTicketsData = [];
let currentTicketFilter = 'all';
let autoRefreshTimer = null;

/* ============================================================
   1. LOGIN / LOGOUT
   ============================================================ */
function adminLogin() {
    const username = document.getElementById("admin-username").value.trim();
    const password = document.getElementById("admin-password").value;
    const errorEl = document.getElementById("login-error");

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        sessionStorage.setItem("adminLoggedIn", "true");
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("admin-dashboard").style.display = "flex";
        initDashboard();
    } else {
        errorEl.style.display = "block";
        setTimeout(() => errorEl.style.display = "none", 3000);
    }
}

function adminLogout() {
    sessionStorage.removeItem("adminLoggedIn");
    location.reload();
}

/* ============================================================
   2. SECTION NAVIGATION
   ============================================================ */
function showSection(name) {
    document.querySelectorAll(".admin-section").forEach(s => s.style.display = "none");
    document.querySelectorAll(".admin-nav-item").forEach(n => n.classList.remove("active"));

    document.getElementById(`section-${name}`).style.display = "block";
    document.querySelector(`[onclick="showSection('${name}')"]`).classList.add("active");

    const titles = { overview: "Overview", users: "All Users", tanks: "All Tanks", logs: "Activity Logs", tickets: "Support Tickets" };
    document.getElementById("section-title").textContent = titles[name] || name;
}

/* ============================================================
   3. LOADING UI
   ============================================================ */
function showLoading() { document.getElementById("loading-overlay").classList.add("active"); }
function hideLoading() { document.getElementById("loading-overlay").classList.remove("active"); }

function updateRefreshTime() {
    const now = new Date();
    document.getElementById("last-refresh-time").textContent =
        "Updated: " + now.toLocaleTimeString("en-PH", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ============================================================
   4. FETCH ALL DATA
   ============================================================ */
async function initDashboard() {
    await refreshAll();
    // Auto-refresh every 30 seconds
    autoRefreshTimer = setInterval(refreshAll, 30000);
}

async function refreshAll() {
    showLoading();
    try {
        await Promise.all([
            loadStats(),
            loadUsers(),
            loadTanks(),
            loadLogs(),
            loadTickets()
        ]);
        updateRefreshTime();
    } catch (err) {
        console.error("Refresh error:", err);
    } finally {
        hideLoading();
    }
}

/* ===== STATS ===== */
async function loadStats() {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/admin/stats`);
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById("stat-users").textContent = data.totalUsers ?? "--";
        document.getElementById("stat-tanks").textContent = data.totalTanks ?? "--";
        document.getElementById("stat-online").textContent = data.onlineTanks ?? "--";
        document.getElementById("stat-tickets").textContent = data.openTickets ?? "--";

        // Update ticket badge in sidebar
        const badge = document.getElementById("ticket-badge");
        if (data.openTickets > 0) {
            badge.textContent = data.openTickets;
            badge.style.display = "inline-block";
        } else {
            badge.style.display = "none";
        }
    } catch (e) { console.warn("Stats error:", e); }
}

/* ===== USERS ===== */
async function loadUsers() {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/admin/all-users`);
        if (!res.ok) return;
        allUsersData = await res.json();
        renderUsersTable(allUsersData);
    } catch (e) { console.warn("Users error:", e); }
}

function renderUsersTable(users) {
    const tbody = document.getElementById("users-table-body");
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-text">No users registered yet.</td></tr>';
        return;
    }
    tbody.innerHTML = users.map((u, i) => `
        <tr>
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td><strong>${u.fullName || "—"}</strong></td>
            <td>${u.email}</td>
            <td>${u.phoneNumber || "—"}</td>
            <td><span class="pill pill-blue">${u.tankCount} tank${u.tankCount !== 1 ? 's' : ''}</span></td>
            <td>
                <button class="view-btn" onclick="viewUserDetail('${u.email}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        </tr>
    `).join('');
}

function filterUsers() {
    const q = document.getElementById("user-search").value.toLowerCase();
    const filtered = allUsersData.filter(u =>
        (u.fullName || "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
    renderUsersTable(filtered);
}

async function viewUserDetail(email) {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/admin/user-detail?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        const modal = document.getElementById("user-detail-modal");
        const content = document.getElementById("user-detail-content");

        const tanksHtml = (data.tanks || []).map(t => `
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:14px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong>${t.tankName || "Tank"}</strong>
                    <span class="pill ${getStatusPill(t)}">${getStatusText(t)}</span>
                </div>
                <div style="color:var(--text-muted);font-size:0.82rem;margin-top:6px;">
                    ID: ${t.tankId} &nbsp;|&nbsp; Level: ${(t.waterLevel || 0).toFixed(1)}% &nbsp;|&nbsp; Pump: ${t.pumpStatus} &nbsp;|&nbsp; Mode: ${t.isAutomatic ? "Auto" : "Manual"}
                </div>
            </div>
        `).join('') || '<p style="color:var(--text-muted)">No tanks registered.</p>';

        content.innerHTML = `
            <div class="detail-row"><span class="detail-label">Full Name</span><span class="detail-value">${data.fullName}</span></div>
            <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${data.email}</span></div>
            <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${data.phoneNumber || "—"}</span></div>
            <div style="margin-top:16px;"><h4 style="margin-bottom:12px;">Tanks</h4>${tanksHtml}</div>
        `;
        modal.style.display = "flex";
    } catch (e) { console.error("User detail error:", e); }
}

/* ===== TANKS ===== */
async function loadTanks() {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/admin/all-tanks`);
        if (!res.ok) return;
        allTanksData = await res.json();
        renderTanksTable(allTanksData);
        renderOverviewTanks(allTanksData);
    } catch (e) { console.warn("Tanks error:", e); }
}

function getStatusText(t) {
    if (!t.lastUpdated) return "Never Synced";
    const diff = (new Date() - new Date(t.lastUpdated)) / 1000;
    if (diff <= 30) return "Online";
    if (t.waterLevel <= t.lowerThreshold) return "Warning";
    return "Offline";
}

function getStatusPill(t) {
    const s = getStatusText(t);
    if (s === "Online") return "pill-green";
    if (s === "Warning") return "pill-orange";
    if (s === "Never Synced") return "pill-gray";
    return "pill-gray";
}

function getLevelClass(level) {
    if (level >= 60) return "high";
    if (level >= 30) return "mid";
    return "low";
}

function formatDate(dateStr) {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderTanksTable(tanks) {
    const tbody = document.getElementById("tanks-table-body");
    if (!tanks.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-text">No tanks found.</td></tr>';
        return;
    }
    tbody.innerHTML = tanks.map(t => {
        const level = (t.waterLevel || 0).toFixed(1);
        const lc = getLevelClass(t.waterLevel);
        const status = getStatusText(t);
        const pillClass = getStatusPill(t);
        return `<tr>
            <td><code style="font-size:0.82rem;color:var(--text-muted)">${t.tankId}</code></td>
            <td><strong>${t.tankName || "—"}</strong></td>
            <td>${t.ownerName || "—"}<br><small style="color:var(--text-muted)">${t.ownerEmail || ""}</small></td>
            <td>
                <div class="level-bar-wrap">
                    <div class="level-bar-bg"><div class="level-bar-fill ${lc}" style="width:${level}%"></div></div>
                    <span>${level}%</span>
                </div>
            </td>
            <td>${(t.maxCapacity || 0).toLocaleString()}L</td>
            <td><span class="pill ${t.isAutomatic ? 'pill-teal' : 'pill-purple'}">${t.isAutomatic ? "Auto" : "Manual"}</span></td>
            <td><span class="pill ${t.pumpStatus === 'ON' ? 'pill-green' : 'pill-gray'}">${t.pumpStatus}</span></td>
            <td><span class="pill ${pillClass}">${status}</span></td>
            <td style="color:var(--text-muted);font-size:0.82rem">${formatDate(t.lastUpdated)}</td>
        </tr>`;
    }).join('');
}

function renderOverviewTanks(tanks) {
    const tbody = document.getElementById("overview-tanks-body");
    if (!tanks.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-text">No tanks found.</td></tr>';
        return;
    }
    tbody.innerHTML = tanks.map(t => {
        const level = (t.waterLevel || 0).toFixed(1);
        const lc = getLevelClass(t.waterLevel);
        const status = getStatusText(t);
        const pillClass = getStatusPill(t);
        return `<tr>
            <td><code style="font-size:0.8rem;color:var(--text-muted)">${t.tankId}</code></td>
            <td><strong>${t.tankName || "—"}</strong></td>
            <td>${t.ownerName || "—"}</td>
            <td>
                <div class="level-bar-wrap">
                    <div class="level-bar-bg"><div class="level-bar-fill ${lc}" style="width:${level}%"></div></div>
                    <span>${level}%</span>
                </div>
            </td>
            <td><span class="pill ${t.pumpStatus === 'ON' ? 'pill-green' : 'pill-gray'}">${t.pumpStatus}</span></td>
            <td><span class="pill ${pillClass}">${status}</span></td>
            <td style="color:var(--text-muted);font-size:0.82rem">${formatDate(t.lastUpdated)}</td>
        </tr>`;
    }).join('');
}

function filterTanks() {
    const q = document.getElementById("tank-search").value.toLowerCase();
    const filtered = allTanksData.filter(t =>
        (t.tankId || "").toLowerCase().includes(q) ||
        (t.ownerEmail || "").toLowerCase().includes(q) ||
        (t.ownerName || "").toLowerCase().includes(q) ||
        (t.tankName || "").toLowerCase().includes(q)
    );
    renderTanksTable(filtered);
}

/* ===== LOGS ===== */
async function loadLogs() {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/admin/all-logs?limit=200`);
        if (!res.ok) return;
        allLogsData = await res.json();
        renderLogsTable(allLogsData);
    } catch (e) { console.warn("Logs error:", e); }
}

function renderLogsTable(logs) {
    const tbody = document.getElementById("logs-table-body");
    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-text">No activity logs found.</td></tr>';
        return;
    }
    tbody.innerHTML = logs.map(l => {
        const actionPill = l.action === "Consumption" ? "pill-blue" :
                           l.action === "Auto Refill Triggered" ? "pill-green" :
                           l.action === "Notification" ? "pill-orange" : "pill-gray";
        return `<tr>
            <td style="color:var(--text-muted);font-size:0.82rem;white-space:nowrap">${formatDate(l.timestamp)}</td>
            <td><code style="font-size:0.82rem;color:var(--text-muted)">${l.tankId || "—"}</code></td>
            <td><span class="pill ${actionPill}">${l.action || "—"}</span></td>
            <td>${l.status || "—"}</td>
            <td style="max-width:200px;color:var(--text-muted);font-size:0.82rem">${l.details || "—"}</td>
            <td>${l.amount != null ? l.amount.toFixed(2) + "L" : "—"}</td>
        </tr>`;
    }).join('');
}

function filterLogs() {
    const q = document.getElementById("log-search").value.toLowerCase();
    const filtered = allLogsData.filter(l =>
        (l.action || "").toLowerCase().includes(q) ||
        (l.status || "").toLowerCase().includes(q) ||
        (l.details || "").toLowerCase().includes(q) ||
        (l.tankId || "").toLowerCase().includes(q)
    );
    renderLogsTable(filtered);
}

/* ===== SUPPORT TICKETS ===== */
async function loadTickets() {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/admin/support/all`);
        if (!res.ok) return;
        allTicketsData = await res.json();
        renderTickets(allTicketsData, currentTicketFilter);
    } catch (e) { console.warn("Tickets error:", e); }
}

function filterTickets(status, btn) {
    currentTicketFilter = status;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const filtered = status === 'all' ? allTicketsData :
                     allTicketsData.filter(t => t.status === status);
    renderTickets(filtered, status);
}

function renderTickets(tickets, filter) {
    const container = document.getElementById("tickets-container");
    if (!tickets.length) {
        container.innerHTML = `<div class="loading-text">No ${filter === 'all' ? '' : filter.toLowerCase() + ' '}tickets found.</div>`;
        return;
    }

    container.innerHTML = tickets.map(t => {
        const statusClass = t.status === "Open" ? "open" : t.status === "In Progress" ? "in-progress" : "resolved";
        const statusPill = t.status === "Open" ? "pill-orange" : t.status === "In Progress" ? "pill-blue" : "pill-green";
        const hasAttachment = t.attachmentOriginalName;
        return `
            <div class="ticket-card ${statusClass}" onclick="openTicketModal(${t.id})">
                <div class="ticket-header">
                    <div>
                        <div class="ticket-user">${t.userName || "Unknown User"}</div>
                        <div class="ticket-meta">
                            📧 ${t.userEmail} &nbsp;·&nbsp;
                            🏷️ ${t.category || "General"} &nbsp;·&nbsp;
                            🕐 ${formatDate(t.submittedAt)}
                        </div>
                    </div>
                    <span class="pill ${statusPill}">${t.status}</span>
                </div>
                <div class="ticket-message">${(t.message || "").slice(0, 180)}${(t.message || "").length > 180 ? "..." : ""}</div>
                ${hasAttachment ? `<div class="ticket-attachment"><i class="fas fa-paperclip"></i> ${t.attachmentOriginalName}</div>` : ""}
                ${t.adminNote ? `<div style="margin-top:10px;color:var(--accent-teal);font-size:0.82rem;"><i class="fas fa-reply"></i> Admin: ${t.adminNote}</div>` : ""}
            </div>
        `;
    }).join('');
}

function openTicketModal(ticketId) {
    const t = allTicketsData.find(x => x.id === ticketId);
    if (!t) return;

    const statusPill = t.status === "Open" ? "pill-orange" : t.status === "In Progress" ? "pill-blue" : "pill-green";
    const content = document.getElementById("ticket-modal-content");
    content.innerHTML = `
        <div class="detail-row"><span class="detail-label">User</span><span class="detail-value"><strong>${t.userName || "—"}</strong></span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${t.userEmail}</span></div>
        <div class="detail-row"><span class="detail-label">Category</span><span class="detail-value"><span class="pill pill-purple">${t.category || "General"}</span></span></div>
        <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="pill ${statusPill}">${t.status}</span></span></div>
        <div class="detail-row"><span class="detail-label">Submitted</span><span class="detail-value">${formatDate(t.submittedAt)}</span></div>

        <div style="margin:16px 0;padding:16px;background:rgba(255,255,255,0.04);border-radius:8px;">
            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;">Message</div>
            <div style="line-height:1.7">${t.message || "—"}</div>
        </div>

        ${t.attachmentOriginalName ? `
        <div style="margin-bottom:16px;padding:12px;background:rgba(74,158,255,0.08);border-radius:8px;border:1px solid rgba(74,158,255,0.2)">
            <i class="fas fa-paperclip" style="color:var(--accent-blue)"></i>
            &nbsp;<strong>Attachment:</strong> ${t.attachmentOriginalName}
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">Type: ${t.attachmentType || "unknown"}</div>
        </div>` : ""}

        <div style="margin-top:16px;">
            <label style="font-weight:600;display:block;margin-bottom:8px;">Update Status</label>
            <select id="modal-status-${t.id}" class="action-select">
                <option ${t.status === "Open" ? "selected" : ""}>Open</option>
                <option ${t.status === "In Progress" ? "selected" : ""}>In Progress</option>
                <option ${t.status === "Resolved" ? "selected" : ""}>Resolved</option>
            </select>
            <label style="font-weight:600;display:block;margin-bottom:8px;">Admin Note / Reply</label>
            <textarea id="modal-note-${t.id}" class="admin-note-area" placeholder="Type a reply or note for this ticket...">${t.adminNote || ""}</textarea>
            <button class="save-ticket-btn" onclick="saveTicketUpdate(${t.id})">
                <i class="fas fa-save"></i> Save Changes
            </button>
        </div>
    `;
    document.getElementById("ticket-modal").style.display = "flex";
}

async function saveTicketUpdate(ticketId) {
    const status = document.getElementById(`modal-status-${ticketId}`).value;
    const adminNote = document.getElementById(`modal-note-${ticketId}`).value;

    try {
        const res = await fetch(`${RAILWAY_URL}/api/admin/support/update`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticketId: String(ticketId), status, adminNote })
        });
        if (res.ok) {
            closeModal("ticket-modal");
            await loadTickets();
            await loadStats();
            alert("✅ Ticket updated successfully.");
        } else {
            alert("❌ Failed to update ticket.");
        }
    } catch (e) {
        alert("❌ Connection error. Please check the server.");
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = "none";
}

/* ============================================================
   5. DARK / LIGHT MODE TOGGLE
   ============================================================ */
function toggleDarkMode() {
    const isLight = document.body.classList.toggle("light-mode");
    localStorage.setItem("adminTheme", isLight ? "light" : "dark");
    updateToggleIcons(isLight);
}

function updateToggleIcons(isLight) {
    document.querySelectorAll(".toggle-icon").forEach(el => {
        el.className = `fas fa-${isLight ? "sun" : "moon"} toggle-icon`;
    });
}

function applyStoredTheme() {
    const stored = localStorage.getItem("adminTheme");
    if (stored === "light") {
        document.body.classList.add("light-mode");
        updateToggleIcons(true);
    }
}

/* ============================================================
   6. AUTO-CHECK LOGIN ON PAGE LOAD
   ============================================================ */
window.addEventListener("load", () => {
    // Apply saved theme immediately
    applyStoredTheme();

    if (sessionStorage.getItem("adminLoggedIn") === "true") {
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("admin-dashboard").style.display = "flex";
        initDashboard();
    }

    // Allow Enter key on login
    document.getElementById("admin-password")?.addEventListener("keydown", e => {
        if (e.key === "Enter") adminLogin();
    });
});
