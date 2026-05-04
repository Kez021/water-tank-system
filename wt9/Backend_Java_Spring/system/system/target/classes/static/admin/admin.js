/* ============================================================
   ADMIN DASHBOARD — admin.js
   Automated Overhead Tank System
   ============================================================
   AUTO URL DETECTION (no manual switching ever needed):
   - localhost / 127.0.0.1  →  local IntelliJ backend (H2)
   - Online (Netlify)        →  Railway backend (PostgreSQL)
   ============================================================ */

const API_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:8080"
    : "https://water-tank-system-production.up.railway.app";

/* ===== ADMIN AUTH =====
   Credentials are validated by the backend at POST /api/admin/login.
   Backend enforces rate limiting (5 attempts / 15 min per IP).
   Backend issues a session token stored in sessionStorage. */

/* ===== GLOBAL STATE ===== */
let allUsersData = [];
let allTanksData = [];
let allLogsData  = [];
let allTicketsData = [];
let currentTicketFilter = 'all';
let autoRefreshTimer = null;

/* ===== AUTH HELPERS ===== */
function getAdminToken() {
    return sessionStorage.getItem("adminToken") || "";
}
function getAuthHeaders(extra) {
    const h = { "X-Admin-Token": getAdminToken() };
    if (extra) Object.assign(h, extra);
    return h;
}
function handleAuthError(res) {
    if (res.status === 401) {
        alert("Your admin session has expired. Please log in again.");
        sessionStorage.removeItem("adminLoggedIn");
        sessionStorage.removeItem("adminToken");
        location.reload();
        return true;
    }
    return false;
}


/* ============================================================
   1. LOGIN / LOGOUT
   ============================================================ */
let adminLoginInProgress = false;

function showLoginError(message) {
    const errorEl = document.getElementById("login-error");
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = "block";
    clearTimeout(showLoginError.hideTimer);
    showLoginError.hideTimer = setTimeout(() => {
        errorEl.style.display = "none";
    }, 4000);
}

function setLoginButtonState(isLoading) {
    const loginBtn = document.getElementById("admin-login-btn");
    if (!loginBtn) return;
    loginBtn.disabled = isLoading;
    loginBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
    loginBtn.innerHTML = isLoading
        ? '<i class="fas fa-spinner fa-spin"></i> Signing in...'
        : '<i class="fas fa-sign-in-alt"></i> Login';
}

async function adminLogin(event) {
    if (event) event.preventDefault();
    if (adminLoginInProgress) return;

    const usernameInput = document.getElementById("admin-username");
    const passwordInput = document.getElementById("admin-password");
    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!username || !password) {
        showLoginError("Enter your admin username and password.");
        if (!username && usernameInput) usernameInput.focus();
        else if (passwordInput) passwordInput.focus();
        return;
    }

    adminLoginInProgress = true;
    setLoginButtonState(true);

    try {
        const r = await fetch(`${API_URL}/api/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        let data = {};
        try {
            data = await r.json();
        } catch (_) {
            data = {};
        }

        if (r.ok && data.success && data.token) {
            sessionStorage.setItem("adminLoggedIn", "true");
            sessionStorage.setItem("adminToken", data.token);
            document.getElementById("login-screen").style.display = "none";
            document.getElementById("admin-dashboard").style.display = "flex";
            initDashboard();
            return;
        }

        if (r.status === 429 || data.locked) {
            showLoginError(`Locked. Try again in ${data.minutesLeft ?? 15} minutes.`);
        } else if (r.status === 401 || r.status === 403 || data.success === false) {
            showLoginError(data.message || "Invalid username or password.");
        } else {
            showLoginError(data.message || `Login failed (HTTP ${r.status}).`);
        }
    } catch (e) {
        showLoginError("Cannot reach server. Is the backend running?");
    } finally {
        adminLoginInProgress = false;
        setLoginButtonState(false);
    }
}
async function adminLogout() {
    const token = sessionStorage.getItem("adminToken");
    try {
        await fetch(`${API_URL}/api/admin/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });
    } catch (e) {}
    sessionStorage.removeItem("adminLoggedIn");
    sessionStorage.removeItem("adminToken");
    location.reload();
}

/* ============================================================
   2. SECTION NAVIGATION
   ============================================================ */
function showSection(name) {
    document.querySelectorAll(".admin-section").forEach(s => s.style.display = "none");
    document.querySelectorAll(".admin-nav-item").forEach(n => n.classList.remove("active"));
    document.getElementById(`section-${name}`).style.display = "block";
    const el = document.querySelector(`[onclick="showSection('${name}')"]`);
    if (el) el.classList.add("active");
    const titles = { overview:"Overview", users:"All Users", tanks:"All Tanks",
                     logs:"Activity Logs", tickets:"Support Tickets", monitor:"Account Monitor" };
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
        "Updated: " + now.toLocaleTimeString("en-PH",{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

/* ============================================================
   4. FETCH ALL DATA
   ============================================================ */
async function initDashboard() {
    await refreshAll();
    autoRefreshTimer = setInterval(refreshAll, 30000);
}
async function refreshAll() {
    showLoading();
    try {
        await Promise.all([loadStats(), loadUsers(), loadTanks(), loadLogs(), loadTickets()]);
        updateRefreshTime();
    } catch(err) { console.error("Refresh error:", err); }
    finally { hideLoading(); }
}

/* ── STATS ── */
async function loadStats() {
    try {
        const res = await fetch(`${API_URL}/api/admin/stats`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const s = await res.json();
        document.getElementById("stat-users").textContent   = s.totalUsers   ?? "—";
        document.getElementById("stat-tanks").textContent   = s.totalTanks   ?? "—";
        document.getElementById("stat-online").textContent  = s.onlineTanks  ?? "—";
        document.getElementById("stat-tickets").textContent = s.openTickets  ?? "—";
    } catch(e) { console.warn("Stats error:", e); }
}

/* ── USERS ── */
async function loadUsers() {
    const tbody = document.getElementById("users-table-body");
    try {
        const res = await fetch(`${API_URL}/api/admin/all-users`, { headers: getAuthHeaders() });
        if (handleAuthError(res)) return;
        if (!res.ok) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-text">Failed to load users (HTTP ${res.status}).</td></tr>`;
            return;
        }
        allUsersData = await res.json();
        renderUsersTable(allUsersData);
        populateMonitorDropdown(allUsersData);
    } catch(e) {
        console.warn("Users error:", e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-text">Cannot reach server. Is the backend running?</td></tr>`;
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-text">No users found.</td></tr>'; return;
    }
    tbody.innerHTML = users.map(u => {
        const safeName = (u.fullName || "—").replace(/'/g, "\\'");
        return `
        <tr>
            <td><strong>${u.fullName || "—"}</strong></td>
            <td>${u.email || "—"}</td>
            <td>${u.phoneNumber || "—"}</td>
            <td><span class="pill pill-blue">${u.tankCount ?? 0} tank${(u.tankCount ?? 0) !== 1 ? 's' : ''}</span></td>
            <td><span class="pill pill-purple">${u.ticketCount ?? 0} ticket${(u.ticketCount ?? 0) !== 1 ? 's' : ''}</span></td>
            <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
                <button class="pill pill-teal" style="cursor:pointer;border:none;padding:4px 10px;border-radius:20px;font-size:0.78rem;" onclick="viewUserDetail('${u.email}')">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="pill pill-orange" style="cursor:pointer;border:none;padding:4px 10px;border-radius:20px;font-size:0.78rem;" onclick="monitorUser('${u.email}')">
                    <i class="fas fa-chart-line"></i> Monitor
                </button>
                <button style="cursor:pointer;border:none;padding:4px 10px;border-radius:20px;font-size:0.78rem;background:rgba(255,80,80,0.15);color:#ff6b6b;" onclick="confirmDeleteUser(${u.id},'${safeName}','${u.email}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function filterUsers() {
    const q = document.getElementById("user-search").value.toLowerCase();
    renderUsersTable(allUsersData.filter(u =>
        (u.fullName||"").toLowerCase().includes(q) ||
        (u.email||"").toLowerCase().includes(q) ||
        (u.phoneNumber||"").toLowerCase().includes(q)
    ));
}

/* ── DELETE USER ── */
function confirmDeleteUser(id, name, email) {
    if (!confirm(`<i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i> Delete user "${name}" (${email})?\n\nThis permanently deletes:\n• Their account\n• All their tanks\n• All tank logs\n• Their support tickets\n\nThis CANNOT be undone!`)) return;
    deleteUser(id);
}
async function deleteUser(id) {
    try {
        showLoading();
        const res = await fetch(`${API_URL}/api/admin/delete-user/${id}`, { method:"DELETE", headers: getAuthHeaders() });
        if (res.ok) { await refreshAll(); alert("User deleted successfully."); }
        else        { alert("Failed: " + await res.text()); }
    } catch(e) { alert("Connection error."); }
    finally { hideLoading(); }
}

/* ── VIEW USER DETAIL modal ── */
async function viewUserDetail(email) {
    try {
        showLoading();
        const res = await fetch(`${API_URL}/api/admin/user-detail?email=${encodeURIComponent(email)}`, { headers: getAuthHeaders() });
        if (!res.ok) { alert("User not found."); return; }
        const u = await res.json();
        document.getElementById("user-detail-content").innerHTML = buildUserDetailHTML(u);
        document.getElementById("user-detail-modal").style.display = "flex";
    } catch(e) { alert("Error loading user details."); }
    finally { hideLoading(); }
}

function buildUserDetailHTML(u) {
    return `
        <div class="detail-row"><span class="detail-label">Full Name</span><span class="detail-value"><strong>${u.fullName||"—"}</strong></span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${u.email}</span></div>
        <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${u.phoneNumber||"—"}</span></div>
        <div class="detail-row"><span class="detail-label">Tanks</span><span class="detail-value"><span class="pill pill-blue">${(u.tanks||[]).length}</span></span></div>

        <div style="margin-top:16px;font-weight:600;margin-bottom:8px;"><i class="fas fa-water" style="color:var(--accent-blue);margin-right:6px;"></i>Tanks</div>
        ${!(u.tanks||[]).length ? '<div style="color:var(--text-muted);font-size:0.85rem;">No tanks.</div>' :
          (u.tanks||[]).map(t=>`<div style="padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:6px;font-size:0.85rem;">
              <strong>${t.tankName||t.tankId}</strong> — ${t.waterLevel??'?'}%
              <span class="pill pill-${t.pumpStatus==='ON'?'green':'gray'}" style="margin-left:6px">${t.pumpStatus}</span>
              <span class="pill pill-${t.isAutomatic?'blue':'gray'}" style="margin-left:4px">${t.isAutomatic?'Auto':'Manual'}</span>
          </div>`).join('')}

        <div style="margin-top:16px;font-weight:600;margin-bottom:8px;"><i class="fas fa-list-alt" style="color:var(--accent-purple);margin-right:6px;"></i>Recent Logs (last 10)</div>
        ${!(u.recentLogs||[]).length ? '<div style="color:var(--text-muted);font-size:0.85rem;">No logs yet.</div>' :
          `<table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
            <thead><tr style="color:var(--text-muted)"><th style="text-align:left;padding:4px">Time</th><th>Action</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>${(u.recentLogs||[]).slice(0,10).map(l=>`<tr style="border-top:1px solid rgba(255,255,255,0.05)">
              <td style="padding:4px;white-space:nowrap">${formatDate(l.timestamp)}</td>
              <td><span class="pill pill-blue" style="font-size:0.75rem">${l.action||"—"}</span></td>
              <td>${l.status||"—"}</td>
              <td style="color:var(--text-muted)">${l.details||"—"}</td>
            </tr>`).join('')}</tbody>
          </table>`}

        <div style="margin-top:16px;font-weight:600;margin-bottom:8px;"><i class="fas fa-ticket-alt" style="color:var(--accent-orange);margin-right:6px;"></i>Support Tickets</div>
        ${!(u.supportTickets||[]).length ? '<div style="color:var(--text-muted);font-size:0.85rem;">No tickets.</div>' :
          (u.supportTickets||[]).map(t=>`<div style="padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:6px;font-size:0.85rem;">
              <span class="pill pill-${t.status==='Open'?'orange':t.status==='In Progress'?'blue':'green'}">${t.status}</span>
              <strong style="margin-left:6px">${t.category||"General"}</strong> — ${formatDate(t.submittedAt)}<br>
              <span style="color:var(--text-muted)">${(t.message||"").slice(0,100)}…</span>
          </div>`).join('')}`;
}

/* ============================================================
   5. ACCOUNT MONITOR TAB
   ============================================================ */
function populateMonitorDropdown(users) {
    const sel = document.getElementById("monitor-user-select");
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Select a user to monitor —</option>' +
        users.map(u=>`<option value="${u.email}" ${u.email===cur?'selected':''}>${u.fullName} (${u.email})</option>`).join('');
}

function monitorUser(email) {
    showSection('monitor');
    const sel = document.getElementById("monitor-user-select");
    if (sel) sel.value = email;
    loadMonitorData();
}

async function loadMonitorData() {
    const sel = document.getElementById("monitor-user-select");
    const email = sel ? sel.value : "";
    const container = document.getElementById("monitor-content");
    if (!container) return;
    if (!email) { container.innerHTML = '<div class="loading-text">Select a user above to see all their data.</div>'; return; }
    container.innerHTML = '<div class="loading-text">Loading account data…</div>';
    try {
        const res = await fetch(`${API_URL}/api/admin/user-detail?email=${encodeURIComponent(email)}`, { headers: getAuthHeaders() });
        if (handleAuthError(res)) return;
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            const msg = res.status === 404
                ? `User not found in the database. They may have been deleted, or the email doesn't match exactly.`
                : `Could not load account data (HTTP ${res.status}): ${errText || 'Server error'}`;
            container.innerHTML = `<div class="loading-text" style="color:#ef4444;"><i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i> ${msg}</div>`;
            return;
        }
        const u = await res.json();
        container.innerHTML = `
            <!-- Profile card -->
            <div style="background:var(--card-bg);border-radius:12px;padding:20px;margin-bottom:20px;">
                <h3 style="margin:0 0 14px;color:var(--accent-teal)"><i class="fas fa-user-circle" style="color:var(--accent-teal);margin-right:6px;"></i>Profile</h3>
                <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value"><strong>${u.fullName}</strong></span></div>
                <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${u.email}</span></div>
                <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${u.phoneNumber||"—"}</span></div>
                <div class="detail-row"><span class="detail-label">Tanks</span><span class="detail-value"><span class="pill pill-blue">${(u.tanks||[]).length}</span></span></div>
                <div class="detail-row"><span class="detail-label">Tickets</span><span class="detail-value"><span class="pill pill-purple">${(u.supportTickets||[]).length}</span></span></div>
            </div>

            <!-- Tanks card -->
            <div style="background:var(--card-bg);border-radius:12px;padding:20px;margin-bottom:20px;">
                <h3 style="margin:0 0 14px;color:var(--accent-blue)"><i class="fas fa-water" style="color:var(--accent-blue);margin-right:6px;"></i>Tanks (${(u.tanks||[]).length})</h3>
                ${!(u.tanks||[]).length ? '<div style="color:var(--text-muted)">No tanks registered.</div>' :
                `<div style="overflow-x:auto;"><table style="width:100%;font-size:0.85rem;border-collapse:collapse;">
                    <thead><tr style="color:var(--text-muted);border-bottom:1px solid rgba(255,255,255,0.08)">
                        <th style="text-align:left;padding:8px">Name / ID</th><th>Water Level</th>
                        <th>Pump</th><th>Mode</th><th>Last Updated</th><th>Capacity</th>
                    </tr></thead>
                    <tbody>${(u.tanks||[]).map(t=>`
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                            <td style="padding:8px"><strong>${t.tankName||t.tankId}</strong><br>
                                <code style="font-size:0.72rem;color:var(--text-muted)">${t.tankId}</code></td>
                            <td style="text-align:center">
                                <div style="background:rgba(255,255,255,0.08);border-radius:20px;height:7px;width:80px;margin:0 auto 4px;overflow:hidden;">
                                    <div style="height:100%;width:${t.waterLevel??0}%;background:${(t.waterLevel??0)>50?'var(--accent-teal)':'var(--accent-orange)'}"></div>
                                </div>${t.waterLevel??'?'}%</td>
                            <td style="text-align:center"><span class="pill pill-${t.pumpStatus==='ON'?'green':'gray'}">${t.pumpStatus||'—'}</span></td>
                            <td style="text-align:center"><span class="pill pill-${t.isAutomatic?'blue':'gray'}">${t.isAutomatic?'Auto':'Manual'}</span></td>
                            <td style="text-align:center;font-size:0.78rem;color:var(--text-muted)">${formatDate(t.lastUpdated)}</td>
                            <td style="text-align:center">${t.maxCapacity??'?'}L</td>
                        </tr>`).join('')}
                    </tbody></table></div>`}
            </div>

            <!-- Logs card -->
            <div style="background:var(--card-bg);border-radius:12px;padding:20px;margin-bottom:20px;">
                <h3 style="margin:0 0 14px;color:var(--accent-purple)"><i class="fas fa-list-alt" style="color:var(--accent-purple);margin-right:6px;"></i>Recent Logs (last 50)</h3>
                ${!(u.recentLogs||[]).length ? '<div style="color:var(--text-muted)">No logs yet.</div>' :
                `<div style="overflow-x:auto;"><table style="width:100%;font-size:0.82rem;border-collapse:collapse;">
                    <thead><tr style="color:var(--text-muted);border-bottom:1px solid rgba(255,255,255,0.08)">
                        <th style="text-align:left;padding:8px">Time</th><th>Tank</th>
                        <th>Action</th><th>Status</th><th>Details</th><th>Amount</th>
                    </tr></thead>
                    <tbody>${(u.recentLogs||[]).map(l=>`
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                            <td style="padding:8px;white-space:nowrap;color:var(--text-muted);font-size:0.78rem">${formatDate(l.timestamp)}</td>
                            <td><code style="font-size:0.75rem;color:var(--text-muted)">${l.tankId||'—'}</code></td>
                            <td><span class="pill pill-blue" style="font-size:0.75rem">${l.action||'—'}</span></td>
                            <td>${l.status||'—'}</td>
                            <td style="color:var(--text-muted);max-width:180px;font-size:0.78rem">${l.details||'—'}</td>
                            <td>${Number(l.usageAmount ?? l.amount ?? 0).toFixed(2)}L</td>
                        </tr>`).join('')}
                    </tbody></table></div>`}
            </div>

            <!-- Tickets card -->
            <div style="background:var(--card-bg);border-radius:12px;padding:20px;">
                <h3 style="margin:0 0 14px;color:var(--accent-orange)"><i class="fas fa-ticket-alt" style="color:var(--accent-orange);margin-right:6px;"></i>Support Tickets (${(u.supportTickets||[]).length})</h3>
                ${!(u.supportTickets||[]).length ? '<div style="color:var(--text-muted)">No tickets filed.</div>' :
                (u.supportTickets||[]).map(t=>{
                    const sp2=t.status==='Open'?'orange':t.status==='In Progress'?'blue':'green';
                    const closedTag2=t.isClosed?`<span style="margin-left:6px;padding:2px 8px;border-radius:20px;font-size:0.72rem;background:rgba(231,76,60,0.12);color:#e74c3c;"><i class="fas fa-lock"></i> Closed</span>`:"";
                    const convHTML2=buildConversationAdmin(t);
                    return `<div style="padding:14px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:14px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
                            <div><strong>${t.category||"General"}</strong> <span style="font-size:0.78rem;color:var(--text-muted);">#${t.id}</span></div>
                            <div><span class="pill pill-${sp2}">${t.status}</span>${closedTag2}</div>
                        </div>
                        <div style="color:var(--text-muted);font-size:0.78rem;margin-bottom:10px;">${formatDate(t.submittedAt)}</div>
                        <div style="max-height:280px;overflow-y:auto;margin-bottom:10px;">${convHTML2}</div>
                        ${!t.isClosed?`
                        <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;margin-top:6px;">
                            <textarea id="mon-reply-${t.id}" rows="2" placeholder="Admin reply..." style="width:100%;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:inherit;font-size:0.85rem;resize:vertical;box-sizing:border-box;"></textarea>
                            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
                                <select id="mon-status-${t.id}" class="action-select" style="flex:1;min-width:120px;">
                                    <option ${t.status==="Open"?"selected":""}>Open</option>
                                    <option ${t.status==="In Progress"?"selected":""}>In Progress</option>
                                    <option ${t.status==="Resolved"?"selected":""}>Resolved</option>
                                </select>
                                <button onclick="monitorAdminReply(${t.id})" style="padding:6px 14px;background:rgba(74,158,255,0.15);border:1px solid rgba(74,158,255,0.3);color:var(--accent-blue);border-radius:8px;cursor:pointer;font-size:0.83rem;">
                                    <i class="fas fa-paper-plane"></i> Reply
                                </button>
                                <button onclick="adminCloseConversation(${t.id})" style="padding:6px 14px;background:rgba(231,76,60,0.12);border:1px solid rgba(231,76,60,0.25);color:#e74c3c;border-radius:8px;cursor:pointer;font-size:0.83rem;">
                                    <i class="fas fa-lock"></i> Close
                                </button>
                            </div>
                            <div id="mon-reply-status-${t.id}" style="font-size:0.8rem;margin-top:5px;"></div>
                        </div>`:
                        `<div style="padding:8px 12px;background:rgba(231,76,60,0.06);border-radius:8px;font-size:0.82rem;color:#e74c3c;text-align:center;"><i class="fas fa-lock"></i> Conversation closed</div>`}
                    </div>`;
                }).join('')}
            </div>`;
    } catch(e) {
        console.error("Account monitor error:", e);
        container.innerHTML = '<div class="loading-text">Error loading data: ' + (e.message || e) + '. Check backend connection.</div>';
    }
}

/* ============================================================
   6. TANKS
   ============================================================ */
async function loadTanks() {
    const tbody = document.getElementById("tanks-table-body");
    try {
        const res = await fetch(`${API_URL}/api/admin/all-tanks`, { headers: getAuthHeaders() });
        if (handleAuthError(res)) return;
        if (!res.ok) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="loading-text">Failed to load tanks (HTTP ${res.status}).</td></tr>`;
            return;
        }
        allTanksData = await res.json();
        renderTanksTable(allTanksData);
    } catch(e) {
        console.warn("Tanks error:", e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="loading-text">Cannot reach server. Is the backend running?</td></tr>`;
    }
}
function renderTanksTable(tanks) {
    const tbody = document.getElementById("tanks-table-body");
    if (!tbody) return;
    if (!tanks.length) { tbody.innerHTML='<tr><td colspan="9" class="loading-text">No tanks found.</td></tr>'; return; }
    const now = Date.now();
    // Also populate the overview table on the Overview section
    const overviewTbody = document.getElementById("overview-tanks-body");
    if (overviewTbody) {
        overviewTbody.innerHTML = tanks.slice(0, 10).map(t => {
            const lv = Number.isFinite(t.waterLevel) ? t.waterLevel : 0;
            let sysStatus = 'Offline', sysColor = 'gray';
            if (t.lastUpdated) {
                const last = new Date(t.lastUpdated).getTime();
                if (!isNaN(last) && now - last < 30000) { sysStatus = 'Online'; sysColor = 'green'; }
            }
            return `<tr>
                <td><code style="font-size:0.82rem;color:var(--text-muted)">${t.tankId||'—'}</code></td>
                <td><strong>${t.tankName||'—'}</strong></td>
                <td>${t.ownerName||'—'}</td>
                <td>${lv.toFixed(1)}%</td>
                <td><span class="pill pill-${(t.pumpStatus||'').toUpperCase()==='ON'?'green':'gray'}">${t.pumpStatus||'OFF'}</span></td>
                <td><span class="pill pill-${sysColor}">${sysStatus}</span></td>
                <td style="font-size:0.78rem;color:var(--text-muted)">${formatDate(t.lastUpdated)}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="7" class="loading-text">No tanks found.</td></tr>';
    }

    tbody.innerHTML = tanks.map(t => {
        const lv  = Number.isFinite(t.waterLevel)  ? t.waterLevel  : 0;
        const cap = Number.isFinite(t.maxCapacity) ? t.maxCapacity : 0;
        // Derive system status from last heartbeat
        let sysStatus = 'Offline', sysColor = 'gray';
        if (t.lastUpdated) {
            const last = new Date(t.lastUpdated).getTime();
            if (now - last < 30000) { sysStatus = 'Online';  sysColor = 'green'; }
        }
        if (sysStatus === 'Online' && lv <= (t.lowerThreshold ?? 20)) {
            sysStatus = 'Warning'; sysColor = 'orange';
        }
        return `<tr>
            <td><code style="font-size:0.82rem;color:var(--text-muted)">${t.tankId||'—'}</code></td>
            <td><strong>${t.tankName||'—'}</strong></td>
            <td>${t.ownerName||'—'}<br><span style="font-size:0.78rem;color:var(--text-muted)">${t.ownerEmail||''}</span></td>
            <td>
                <div style="background:rgba(255,255,255,0.08);border-radius:20px;height:6px;width:80px;overflow:hidden;">
                    <div style="height:100%;width:${lv}%;background:${lv>50?'var(--accent-teal)':'var(--accent-orange)'}"></div>
                </div>
                <span style="font-size:0.78rem">${lv.toFixed(1)}%</span>
            </td>
            <td>${cap}L</td>
            <td><span class="pill pill-${t.isAutomatic?'blue':'gray'}">${t.isAutomatic?'Auto':'Manual'}</span></td>
            <td><span class="pill pill-${(t.pumpStatus||'').toUpperCase()==='ON'?'green':'gray'}">${t.pumpStatus||'OFF'}</span></td>
            <td><span class="pill pill-${sysColor}">${sysStatus}</span></td>
            <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap">${formatDate(t.lastUpdated)}</td>
        </tr>`;
    }).join('');
}
function filterTanks() {
    const q = document.getElementById("tank-search").value.toLowerCase();
    renderTanksTable(allTanksData.filter(t=>
        (t.tankName||"").toLowerCase().includes(q)||(t.tankId||"").toLowerCase().includes(q)||
        (t.ownerEmail||"").toLowerCase().includes(q)||(t.ownerName||"").toLowerCase().includes(q)));
}

/* ============================================================
   7. LOGS
   ============================================================ */
async function loadLogs() {
    const tbody = document.getElementById("logs-table-body");
    try {
        const res = await fetch(`${API_URL}/api/admin/all-logs`, { headers: getAuthHeaders() });
        if (handleAuthError(res)) return;
        if (!res.ok) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-text">Failed to load logs (HTTP ${res.status}).</td></tr>`;
            return;
        }
        allLogsData = await res.json();
        renderLogsTable(allLogsData);
    } catch(e) {
        console.warn("Logs error:", e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-text">Cannot reach server.</td></tr>`;
    }
}
function renderLogsTable(logs) {
    const tbody = document.getElementById("logs-table-body");
    if (!tbody) return;
    if (!logs.length) { tbody.innerHTML='<tr><td colspan="6" class="loading-text">No logs found.</td></tr>'; return; }
    tbody.innerHTML = logs.map(l => {
        const pill = l.action==="Consumption"?"pill-blue":l.action==="Auto Refill Triggered"?"pill-green":l.action==="Notification"?"pill-orange":"pill-gray";
        // TankLog stores volume in `usageAmount` (not `amount`)
        const amt = l.usageAmount ?? l.amount ?? 0;
        return `<tr>
            <td style="color:var(--text-muted);font-size:0.82rem;white-space:nowrap">${formatDate(l.timestamp)}</td>
            <td><code style="font-size:0.82rem;color:var(--text-muted)">${l.tankId||'—'}</code></td>
            <td><span class="pill ${pill}">${l.action||'—'}</span></td>
            <td>${l.status||'—'}</td>
            <td style="max-width:200px;color:var(--text-muted);font-size:0.82rem">${l.details||'—'}</td>
            <td>${(amt != null && amt !== undefined) ? Number(amt).toFixed(2)+'L' : '0.00L'}</td>
        </tr>`;
    }).join('');
}
function filterLogs() {
    const q = document.getElementById("log-search").value.toLowerCase();
    renderLogsTable(allLogsData.filter(l=>
        (l.action||"").toLowerCase().includes(q)||(l.status||"").toLowerCase().includes(q)||
        (l.details||"").toLowerCase().includes(q)||(l.tankId||"").toLowerCase().includes(q)));
}

/* ============================================================
   8. SUPPORT TICKETS
   ============================================================ */
async function loadTickets() {
    try {
        const res = await fetch(`${API_URL}/api/admin/support/all`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        allTicketsData = await res.json();
        renderTickets(allTicketsData, currentTicketFilter);
        const open = allTicketsData.filter(t=>t.status==="Open").length;
        const badge = document.getElementById("ticket-badge");
        if (badge) { badge.textContent=open; badge.style.display=open>0?"inline":"none"; }
    } catch(e) { console.warn("Tickets error:", e); }
}
function filterTickets(status,btn) {
    currentTicketFilter=status;
    document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    renderTickets(status==='all'?allTicketsData:allTicketsData.filter(t=>t.status===status), status);
}
/* ─── helpers ─── */
function adminAttachPreview(t) {
    if (!t.attachmentOriginalName) return "";
    const url = `${API_URL}/api/support/attachment/${t.id}`;
    const isImg = (t.attachmentType||"").startsWith("image/");
    const isVid = (t.attachmentType||"").startsWith("video/");
    if (isImg) return `<div style="margin-top:8px;"><img src="${url}" style="max-width:100%;max-height:200px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.1);" onclick="window.open('${url}','_blank')" onerror="this.style.display='none'"></div>`;
    if (isVid) return `<div style="margin-top:8px;"><video controls style="max-width:100%;max-height:200px;border-radius:8px;"><source src="${url}" type="${t.attachmentType}"></video></div>`;
    return `<div style="margin-top:6px;font-size:0.82rem;color:var(--text-muted);"><i class="fas fa-paperclip"></i> <a href="${url}" target="_blank" style="color:var(--accent-blue);">${t.attachmentOriginalName}</a></div>`;
}

function adminMsgAttachPreview(msg) {
    if (!msg.attachmentOriginalName) return "";
    const path = msg.attachmentPath || "";
    const filename = path.replace(/^.*[\\\/]/,"");
    if (!filename) return `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;"><i class="fas fa-paperclip"></i> ${msg.attachmentOriginalName}</div>`;
    const url = `${API_URL}/api/support/msg-attachment/${encodeURIComponent(filename)}`;
    const isImg = (msg.attachmentType||"").startsWith("image/");
    const isVid = (msg.attachmentType||"").startsWith("video/");
    if (isImg) return `<div style="margin-top:6px;"><img src="${url}" style="max-width:100%;max-height:180px;border-radius:8px;cursor:pointer;" onclick="window.open('${url}','_blank')" onerror="this.style.display='none'"></div>`;
    if (isVid) return `<div style="margin-top:6px;"><video controls style="max-width:100%;max-height:180px;border-radius:8px;"><source src="${url}" type="${msg.attachmentType}"></video></div>`;
    return `<div style="margin-top:4px;font-size:0.78rem;color:var(--text-muted);"><i class="fas fa-paperclip"></i> <a href="${url}" target="_blank" style="color:var(--accent-blue);">${msg.attachmentOriginalName}</a></div>`;
}

function buildConversationAdmin(ticket) {
    let msgs = [];
    try { if (ticket.conversationJson) msgs = JSON.parse(ticket.conversationJson); } catch(e) {}
    if (!msgs.length) {
        // Fallback: show original message
        msgs = [{ sender:"user", senderName: ticket.userName||"User", message: ticket.message, timestamp: ticket.submittedAt }];
        if (ticket.adminNote) msgs.push({ sender:"admin", senderName:"Admin", message: ticket.adminNote, timestamp: ticket.submittedAt });
    }
    return msgs.map(msg => {
        const isAdmin = msg.sender === "admin";
        const bg   = isAdmin ? "rgba(74,158,255,0.08)"  : "rgba(255,255,255,0.04)";
        const bdr  = isAdmin ? "rgba(74,158,255,0.2)"   : "rgba(255,255,255,0.1)";
        const nameC= isAdmin ? "var(--accent-blue)"     : "var(--accent-teal)";
        const icon = isAdmin ? "fa-user-shield"          : "fa-user";
        const align= isAdmin ? "flex-start"              : "flex-end";
        const attach = adminMsgAttachPreview(msg);
        const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "";
        return `<div style="display:flex;justify-content:${align};margin-bottom:10px;">
            <div style="max-width:88%;padding:10px 14px;background:${bg};border:1px solid ${bdr};border-radius:12px;">
                <div style="font-size:0.75rem;font-weight:700;color:${nameC};margin-bottom:4px;">
                    <i class="fas ${icon}"></i> ${msg.senderName||( isAdmin?"Admin":"User")}
                    <span style="font-weight:400;color:var(--text-muted);margin-left:8px;">${ts}</span>
                </div>
                <div style="font-size:0.88rem;line-height:1.6;">${msg.message||""}</div>
                ${attach}
            </div>
        </div>`;
    }).join("");
}

/* ─── renderTickets ─── */
function renderTickets(tickets,filter) {
    const container = document.getElementById("tickets-container");
    if (!tickets.length) { container.innerHTML=`<div class="loading-text">No ${filter==='all'?'':filter.toLowerCase()+' '}tickets found.</div>`; return; }
    container.innerHTML = tickets.map(t=>{
        const sp=t.status==="Open"?"pill-orange":t.status==="In Progress"?"pill-blue":"pill-green";
        const closedTag = t.isClosed ? `<span style="margin-left:6px;padding:2px 8px;border-radius:20px;font-size:0.72rem;background:rgba(231,76,60,0.12);color:#e74c3c;"><i class="fas fa-lock"></i> Closed</span>` : "";
        // Count conversation messages
        let msgCount = 0;
        try { if (t.conversationJson) msgCount = JSON.parse(t.conversationJson).length; } catch(e) {}
        return `<div class="ticket-card ${t.status==='Open'?'open':t.status==='In Progress'?'in-progress':'resolved'}" onclick="openTicketModal(${t.id})">
            <div class="ticket-header">
                <div>
                    <div class="ticket-user">${t.userName||"Unknown"} <span style="font-size:0.78rem;color:var(--text-muted);">#${t.id}</span></div>
                    <div class="ticket-meta"><i class="fas fa-envelope" style="color:var(--text-muted);"></i> ${t.userEmail} &nbsp;·&nbsp; <i class="fas fa-tag" style="color:var(--text-muted);"></i> ${t.category||"General"} &nbsp;·&nbsp; <i class="fas fa-clock" style="color:var(--text-muted);"></i> ${formatDate(t.submittedAt)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span class="pill ${sp}">${t.status}</span>${closedTag}
                    ${msgCount>1?`<span style="font-size:0.75rem;color:var(--text-muted);"><i class="fas fa-comments"></i> ${msgCount}</span>`:""}
                </div>
            </div>
            <div class="ticket-message">${(t.message||"").slice(0,180)}${(t.message||"").length>180?"...":""}</div>
            ${t.adminNote?`<div style="margin-top:8px;color:var(--accent-teal);font-size:0.82rem;"><i class="fas fa-reply"></i> Admin: ${t.adminNote}</div>`:""}
        </div>`;
    }).join('');
}

/* ─── openTicketModal ─── */
function openTicketModal(ticketId) {
    const t = allTicketsData.find(x=>x.id===ticketId); if(!t) return;
    const sp=t.status==="Open"?"pill-orange":t.status==="In Progress"?"pill-blue":"pill-green";
    const closedBadge = t.isClosed
        ? `<span style="margin-left:8px;padding:3px 10px;border-radius:20px;font-size:0.78rem;background:rgba(231,76,60,0.12);color:#e74c3c;"><i class="fas fa-lock"></i> Conversation Closed</span>` : "";

    const convHTML = buildConversationAdmin(t);

    // Admin reply + controls (shown even if closed, so admin can reopen via status)
    const replySection = `
        <div style="margin-top:18px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                <label style="font-weight:700;font-size:0.95rem;"><i class="fas fa-reply" style="color:var(--accent-blue);"></i> Admin Reply</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <select id="modal-status-${t.id}" class="action-select" style="min-width:140px;">
                        <option ${t.status==="Open"?"selected":""}>Open</option>
                        <option ${t.status==="In Progress"?"selected":""}>In Progress</option>
                        <option ${t.status==="Resolved"?"selected":""}>Resolved</option>
                    </select>
                </div>
            </div>
            <textarea id="modal-reply-${t.id}" class="admin-note-area" rows="3" placeholder="Type your reply to the user..."></textarea>
            <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
                <button class="save-ticket-btn" onclick="adminSendReply(${t.id})" style="flex:1;">
                    <i class="fas fa-paper-plane"></i> Send Reply
                </button>
                ${!t.isClosed
                    ? `<button onclick="adminCloseConversation(${t.id})" style="padding:8px 16px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.3);color:#e74c3c;border-radius:8px;cursor:pointer;font-size:0.88rem;white-space:nowrap;">
                        <i class="fas fa-lock"></i> Close Conversation
                    </button>`
                    : `<button onclick="adminReopenConversation(${t.id})" style="padding:8px 16px;background:rgba(39,174,96,0.12);border:1px solid rgba(39,174,96,0.3);color:#27ae60;border-radius:8px;cursor:pointer;font-size:0.88rem;white-space:nowrap;">
                        <i class="fas fa-lock-open"></i> Reopen
                    </button>`}
            </div>
            <div id="admin-reply-status-${t.id}" style="margin-top:8px;font-size:0.83rem;"></div>
        </div>`;

    document.getElementById("ticket-modal-content").innerHTML=`
        <div class="detail-row"><span class="detail-label">User</span><span class="detail-value"><strong>${t.userName||"—"}</strong></span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${t.userEmail}</span></div>
        <div class="detail-row"><span class="detail-label">Category</span><span class="detail-value"><span class="pill pill-purple">${t.category||"General"}</span></span></div>
        <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="pill ${sp}">${t.status}</span>${closedBadge}</span></div>
        <div class="detail-row"><span class="detail-label">Submitted</span><span class="detail-value">${formatDate(t.submittedAt)}</span></div>

        <div style="margin:16px 0;">
            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;font-weight:600;">
                <i class="fas fa-comments"></i> Conversation Thread
            </div>
            <div style="max-height:360px;overflow-y:auto;padding:4px 0;" id="conv-thread-${t.id}">
                ${convHTML}
            </div>
        </div>
        ${replySection}`;

    document.getElementById("ticket-modal").style.display="flex";
    // Scroll to bottom of conversation
    const thread = document.getElementById(`conv-thread-${t.id}`);
    if (thread) setTimeout(() => { thread.scrollTop = thread.scrollHeight; }, 50);
}

/* ─── Admin send reply ─── */
async function adminSendReply(ticketId) {
    const replyEl  = document.getElementById(`modal-reply-${ticketId}`);
    const statusEl = document.getElementById(`admin-reply-status-${ticketId}`);
    const statusSel= document.getElementById(`modal-status-${ticketId}`);
    const message  = replyEl ? replyEl.value.trim() : "";
    if (!message) { statusEl.innerHTML='<span style="color:#e74c3c;"><i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i> Please type a reply first.</span>'; return; }
    statusEl.innerHTML='<span style="color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Sending...</span>';
    try {
        const formData = new FormData();
        formData.append("message", message);
        if (statusSel) formData.append("status", statusSel.value);
        const res = await fetch(`${API_URL}/api/admin/support/reply/${ticketId}`, { headers: getAuthHeaders(),  method:"POST", body: formData });
        if (res.ok) {
            statusEl.innerHTML='<span style="color:#27ae60;"><i class="fas fa-check-circle" style="color:#27ae60;"></i> Reply sent!</span>';
            if (replyEl) replyEl.value="";
            closeModal("ticket-modal");
            await loadTickets();
            await loadStats();
        } else {
            statusEl.innerHTML=`<span style="color:#e74c3c;"><i class="fas fa-times-circle" style="color:#e74c3c;"></i> Failed to send.</span>`;
        }
    } catch(e) { statusEl.innerHTML='<span style="color:#e74c3c;"><i class="fas fa-times-circle" style="color:#e74c3c;"></i> Connection error.</span>'; }
}

/* ─── Admin close conversation ─── */
async function adminCloseConversation(ticketId) {
    if (!confirm(`Close this conversation?

The user will no longer be able to reply. They must submit a new ticket.

Proceed?`)) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/support/close/${ticketId}`, { headers: getAuthHeaders(),  method:"PUT" });
        if (res.ok) {
            closeModal("ticket-modal");
            await loadTickets();
            await loadStats();
            alert("Conversation closed. User can no longer reply.");
        } else { alert("Failed to close conversation."); }
    } catch(e) { alert("Connection error."); }
}

/* ─── Admin reopen conversation ─── */
async function adminReopenConversation(ticketId) {
    try {
        const res = await fetch(`${API_URL}/api/admin/support/update`, {
            method:"PUT", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ ticketId: String(ticketId), status:"In Progress", isClosed:"false" })
        });
        // Also clear isClosed via dedicated endpoint workaround: just post a status update
        // The real isClosed=false requires a dedicated endpoint — add it
        await fetch(`${API_URL}/api/admin/support/reopen/${ticketId}`, { headers: getAuthHeaders(),  method:"PUT" });
        closeModal("ticket-modal");
        await loadTickets();
    } catch(e) { alert("Connection error."); }
}

async function saveTicketUpdate(ticketId) {
    const status    = document.getElementById(`modal-status-${ticketId}`)?.value;
    const adminNote = document.getElementById(`modal-note-${ticketId}`)?.value;
    try {
        const res = await fetch(`${API_URL}/api/admin/support/update`,{
            method:"PUT", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ticketId:String(ticketId),status,adminNote})
        });
        if(res.ok){ closeModal("ticket-modal"); await loadTickets(); await loadStats(); }
        else       alert("Failed to update ticket.");
    } catch(e) { alert("Connection error."); }
}
function closeModal(id) { document.getElementById(id).style.display="none"; }


/* ============================================================
   9. UTILITIES
   ============================================================ */
function formatDate(dt) {
    if(!dt) return "—";
    return new Date(dt).toLocaleString("en-PH",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

/* ============================================================
   10. DARK / LIGHT MODE
   ============================================================ */
function toggleDarkMode() {
    const isLight = document.body.classList.toggle("light-mode");
    localStorage.setItem("adminTheme", isLight?"light":"dark");
    updateToggleIcons(isLight);
}
function updateToggleIcons(isLight) {
    document.querySelectorAll(".toggle-icon").forEach(el=>{
        el.className=`fas fa-${isLight?"sun":"moon"} toggle-icon`;
    });
}
function applyStoredTheme() {
    if(localStorage.getItem("adminTheme")==="light"){
        document.body.classList.add("light-mode"); updateToggleIcons(true);
    }
}

/* ============================================================
   11. PAGE LOAD
   ============================================================ */
window.addEventListener("load",()=>{
    applyStoredTheme();

    const loginForm = document.getElementById("admin-login-form");
    const usernameInput = document.getElementById("admin-username");
    const passwordInput = document.getElementById("admin-password");
    const loginBtn = document.getElementById("admin-login-btn");

    if (loginForm) {
        loginForm.addEventListener("submit", adminLogin);
    }

    [usernameInput, passwordInput].forEach(input => {
        input?.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                adminLogin(e);
            }
        });
    });

    loginBtn?.addEventListener("click", adminLogin);

    if(sessionStorage.getItem("adminLoggedIn")==="true"){
        document.getElementById("login-screen").style.display="none";
        document.getElementById("admin-dashboard").style.display="flex";
        initDashboard();
    }
});

/* ── Monitor tab: inline admin reply ── */
async function monitorAdminReply(ticketId) {
    const replyEl  = document.getElementById(`mon-reply-${ticketId}`);
    const statusEl = document.getElementById(`mon-reply-status-${ticketId}`);
    const statusSel= document.getElementById(`mon-status-${ticketId}`);
    const message  = replyEl ? replyEl.value.trim() : "";
    if (!message) { statusEl.innerHTML='<span style="color:#e74c3c;"><i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i> Please type a reply.</span>'; return; }
    statusEl.innerHTML='<span style="color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Sending...</span>';
    try {
        const fd = new FormData();
        fd.append("message", message);
        if (statusSel) fd.append("status", statusSel.value);
        const res = await fetch(`${API_URL}/api/admin/support/reply/${ticketId}`, { headers: getAuthHeaders(),  method:"POST", body: fd });
        if (res.ok) {
            statusEl.innerHTML='<span style="color:#27ae60;"><i class="fas fa-check-circle" style="color:#27ae60;"></i> Sent!</span>';
            if (replyEl) replyEl.value = "";
            // Reload monitor data to refresh thread
            setTimeout(() => loadMonitorData(), 700);
        } else { statusEl.innerHTML='<span style="color:#e74c3c;"><i class="fas fa-times-circle" style="color:#e74c3c;"></i> Failed.</span>'; }
    } catch(e) { statusEl.innerHTML='<span style="color:#e74c3c;"><i class="fas fa-times-circle" style="color:#e74c3c;"></i> Connection error.</span>'; }
}
