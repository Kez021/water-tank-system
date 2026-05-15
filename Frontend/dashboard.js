/* ============================================================
   DEPLOYMENT CONFIG — dashboard.js
   For LOCAL testing: keep API_URL = "http://localhost:8080"
   Online automatically uses your Render backend URL
   ============================================================ */
//  AUTO-DETECT: Uses localhost when running locally, Render when online
const API_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:8080"
    : "https://water-tank-backend-4sje.onrender.com";

/* ============================================================
   CORE SYSTEM INITIALIZATION
   ============================================================ */
let activeTankId = localStorage.getItem("userTankId") || "---";
let html5QrScanner = null;
let allTanks = [];
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("System initialization started...");

    // 2. Theme Initialization
    const themeSlider = document.getElementById('theme-slider');
    if (themeSlider) {
        const updateTheme = (hue) => {
            document.documentElement.style.setProperty('--primary-hue', hue);
            document.documentElement.style.setProperty('--primary-color', `hsl(${hue}, 70%, 50%)`);
            localStorage.setItem('preferred-hue', hue);
        };
        themeSlider.addEventListener('input', (e) => updateTheme(e.target.value));
        const savedHue = localStorage.getItem('preferred-hue') || 220;
        themeSlider.value = savedHue;
        updateTheme(savedHue);
    }
    /* ============================================================
           3. NAVIGATION & ANALYTICS SELECTION
           ============================================================ */
    setupNavigation();

    // DASHBOARD SWITCHER (Main Header)
    const dashboardSwitcher = document.getElementById('tank-switcher');
    if (dashboardSwitcher) {
        dashboardSwitcher.addEventListener('change', (e) => {
            activeTankId = e.target.value;
            localStorage.setItem("userTankId", activeTankId);
            if (typeof fetchTankDetails === 'function') fetchTankDetails(activeTankId);
        });
    }

    // ANALYTICS SELECTOR (Inside Analytics View)
    const analyticsSelect = document.getElementById('tankSelect');
    if (analyticsSelect) {
        analyticsSelect.addEventListener('change', () => {
            updateAnalytics();
        });
    }
    /* ==========================================================
   4. SESSION DATA SYNCHRONIZATION
   ========================================================== */
    const userEmail = localStorage.getItem("userEmail");
    const userName = localStorage.getItem("userName") || "Administrator";
    const emailField = document.getElementById('email-input');
    const phoneField = document.getElementById('phone-input');

    if (userEmail && emailField) {
        emailField.value = userEmail;
        emailField.readOnly = true;
        emailField.style.cursor = "default";
        emailField.style.pointerEvents = "none";
    }

    if (phoneField) {
        phoneField.style.cursor = "text";
        phoneField.style.pointerEvents = "auto";
    }

    const adminDisplay = document.querySelector('.admin-name');
    if (adminDisplay) {
        adminDisplay.innerText = userName;
    }

    if (userEmail) {
        console.log("Session verified for:", userEmail);
        fetchInitialData(userEmail);
        loadSettingsData();
    } else {
        console.warn("Security Alert: No active session found. Redirecting to login.");
    }
    /* ==========================================================
       5. FORM & BUTTON LISTENERS
       ========================================================== */
    const configForm = document.getElementById('tank-config-form');
    if (configForm) {
        configForm.addEventListener('submit', handleFormSubmit);
    }

    const saveSettingsBtn = document.getElementById("save-settings-btn");
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveUserSettings);
    }

    // 6. Password Visibility Toggle
    document.querySelectorAll('.password-toggle-icon').forEach(icon => {
        icon.addEventListener('click', function () {
            const input = this.previousElementSibling;
            if (input && input.type === 'password') {
                input.type = 'text';
                this.classList.replace('fa-eye-slash', 'fa-eye');
            } else if (input) {
                input.type = 'password';
                this.classList.replace('fa-eye', 'fa-eye-slash');
            }
        });
    });

    // 7. Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }

});

/* ============================================================
   ADD TANK & SCANNER LOGIC (FORM BLOCKING)
   ============================================================ */
window.openAddModal = function () {
    document.getElementById('tank-modal').style.display = 'flex';
    document.getElementById('scanner-section').style.display = 'block';
    document.getElementById('form-section').style.display = 'none';

    const form = document.getElementById('tank-config-form');
    form.reset();
    form.dataset.mode = "add";

    initializeQRScanner();
};

window.openEditModal = async function (tankId) {
    try {
        const response = await fetch(`${API_URL}/api/tank/details/${tankId}`);
        if (!response.ok) return showToast("Could not fetch tank details.", "error");

        const tank = await response.json();

        document.getElementById('tank-modal').style.display = 'flex';
        document.getElementById('scanner-section').style.display = 'none';
        document.getElementById('form-section').style.display = 'block';

        const form = document.getElementById('tank-config-form');
        form.dataset.mode = "edit";

        document.getElementById('tank-hardware-id').value = tank.tankId;
        document.getElementById('tank-name').value = tank.tankName;
        document.getElementById('tank-height').value = tank.tankHeight;
        document.getElementById('tank-capacity').value = tank.maxCapacity;
        document.getElementById('lower-threshold').value = tank.lowerThreshold;
        document.getElementById('upper-threshold').value = tank.upperThreshold;
        document.getElementById('op-mode').checked = tank.isAutomatic;

    } catch (err) {
        console.error("Edit Error:", err);
    }
};

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;

    const payload = {
        tankId: document.getElementById('tank-hardware-id').value,
        tankName: document.getElementById('tank-name').value,
        maxCapacity: document.getElementById('tank-capacity').value || "0",
        tankHeight: document.getElementById('tank-height').value || "0",
        lowerThreshold: document.getElementById('lower-threshold').value || "0",
        upperThreshold: document.getElementById('upper-threshold').value || "0",
        isAutomatic: document.getElementById('op-mode').checked,
        email: localStorage.getItem("userEmail")
    };

    const url = mode === "add" ? '/api/tank/add' : '/api/tank/update';
    const method = mode === "add" ? 'POST' : 'PUT';

    try {
        const res = await fetch(`${API_URL}${url}`, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const emailInput = document.getElementById('email-input');
            if (emailInput && emailInput.value) {
                localStorage.setItem("userEmail", emailInput.value);
            }

            showToast(mode === "add" ? "Tank registered successfully!" : "Tank settings updated!", "success");
            closeModal();
            const currentEmail = localStorage.getItem("userEmail");
            if (currentEmail) fetchInitialData(currentEmail);
        } else {
            const errText = await res.text();
            showToast("Error: " + errText, "error");
        }
    } catch (err) {
        console.error("API Error:", err);
    }
}

window.closeModal = function () {
    const modal = document.getElementById('tank-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    stopScanner();
};

function initializeQRScanner() {
    html5QrScanner = new Html5Qrcode("interactive-scanner");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 }
    };

    html5QrScanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            console.log("Scan Success:", decodedText);

            let hardwareId = decodedText.includes("tank_id=")
                ? decodedText.split("tank_id=")[1]
                : decodedText;

            document.getElementById('tank-hardware-id').value = hardwareId;
            document.getElementById('scanner-section').style.display = 'none';
            document.getElementById('form-section').style.display = 'block';

            stopScanner();
        },
        (errorMessage) => {
            /* Scanning in progress — silent */
        }
    ).catch(err => console.error("Scanner initialization failed:", err));
}

async function fetchTankDetails(tankId) {
    if (!tankId || tankId === "---") return;
    try {
        const response = await fetch(`${API_URL}/api/tank/details/${tankId}`);
        if (response.ok) {
            const tank = await response.json();
            updateDashboardUI(tank);
        }
    } catch (e) {
        console.warn("Polling offline or server unreachable");
    }
}

function stopScanner() {
    if (html5QrScanner) {
        html5QrScanner.stop().then(() => {
            console.log("Scanner stopped.");
        }).catch(err => console.warn("Failed to stop scanner:", err));
    }
}

/* ============================================================
   UPLOAD QR PHOTO — TANK MANAGEMENT (DASHBOARD)
   FIX: Pass file directly to scanFile (no canvas re-encoding).
   FIX: stopScanner() called after success — identical to direct camera scan.
   ============================================================ */
(function initDashboardUploadQR() {
    document.addEventListener("DOMContentLoaded", () => {
        const uploadBtn = document.getElementById("dashUploadQrBtn");
        const uploadInput = document.getElementById("dashUploadQrInput");
        const uploadStatus = document.getElementById("dash-upload-qr-status");

        if (!uploadBtn || !uploadInput) return;

        uploadBtn.addEventListener("click", () => {
            uploadInput.click();
        });

        uploadInput.addEventListener("change", async () => {
            const file = uploadInput.files[0];
            if (!file) return;

            if (uploadStatus) {
                uploadStatus.style.display = "block";
                uploadStatus.style.color = "#888";
                uploadStatus.textContent = "Reading QR code from image...";
            }

            try {
                // Stop and clear live camera before scanning file
                if (html5QrScanner) {
                    try {
                        if (html5QrScanner.isScanning) await html5QrScanner.stop();
                        await html5QrScanner.clear();
                    } catch (_) { }
                }

                // Use a separate hidden div — never touches interactive-scanner
                const TMP_ID = "dash-qr-file-decode-tmp";
                let tmpDiv = document.getElementById(TMP_ID);
                if (!tmpDiv) {
                    tmpDiv = document.createElement("div");
                    tmpDiv.id = TMP_ID;
                    tmpDiv.style.cssText = "display:none;position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
                    document.body.appendChild(tmpDiv);
                }

                const fileScanner = new Html5Qrcode(TMP_ID);

                // FIX: Pass file directly — no canvas re-encoding
                // Canvas conversion degrades QR readability and causes false "Invalid QR" errors
                const decodedText = await fileScanner.scanFile(file, false);
                try { fileScanner.clear(); } catch (_) { }

                // Extract hardware ID exactly like direct camera scan
                let hardwareId = decodedText.includes("tank_id=")
                    ? decodedText.split("tank_id=")[1]
                    : decodedText;

                if (uploadStatus) {
                    uploadStatus.style.color = "#22c55e";
                    uploadStatus.textContent = "QR code detected! Loading form...";
                }

                // Fill form and switch view — identical to direct camera scan
                document.getElementById("tank-hardware-id").value = hardwareId;
                document.getElementById("scanner-section").style.display = "none";
                document.getElementById("form-section").style.display = "block";

                // FIX: Stop scanner after success — same as direct camera scan
                stopScanner();

            } catch (err) {
                console.warn("Dashboard QR upload error:", err);
                if (uploadStatus) {
                    uploadStatus.style.color = "#dc2626";
                    uploadStatus.textContent = "Invalid QR code image. Please upload a clear QR photo.";
                }
                // Re-start camera so user can still scan directly after a failed upload
                try {
                    html5QrScanner = new Html5Qrcode("interactive-scanner");
                    html5QrScanner.start(
                        { facingMode: "environment" },
                        { fps: 10, qrbox: { width: 250, height: 250 } },
                        (decoded) => {
                            let hId = decoded.includes("tank_id=") ? decoded.split("tank_id=")[1] : decoded;
                            document.getElementById("tank-hardware-id").value = hId;
                            document.getElementById("scanner-section").style.display = "none";
                            document.getElementById("form-section").style.display = "block";
                            stopScanner();
                        },
                        () => { }
                    ).catch(() => { });
                } catch (_) { }
            } finally {
                uploadInput.value = "";
            }
        });
    });
})();

/* ============================================================
    DATA FETCHING & UI RENDERING
   ============================================================ */

async function fetchInitialData(email) {
    const tmCardsContainer = document.getElementById('tm-cards-container');
    if (tmCardsContainer) {
        tmCardsContainer.innerHTML = '<div style="padding:20px;color:#64748b;">Loading your tanks…</div>';
    }
    try {
        const response = await fetch(`${API_URL}/api/tank/user-tanks?email=${encodeURIComponent(email)}`);
        if (!response.ok) {
            console.error("user-tanks request failed:", response.status);
            displayNoTankState();
            return;
        }
        const tanks = await response.json();
        console.log("LOG: user-tanks response →", tanks);

        if (Array.isArray(tanks) && tanks.length > 0) {
            allTanks = tanks.map(t => ({
                ...t,
                waterLevel: Number.isFinite(t.waterLevel) ? t.waterLevel : 0,
                maxCapacity: Number.isFinite(t.maxCapacity) ? t.maxCapacity : 0,
                tankName: t.tankName || ('Tank ' + (t.tankId || '')),
                pumpStatus: t.pumpStatus || 'Off',
                isAutomatic: t.isAutomatic !== false
            }));
            renderTankManagement(allTanks);
            renderDashboardSwitcher(allTanks);

            const totalTanksEl = document.getElementById('tm-total-tanks');
            if (totalTanksEl) totalTanksEl.innerText = allTanks.length;
            const totalCap = allTanks.reduce((sum, t) => sum + (parseFloat(t.maxCapacity) || 0), 0);
            const totalCapEl = document.getElementById('tm-total-capacity');
            if (totalCapEl) totalCapEl.innerText = `${totalCap}L`;

            const storedId = localStorage.getItem("userTankId");
            const validStored = storedId && allTanks.some(t => t.tankId === storedId);
            activeTankId = validStored ? storedId : allTanks[0].tankId;
            localStorage.setItem("userTankId", activeTankId);

            const headerIdElement = document.getElementById('tm-header-tank-id');
            if (headerIdElement) headerIdElement.innerText = activeTankId;

            fetchTankDetails(activeTankId);

            if (pollingInterval) clearInterval(pollingInterval);

            pollingInterval = setInterval(() => {
                if (activeTankId && activeTankId !== "---") {
                    fetchTankDetails(activeTankId);
                }
            }, 5000);

        } else {
            displayNoTankState();
        }
    } catch (error) {
        console.error("System Initialization Error:", error);
        if (tmCardsContainer) {
            tmCardsContainer.innerHTML = '<div style="padding:20px;color:#ef4444;">Could not load tanks. Check that the backend is running.</div>';
        }
    }
}

function renderDashboardSwitcher(tanks) {
    const switcher = document.getElementById('tank-switcher');
    const logFilter = document.getElementById('log-filter-tank');

    if (switcher) {
        switcher.innerHTML = tanks.map(t =>
            `<option value="${t.tankId}">${t.tankName}</option>`
        ).join('');
        switcher.value = activeTankId;
        switcher.onchange = (e) => selectTank(e.target.value);
    }

    if (logFilter) {
        logFilter.innerHTML = `<option value="all">All Tanks</option>` +
            tanks.map(t => `<option value="${t.tankId}">${t.tankName}</option>`).join('');
    }
}

function updateDashboardUI(tank) {
    if (!tank) return;
    const level = Number.isFinite(tank.waterLevel) ? tank.waterLevel : 0;
    const capacity = Number.isFinite(tank.maxCapacity) ? tank.maxCapacity : 0;

    // 1. Cylinder Visual
    const cylinderText = document.getElementById('inner-percent');
    if (cylinderText) cylinderText.innerText = `${level.toFixed(0)}%`;
    const fill = document.getElementById('visual-water-fill');
    if (fill) {
        fill.style.height = `${level}%`;
        fill.classList.remove('level-critical', 'level-warning', 'level-normal');
        if (level <= 20) fill.classList.add('level-critical');
        else if (level <= 40) fill.classList.add('level-warning');
        else fill.classList.add('level-normal');
        fill.classList.add('level-updating');
        setTimeout(() => fill.classList.remove('level-updating'), 900);
    }

    // 2. Header & Tank Name
    const idLabel = document.getElementById('active-tank-id-label');
    if (idLabel) idLabel.innerText = tank.tankId || tank.id || '—';
    const nameEl = document.getElementById('card-tank-name');
    if (nameEl) nameEl.innerText = `ID: ${tank.tankId || tank.id || '—'}`;

    // 3. Card Progress & Percent
    const progressFill = document.getElementById('card-progress-fill');
    if (progressFill) progressFill.style.width = `${level}%`;
    const percentStat = document.getElementById('card-percent-stat');
    if (percentStat) percentStat.innerText = `${level.toFixed(1)}%`;

    // 4. Volume Stats
    const currentLiters = (level / 100) * capacity;
    const monitorVolume = document.getElementById('monitor-volume');
    if (monitorVolume) monitorVolume.innerText = `${currentLiters.toFixed(1)} of ${capacity}L`;
    if (document.getElementById('card-volume-stat')) {
        document.getElementById('card-volume-stat').innerText = `${currentLiters.toFixed(1)}L / ${capacity}L`;
    }

    // 5. Real-time Monitoring Tiles & Pump Status
    const monitorPercent = document.getElementById('monitor-percent');
    const monitorBar = document.getElementById('monitor-mini-bar');
    if (monitorPercent) monitorPercent.innerText = `${level.toFixed(1)}%`;
    if (monitorBar) monitorBar.style.width = `${level}%`;

    const pumpStatusBox = document.getElementById('monitor-pump-status');
    if (pumpStatusBox) {
        const currentStatus = (tank.pumpStatus || "").toUpperCase();
        pumpStatusBox.innerText = currentStatus;
        pumpStatusBox.className = currentStatus === "ON" ? "status-on" : "status-off";
    }

    // 6. Timestamp
    const lastUpdateDisplay = document.getElementById('monitor-timestamp');
    const rawDate = tank.lastUpdated || tank.last_updated;

    if (lastUpdateDisplay && rawDate) {
        let date;
        if (Array.isArray(rawDate)) {
            date = new Date(rawDate[0], rawDate[1] - 1, rawDate[2], rawDate[3], rawDate[4], rawDate[5] || 0);
        } else {
            let sanitized = rawDate.replace("|", "").replace(/\s+/g, " ").trim();
            date = new Date(sanitized);
        }

        if (!isNaN(date.getTime())) {
            lastUpdateDisplay.innerText = date.toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        } else {
            console.error("Date Parsing Failed for:", rawDate);
            lastUpdateDisplay.innerText = "Format Error";
        }
    } else if (lastUpdateDisplay) {
        lastUpdateDisplay.innerText = "--:--:--";
    }

    // 7. Footer Tags
    const sensorText = document.getElementById('sensor-text');
    const networkText = document.getElementById('network-text');
    const autoModeText = document.getElementById('auto-mode-text');

    if (autoModeText) {
        if (tank.isAutomatic) {
            autoModeText.innerText = "Enabled Safe";
            autoModeText.style.color = "#22c55e";
        } else {
            autoModeText.innerText = "Manual Control";
            autoModeText.style.color = "#f59e0b";
        }
    }

    if (tank.systemStatus === "Offline") {
        if (sensorText) { sensorText.innerText = "Disconnected"; sensorText.style.color = "#ef4444"; }
        if (networkText) { networkText.innerText = "Offline"; networkText.style.color = "#ef4444"; }
    } else if (tank.systemStatus === "Warning") {
        if (sensorText) { sensorText.innerText = "Low Level Alert"; sensorText.style.color = "#f59e0b"; }
        if (networkText) { networkText.innerText = "Online Critical"; networkText.style.color = "#f59e0b"; }
    } else {
        if (sensorText) { sensorText.innerText = "Connected"; sensorText.style.color = "#22c55e"; }
        if (networkText) { networkText.innerText = "Online"; networkText.style.color = "#22c55e"; }
    }

    const mainDot = document.getElementById('card-dot');
    const mainStatusLabel = document.getElementById('card-status-text');
    if (mainDot && mainStatusLabel) {
        mainDot.className = 'dot';
        mainStatusLabel.className = 'status-text';
        const currentStatus = tank.systemStatus ? tank.systemStatus.toLowerCase() : 'offline';
        mainDot.classList.add(currentStatus);
        mainStatusLabel.classList.add(`${currentStatus}-text`);
        mainStatusLabel.innerText = tank.systemStatus || 'Offline';
    }

    // 8. Pump Button
    const pumpBtn = document.getElementById('pump-btn');
    const pumpBtnText = document.getElementById('pump-btn-text');
    if (pumpBtn) {
        if (tank.isAutomatic) {
            pumpBtn.disabled = true;
            if (pumpBtnText) pumpBtnText.innerText = "AUTO MODE ACTIVE";
            pumpBtn.classList.remove('pump-on');
        } else {
            pumpBtn.disabled = false;
            if ((tank.pumpStatus || "").toUpperCase() === "ON") {
                pumpBtn.classList.add('pump-on');
                if (pumpBtnText) pumpBtnText.innerText = "PUMP IS ON";
            } else {
                pumpBtn.classList.remove('pump-on');
                if (pumpBtnText) pumpBtnText.innerText = "MANUAL PUMP OFF";
            }
        }
    }

    // 9. Global Summary
    const topCurrentVolume = document.getElementById('tm-current-volume');
    const topAvgFill = document.getElementById('tm-avg-fill');
    if (topCurrentVolume) {
        const calculatedVol = (level / 100) * capacity;
        topCurrentVolume.innerText = `${calculatedVol.toFixed(1)}L`;
    }
    if (topAvgFill) {
        topAvgFill.innerText = `${level.toFixed(1)}%`;
    }
}

function renderTankManagement(tanks) {
    const container = document.getElementById('tm-cards-container');
    if (!container) return;
    const headerId = document.getElementById('tm-header-tank-id');
    if (headerId && activeTankId) {
        headerId.innerText = activeTankId;
    }

    if (!tanks || !tanks.length) {
        container.innerHTML = '<div style="padding:20px;color:#64748b;">No tanks registered yet. Click "Add Tank" to register one.</div>';
        return;
    }

    const now = Date.now();
    container.innerHTML = tanks.map(t => {
        let systemStatus = (t.systemStatus || '').toLowerCase();
        if (!systemStatus) {
            if (!t.lastUpdated) {
                systemStatus = 'offline';
            } else {
                const last = new Date(t.lastUpdated).getTime();
                systemStatus = (now - last) < 30000 ? 'online' : 'offline';
            }
        }
        const level = Number.isFinite(t.waterLevel) ? t.waterLevel : 0;
        const capacity = Number.isFinite(t.maxCapacity) ? t.maxCapacity : 0;
        const safeName = t.tankName || ('Tank ' + (t.tankId || ''));
        const isAuto = t.isAutomatic !== false;

        return `
        <div class="tm-card ${t.tankId === activeTankId ? 'active' : ''}" onclick="selectTank('${t.tankId}')">
            <div class="tm-card-top">
                <div class="tm-status-wrap">
                    <span class="tm-dot ${systemStatus}"></span>
                    <span class="${systemStatus}-text">System ${systemStatus.charAt(0).toUpperCase() + systemStatus.slice(1)}</span>
                </div>
                <h3>${safeName}</h3>
                <small style="color: #64748b;">Hardware ID: ${t.tankId || '—'}</small>
            </div>

            <div class="tm-level-display">
                <div class="tm-progress-container">
                    <div class="tm-progress-fill" style="width: ${level}%"></div>
                </div>
                <div class="tm-percent-text">${level.toFixed(1)}%</div>
                <div style="font-size: 0.8rem; color: #64748b; text-align: center;">
                    Capacity: ${capacity}L
                </div>
            </div>

            <div class="tm-mode-indicator">
                <i class="fas ${isAuto ? 'fa-robot' : 'fa-hand-pointer'} tm-mode-icon"></i>
                ${isAuto ? 'Automatic Mode' : 'Manual Mode'}
            </div>

            <div class="tm-actions">
                <button class="tm-btn-edit" onclick="event.stopPropagation(); openEditModal('${t.tankId}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="tm-btn-delete" onclick="event.stopPropagation(); deleteTank('${t.tankId}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>`;
    }).join('');
}

/* ============================================================
   SELECT TANK
   ============================================================ */
window.selectTank = function (tankId) {
    if (!tankId) return;
    activeTankId = tankId;
    localStorage.setItem("userTankId", tankId);

    document.querySelectorAll('.tm-card').forEach(card => card.classList.remove('active'));
    document.querySelectorAll('.tm-card').forEach(card => {
        if (card.getAttribute('onclick') && card.getAttribute('onclick').includes(tankId)) {
            card.classList.add('active');
        }
    });

    const switcher = document.getElementById('tank-switcher');
    if (switcher && switcher.value !== tankId) switcher.value = tankId;

    const headerIdElement = document.getElementById('tm-header-tank-id');
    if (headerIdElement) headerIdElement.innerText = tankId;

    fetchTankDetails(tankId);
};

/* ============================================================
   DISPLAY NO-TANK STATE
   ============================================================ */
function displayNoTankState() {
    const container = document.getElementById('tm-cards-container');
    if (container) {
        container.innerHTML = '<div style="padding:20px;color:#64748b;text-align:center;">' +
            '<i class="fas fa-water" style="font-size:2rem;margin-bottom:10px;display:block;opacity:0.4;"></i>' +
            'No tanks registered yet.<br>Click <strong>Add Tank</strong> to register your first tank.</div>';
    }
    const totalTanksEl = document.getElementById('tm-total-tanks');
    if (totalTanksEl) totalTanksEl.innerText = '0';
    const totalCapEl = document.getElementById('tm-total-capacity');
    if (totalCapEl) totalCapEl.innerText = '0L';
    const switcher = document.getElementById('tank-switcher');
    if (switcher) switcher.innerHTML = '<option value="">— No tanks —</option>';
}

async function fetchAllActivityLogs(emailFromNav) {
    try {
        const userEmail = emailFromNav || localStorage.getItem("userEmail") || "system.water.tank@gmail.com";

        const [logRes, tankRes] = await Promise.all([
            fetch(`${API_URL}/api/logs/all?email=${userEmail}`),
            fetch(`${API_URL}/api/tank/user-tanks?email=${userEmail}`)
        ]);

        let logs = [];
        let tanks = [];

        if (logRes.ok) {
            try { logs = await logRes.json(); } catch (e) { logs = []; }
        }
        if (tankRes.ok) {
            try { tanks = await tankRes.json(); } catch (e) { tanks = []; }
        }

        const tableBody = document.getElementById('activity-log-table-body');
        if (!tableBody) return;

        if (!Array.isArray(logs) || logs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:20px;">No activity logs found yet. Logs appear after tank events occur.</td></tr>';
            updateActivitySummary([]);
            return;
        }

        const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        tableBody.innerHTML = sortedLogs.map(log => {
            const logTankId = log.tankData ? log.tankData.tankId : log.tankId;
            const displayName = logTankId || "System";
            const date = log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A";
            const rawStatus = log.status || "Info";

            const formattedStatus = rawStatus.replace(/_/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');

            const statusClass = rawStatus.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');

            return `
                <tr>
                    <td>${date}</td>
                    <td><b style="color: var(--primary-color)">${displayName}</b></td>
                    <td>${log.action || 'n/a'}</td>
                    <td><span class="status-pill ${statusClass}">${formattedStatus}</span></td>
                    <td>${log.details || ''}</td>
                </tr>
            `;
        }).join('');

        renderMobileLogCards(sortedLogs);
        updateActivitySummary(logs);
    } catch (error) {
        console.error("Activity Log Display Error:", error);
    }
}

function renderMobileLogCards(logs) {
    const container = document.getElementById('mob-log-cards-container');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = '<p style="color:#64748b;font-size:.88rem;text-align:center;padding:20px 0;">No activity logs found yet.</p>';
        return;
    }

    container.innerHTML = logs.map(log => {
        const displayName = (log.tankData ? log.tankData.tankId : log.tankId) || 'System';
        const date = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A';
        const rawStatus = (log.status || 'Info').trim();
        const statusLower = rawStatus.toLowerCase();
        let badgeClass = 'success';
        if (statusLower.includes('warn')) badgeClass = 'warning';
        else if (statusLower.includes('critical') || statusLower.includes('error') || statusLower.includes('fail')) badgeClass = 'critical';
        const formattedStatus = rawStatus.replace(/_/g, ' ')
            .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

        return `<div class="mob-log-card">
            <div class="mlc-top">
                <span class="mlc-timestamp">${date}</span>
                <span class="mlc-badge ${badgeClass}">${formattedStatus}</span>
            </div>
            <div class="mlc-tankid">Tank: ${displayName}</div>
            <div class="mlc-action">${log.action || 'No action'}</div>
            ${log.details ? `<div class="mlc-details">${log.details}</div>` : ''}
        </div>`;
    }).join('');
}

function updateActivitySummary(logs) {
    const getCount = (keywords) => logs.filter(l => {
        const s = (l.status || "").toString().trim().toUpperCase().replace('_', ' ');
        return keywords.some(key => s.includes(key));
    }).length;

    const counts = {
        Success: getCount(['SUCCESS', 'UPDATED', 'SENT', 'ACTIVE', 'REGISTRATION', 'CONSUMPTION']),
        Warning: getCount(['USER OP', 'WARNING', 'RUNNING', 'TRIGGER', 'STOP', 'UPDATE']),
        Critical: getCount(['CRITICAL', 'ERROR', 'PUMP TRIGGERED', 'SAFETY SHUTOFF'])
    };

    const totalEventsEl = document.getElementById('log-count-display');
    if (totalEventsEl) totalEventsEl.innerText = logs.length;

    const successEl = document.getElementById('stat-count-success');
    const warningEl = document.getElementById('stat-count-warning');
    const criticalEl = document.getElementById('stat-count-critical');

    if (successEl) successEl.innerText = counts.Success;
    if (warningEl) warningEl.innerText = counts.Warning;
    if (criticalEl) criticalEl.innerText = counts.Critical;

    console.log("Dashboard Statistics Updated:", counts);
}

/* ============================================================
   PUMP CONTROL LOGIC (MANUAL MODE)
   ============================================================ */
async function handleManualPumpToggle() {
    if (!activeTankId || activeTankId === "---") return showToast("Please select a tank first.", "warning");

    try {
        const response = await fetch(`${API_URL}/api/tank/toggle-pump`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tankId: activeTankId })
        });

        if (response.ok) {
            console.log("Pump Toggle Success");
            fetchTankDetails(activeTankId);
        } else {
            const errorMsg = await response.text();
            showToast(errorMsg, "error");
        }
    } catch (err) {
        console.error("Toggle Error:", err);
    }
}

/* ============================================================
    HELPERS & SETTINGS
   ============================================================ */
async function saveUserSettings() {
    const email = localStorage.getItem("userEmail");

    const currentPass = document.getElementById('settings-curr-pass').value.trim();
    const newPass = document.getElementById('settings-new-pass').value.trim();
    const confirmPass = document.getElementById('settings-confirm-pass').value.trim();

    const passwordChangeAttempted = currentPass || newPass || confirmPass;

    if (passwordChangeAttempted) {
        if (!currentPass) {
            showToast("Current password is required to change your password.", "error");
            document.getElementById('settings-curr-pass').classList.add('field-error');
            return;
        }
        document.getElementById('settings-curr-pass').classList.remove('field-error');

        if (!newPass || newPass.length < 6) {
            showToast("New password must be at least 6 characters.", "error");
            document.getElementById('settings-new-pass').classList.add('field-error');
            return;
        }
        document.getElementById('settings-new-pass').classList.remove('field-error');

        if (newPass !== confirmPass) {
            showToast("New passwords do not match.", "error");
            document.getElementById('settings-confirm-pass').classList.add('field-error');
            return;
        }
        document.getElementById('settings-confirm-pass').classList.remove('field-error');
    }

    const payload = {
        email: email,
        phone: document.getElementById('phone-input').value,
        emailEnabled: document.getElementById('email-notif-toggle').checked,
        smsEnabled: document.getElementById('sms-notif-toggle').checked
    };

    if (passwordChangeAttempted) {
        payload.currentPassword = currentPass;
        payload.newPassword = newPass;
    }

    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.add('btn-loading'); }

    try {
        const response = await fetch(`${API_URL}/api/settings/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();

        if (!response.ok || responseText.startsWith("Error:")) {
            const msg = responseText.startsWith("Error:")
                ? responseText.replace("Error:", "").trim()
                : "Settings could not be saved. Please try again.";
            showToast(msg, "error");

            if (responseText.includes("incorrect")) {
                document.getElementById('settings-curr-pass').classList.add('field-error');
            }
            return;
        }

        document.getElementById('settings-curr-pass').value = "";
        document.getElementById('settings-new-pass').value = "";
        document.getElementById('settings-confirm-pass').value = "";
        document.getElementById('settings-curr-pass').classList.remove('field-error');
        document.getElementById('settings-new-pass').classList.remove('field-error');
        document.getElementById('settings-confirm-pass').classList.remove('field-error');

        if (passwordChangeAttempted) {
            showToast("Security Configuration Successful. Password updated and notification sent.", "success");
        } else {
            showToast("Settings saved successfully!", "success");
        }

        loadSettingsData();

    } catch (error) {
        console.error("Database Connection Error:", error);
        showToast("Network error: could not connect to the server.", "error");
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove('btn-loading'); }
    }
}

async function loadSettingsData() {
    const email = localStorage.getItem("userEmail");
    if (!email) return;

    const emailField = document.getElementById('email-input');
    if (emailField) {
        emailField.value = email;
        emailField.readOnly = true;
        emailField.style.cursor = "default";
        emailField.style.pointerEvents = "none";
    }

    try {
        const res = await fetch(`${API_URL}/api/settings/load?email=${email}`);
        if (res.ok) {
            const data = await res.json();
            const phoneField = document.getElementById('phone-input');
            if (phoneField) {
                phoneField.value = data.phone || "";
                phoneField.style.cursor = "text";
                phoneField.style.pointerEvents = "auto";
            }
            document.getElementById('email-notif-toggle').checked = data.emailEnabled;
            document.getElementById('sms-notif-toggle').checked = data.smsEnabled;
        }
    } catch (err) {
        console.error("Settings Load Error:", err);
    }
}

window.deleteTank = async function (tankId) {
    if (!confirm(`Are you sure you want to delete Tank ${tankId}? This will erase all logs.`)) return;

    try {
        const res = await fetch(`${API_URL}/api/tank/delete/${tankId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast("Tank deleted successfully.", "success");
            if (activeTankId === tankId) {
                localStorage.removeItem("userTankId");
                activeTankId = "---";
            }
            const currentEmail = localStorage.getItem("userEmail");
            if (currentEmail) fetchInitialData(currentEmail);
        } else {
            showToast("Failed to delete tank.", "error");
        }
    } catch (err) {
        console.error("Delete error:", err);
    }
};

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function () {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');

            const viewName = this.dataset.view;
            const target = document.getElementById(viewName);

            if (target) {
                target.style.display = 'block';
            }

            if (viewName === 'analytics-view') {
                loadTankNames();
                updateAnalytics();
            }

            if (viewName === 'activity-log-view') {
                const userEmail = localStorage.getItem("userEmail");
                if (userEmail) {
                    fetchAllActivityLogs(userEmail);
                } else {
                    console.error("Navigation Error: User email not found in local storage.");
                }
            }

            if (viewName === 'need-help-view') {
                loadMyTickets();
            }
        });
    });
}

/* ============================================================
   ACTIVITY LOG FILTERING SYSTEM
   ============================================================ */
function filterActivityLogs() {
    const searchInput = document.getElementById('log-search-input');
    const tankFilterElem = document.getElementById('log-filter-tank');
    const statusFilterElem = document.getElementById('log-filter-status');

    if (!searchInput || !tankFilterElem || !statusFilterElem) return;

    const searchTerm = searchInput.value.toLowerCase();
    const statusFilter = statusFilterElem.value;
    const rows = document.querySelectorAll('#activity-log-table-body tr');

    let successCount = 0;
    let warningCount = 0;
    let criticalCount = 0;

    rows.forEach(row => {
        const currentTankID = row.cells[1].innerText.trim();
        const actionText = row.cells[2].innerText.toLowerCase();
        const detailsText = row.cells[4].innerText.toLowerCase();
        const pill = row.querySelector('.status-pill');

        let currentStatus = 'Other';

        if (pill) {
            const rawText = pill.innerText.trim().toUpperCase();

            if (['SUCCESS', 'ACTIVE', 'UPDATED', 'REGISTRATION', 'ONLINE', 'SENT'].includes(rawText)) {
                currentStatus = 'Success';
                successCount++;
            }
            else if (['RUNNING', 'USER_OP', 'USER OP', 'WARNING', 'MANUAL TRIGGER', 'CONFIGURATION UPDATE'].includes(rawText)) {
                currentStatus = 'Warning';
                warningCount++;
            }
            else if (['SYSTEM_OFF', 'SYSTEM OFF', 'CRITICAL', 'ERROR', 'SAFETY SHUTOFF', 'OFFLINE'].includes(rawText)) {
                currentStatus = 'Critical';
                criticalCount++;
            }
        }

        const matchesSearch = searchTerm === "" || actionText.includes(searchTerm) || detailsText.includes(searchTerm) || currentTankID.includes(searchTerm);
        const matchesTank = (tankFilterElem.value === 'all' || currentTankID === tankFilterElem.value);
        const matchesStatus = (statusFilter === 'all' || currentStatus === statusFilter);

        row.style.display = (matchesSearch && matchesStatus && matchesTank) ? "" : "none";
    });

    document.querySelectorAll('.mob-log-card').forEach(card => {
        const tankId = (card.querySelector('.mlc-tankid') || {}).innerText || '';
        const action = (card.querySelector('.mlc-action') || {}).innerText || '';
        const details = (card.querySelector('.mlc-details') || {}).innerText || '';
        const badge = card.querySelector('.mlc-badge');
        const badgeTxt = badge ? badge.innerText.trim().toUpperCase() : '';

        let cardStatus = 'Other';
        if (['SUCCESS', 'ACTIVE', 'UPDATED', 'REGISTRATION', 'ONLINE', 'SENT'].includes(badgeTxt)) cardStatus = 'Success';
        else if (['RUNNING', 'USER_OP', 'USER OP', 'WARNING', 'MANUAL TRIGGER', 'CONFIGURATION UPDATE'].includes(badgeTxt)) cardStatus = 'Warning';
        else if (['SYSTEM_OFF', 'SYSTEM OFF', 'CRITICAL', 'ERROR', 'SAFETY SHUTOFF', 'OFFLINE'].includes(badgeTxt)) cardStatus = 'Critical';

        const matchesSearch = searchTerm === '' || action.toLowerCase().includes(searchTerm) || details.toLowerCase().includes(searchTerm) || tankId.toLowerCase().includes(searchTerm);
        const matchesTank = (tankFilterElem.value === 'all' || tankId.includes(tankFilterElem.value));
        const matchesStatus = (statusFilter === 'all' || cardStatus === statusFilter);

        card.style.display = (matchesSearch && matchesTank && matchesStatus) ? '' : 'none';
    });

    if (document.getElementById('stat-count-success')) {
        document.getElementById('stat-count-success').innerText = successCount;
    }
    if (document.getElementById('stat-count-warning')) {
        document.getElementById('stat-count-warning').innerText = warningCount;
    }
    if (document.getElementById('stat-count-critical')) {
        document.getElementById('stat-count-critical').innerText = criticalCount;
    }
}

/* ============================================================
   CHART INSTANCES
   ============================================================ */
let weeklyChart, distributionChart, monthlyChart;

async function updateAnalytics() {
    const tankSelect = document.getElementById('tankSelect');
    if (!tankSelect) return;

    const tankId = tankSelect.value || "all";
    const tankName = tankSelect.options[tankSelect.selectedIndex].text;
    const email = localStorage.getItem("userEmail");

    const encodedEmail = encodeURIComponent(email);
    const baseUrl = `${API_URL}/api/analytics`;
    const params = `?tankId=${tankId}&email=${encodedEmail}`;

    const headerTitle = document.querySelector('#analytics-view .view-header h1');
    if (headerTitle) {
        headerTitle.innerText = tankId === "all" ? "System Analytics" : `Analytics: ${tankName}`;
    }

    try {
        const statsRes = await fetch(`${baseUrl}/stats${params}`);
        if (statsRes.ok) {
            const stats = await statsRes.json();
            document.getElementById('ana-total-cons').innerText = stats.totalConsumption;
            document.getElementById('ana-avg-usage').innerText = stats.avgDailyUsage;
            document.getElementById('ana-eff-score').innerText = stats.efficiencyScore;
            document.getElementById('ana-monthly-trend').innerText = stats.monthlyTrend;

            const scoreValue = parseInt(stats.efficiencyScore);
            const labelElement = document.getElementById('ana-eff-label');
            if (labelElement) {
                if (scoreValue >= 90) { labelElement.innerText = "Excellent"; labelElement.style.color = "#2ecc71"; }
                else if (scoreValue >= 70) { labelElement.innerText = "Good"; labelElement.style.color = "#f1c40f"; }
                else if (scoreValue >= 40) { labelElement.innerText = "Fair"; labelElement.style.color = "#e67e22"; }
                else { labelElement.innerText = "Poor"; labelElement.style.color = "#e74c3c"; }
            }
        }

        const insightRes = await fetch(`${baseUrl}/insights${params}`);
        if (insightRes.ok) {
            const insights = await insightRes.json();
            const list = document.getElementById('ana-insights-list');
            if (list) {
                list.innerHTML = insights.map(text => {
                    const isCritical = text.toUpperCase().includes("CRITICAL");
                    const iconColor = isCritical ? '#ef4444' : '#f59e0b';
                    const icon = isCritical ? 'fa-exclamation-triangle' : 'fa-lightbulb';
                    return `<li style="color: ${isCritical ? '#ef4444' : 'inherit'}; margin-bottom: 10px; display: flex;">
                                <i class="fas ${icon}" style="color: ${iconColor}; margin-right: 10px; margin-top: 4px;"></i>
                                <span>${text}</span>
                            </li>`;
                }).join('');
            }
        }

        const distRes = await fetch(`${baseUrl}/distribution?email=${encodedEmail}`);
        if (distRes.ok) {
            const data = await distRes.json();
            renderDoughnutChart(data);
        }

        const historyRes = await fetch(`${baseUrl}/history${params}`);
        const monthlyRes = await fetch(`${baseUrl}/monthly-trend${params}`);

        if (historyRes.ok && monthlyRes.ok) {
            const weeklyLogs = await historyRes.json();
            const monthlyLogs = await monthlyRes.json();
            renderLineCharts(weeklyLogs, monthlyLogs);
        }

    } catch (err) {
        console.error("Analytics Sync Error:", err);
    }
}

function renderLineCharts(weeklyLogs, monthlyLogs) {
    const labels = (weeklyLogs && weeklyLogs.labels) ? weeklyLogs.labels : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const consumptionData = (weeklyLogs && weeklyLogs.consumptionData) ? weeklyLogs.consumptionData : [0, 0, 0, 0, 0, 0, 0];
    const refillData = (weeklyLogs && weeklyLogs.refillData) ? weeklyLogs.refillData : [0, 0, 0, 0, 0, 0, 0];

    if (weeklyChart) weeklyChart.destroy();
    const ctxWeekly = document.getElementById('weeklyUsageChart');

    if (ctxWeekly) {
        weeklyChart = new Chart(ctxWeekly.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Consumption (L)',
                        data: consumptionData,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderRadius: 5,
                        barPercentage: 0.6,
                        categoryPercentage: 0.5
                    },
                    {
                        label: 'Refill (L)',
                        data: refillData,
                        backgroundColor: 'rgba(34, 197, 94, 0.8)',
                        borderRadius: 5,
                        barPercentage: 0.6,
                        categoryPercentage: 0.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    if (monthlyChart) monthlyChart.destroy();
    const ctxMonthly = document.getElementById('monthlyTrendChart');
    if (ctxMonthly && monthlyLogs) {
        monthlyChart = new Chart(ctxMonthly.getContext('2d'), {
            type: 'line',
            data: {
                labels: monthlyLogs.labels,
                datasets: [{
                    label: 'Historical Monthly Usage (L)',
                    data: monthlyLogs.data,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function renderDoughnutChart(distData) {
    const canvas = document.getElementById('tankDistributionChart');
    if (!canvas) return;

    if (distributionChart) distributionChart.destroy();

    const labels = Object.keys(distData);
    const values = Object.values(distData);
    const customColors = ['#3b82f6', '#e2e8f0', '#a855f7', '#f59e0b', '#ef4444'];

    distributionChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: customColors,
                hoverOffset: 10,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` ${context.label}: ${context.raw}%`;
                        }
                    }
                }
            }
        }
    });
}

async function loadTankNames() {
    const email = localStorage.getItem("userEmail");
    const select = document.getElementById('tankSelect');
    if (!select) return;

    try {
        const encodedEmail = encodeURIComponent(email);
        const response = await fetch(`${API_URL}/api/tank/user-tanks?email=${encodedEmail}`);

        if (response.ok) {
            const tanks = await response.json();
            select.innerHTML = '<option value="all">Overall All Tanks</option>';
            tanks.forEach(tank => {
                const option = document.createElement('option');
                option.value = tank.tankId;
                option.textContent = tank.tankName;
                select.appendChild(option);
            });
            console.log("Analytics dropdown successfully populated with Tank Names.");
        } else {
            console.error("Failed to fetch tanks. Status:", response.status);
        }
    } catch (err) {
        console.error("Network error while loading tank names:", err);
    }
}

function startLiveClock() {
    const clockElement = document.getElementById('current-pc-time');
    if (!clockElement) {
        console.warn("Live Clock: Target element 'current-pc-time' not found in DOM.");
        return;
    }

    setInterval(() => {
        const now = new Date();
        const options = {
            month: 'short', day: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        };
        const formattedDate = now.toLocaleString('en-US', options).replace(',', ' |');
        clockElement.innerText = formattedDate;
    }, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('log-search-input');
    const tankDropdown = document.getElementById('log-filter-tank');
    const statusDropdown = document.getElementById('log-filter-status');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            console.log("Searching for: " + searchInput.value);
            filterActivityLogs();
        });
    }

    if (tankDropdown) tankDropdown.addEventListener('change', filterActivityLogs);
    if (statusDropdown) statusDropdown.addEventListener('change', filterActivityLogs);
});

/* ============================================================
   NEED HELP? — SUPPORT TICKET SUBMISSION
   ============================================================ */
async function submitHelpTicket() {
    const email = localStorage.getItem("userEmail");
    if (!email) { showToast("Please log in first.", "warning"); return; }

    const message = document.getElementById("help-message")?.value?.trim();
    const category = document.getElementById("help-category")?.value;
    const fileInput = document.getElementById("help-attachment");
    const statusDiv = document.getElementById("help-submit-status");
    const submitBtn = document.getElementById("help-submit-btn");

    if (!message) {
        statusDiv.innerHTML = '<p style="color:#e74c3c;margin-top:10px;"> Please describe your concern first.</p>';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    statusDiv.innerHTML = '';

    const formData = new FormData();
    formData.append("email", email);
    formData.append("message", message);
    formData.append("category", category);
    if (fileInput && fileInput.files[0]) formData.append("file", fileInput.files[0]);

    try {
        const res = await fetch(`${API_URL}/api/support/submit`, { method: "POST", body: formData });
        if (res.ok) {
            const data = await res.json();
            statusDiv.innerHTML = `<p style="color:#27ae60;margin-top:10px;padding:12px;background:rgba(39,174,96,0.1);border-radius:8px;border:1px solid rgba(39,174,96,0.3);">
                 ${data.message}</p>`;
            document.getElementById("help-message").value = "";
            if (fileInput) fileInput.value = "";
            setTimeout(() => loadMyTickets(), 500);
        } else {
            statusDiv.innerHTML = '<p style="color:#e74c3c;margin-top:10px;"> Failed to submit. Try again.</p>';
        }
    } catch (err) {
        statusDiv.innerHTML = '<p style="color:#e74c3c;margin-top:10px;"> Cannot connect to server. Is IntelliJ running?</p>';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Concern';
    }
}

/* ============================================================
   MY TICKETS — conversation thread with reply & appeal system
   ============================================================ */
function fmtTicketDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-PH", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

function buildAttachmentPreviewUser(msg, apiUrl) {
    if (!msg.attachmentOriginalName) return "";
    const path = msg.attachmentPath || "";
    const filename = path.replace(/^.*[\\\/]/, "");
    const url = filename
        ? `${apiUrl}/api/support/msg-attachment/${encodeURIComponent(filename)}`
        : "";
    if (!url) return `<div style="font-size:0.8rem;color:#888;margin-top:6px;"><i class="fas fa-paperclip"></i> ${msg.attachmentOriginalName}</div>`;
    const isImage = (msg.attachmentType || "").startsWith("image/");
    const isVideo = (msg.attachmentType || "").startsWith("video/");
    if (isImage) return `<div style="margin-top:8px;"><img src="${url}" style="max-width:100%;max-height:180px;border-radius:8px;cursor:pointer;" onclick="window.open('${url}','_blank')" onerror="this.style.display='none'"></div>`;
    if (isVideo) return `<div style="margin-top:8px;"><video controls style="max-width:100%;max-height:180px;border-radius:8px;"><source src="${url}" type="${msg.attachmentType}"></video></div>`;
    return `<div style="margin-top:6px;font-size:0.82rem;"><i class="fas fa-paperclip"></i> <a href="${url}" target="_blank" style="color:#9b59b6;">${msg.attachmentOriginalName}</a></div>`;
}

function renderConversation(messages, isClosed, ticketId, apiUrl) {
    if (!messages || !messages.length) return '<div style="color:#888;font-size:0.88rem;">No messages yet.</div>';
    const bubbles = messages.map(msg => {
        const isAdmin = msg.sender === "admin";
        const bg = isAdmin ? "rgba(74,158,255,0.10)" : "rgba(155,89,182,0.08)";
        const border = isAdmin ? "rgba(74,158,255,0.25)" : "rgba(155,89,182,0.2)";
        const nameColor = isAdmin ? "#4a9eff" : "#9b59b6";
        const align = isAdmin ? "flex-start" : "flex-end";
        const attach = buildAttachmentPreviewUser(msg, apiUrl);
        return `<div style="display:flex;justify-content:${align};margin-bottom:10px;">
            <div style="max-width:85%;padding:10px 14px;background:${bg};border:1px solid ${border};border-radius:12px;">
                <div style="font-size:0.75rem;font-weight:600;color:${nameColor};margin-bottom:4px;">
                    ${isAdmin ? '<i class="fas fa-user-shield"></i>' : '<i class="fas fa-user"></i>'} ${msg.senderName || (isAdmin ? "Admin" : "You")}
                    <span style="font-weight:400;color:#888;margin-left:8px;">${fmtTicketDate(msg.timestamp)}</span>
                </div>
                <div style="font-size:0.88rem;line-height:1.6;">${msg.message || ""}</div>
                ${attach}
            </div>
        </div>`;
    }).join("");

    const replyBox = isClosed
        ? `<div style="margin-top:14px;padding:12px 16px;background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.2);border-radius:10px;font-size:0.85rem;color:#e74c3c;text-align:center;">
               <i class="fas fa-lock"></i> This conversation has been <strong>closed</strong> by admin. Submit a new ticket if you need further help.
           </div>`
        : `<div style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.07);padding-top:14px;">
               <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;color:#ccc;">
                   <i class="fas fa-reply" style="color:#9b59b6;"></i> Continue / Appeal
               </div>
               <textarea id="reply-msg-${ticketId}" rows="3" placeholder="Type your reply or appeal here..."
                   style="width:100%;padding:10px 13px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:inherit;font-size:0.88rem;resize:vertical;box-sizing:border-box;"></textarea>
               <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;">
                   <input type="file" id="reply-file-${ticketId}" accept="image/*,video/*"
                       style="flex:1;min-width:0;font-size:0.8rem;color:#aaa;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:5px 8px;border-radius:6px;">
                   <button onclick="sendUserReply(${ticketId})"
                       style="background:rgba(155,89,182,0.2);border:1px solid rgba(155,89,182,0.4);color:#9b59b6;padding:7px 18px;border-radius:8px;cursor:pointer;font-size:0.88rem;white-space:nowrap;">
                       <i class="fas fa-paper-plane"></i> Send Reply
                   </button>
               </div>
               <div id="reply-status-${ticketId}" style="margin-top:6px;font-size:0.83rem;"></div>
           </div>`;

    return bubbles + replyBox;
}

async function loadMyTickets() {
    const email = localStorage.getItem("userEmail");
    const container = document.getElementById("my-tickets-container");
    if (!container) return;
    if (!email) {
        container.innerHTML = '<div style="color:#888;">Please log in to view your tickets.</div>';
        return;
    }
    container.innerHTML = '<div style="color:#888;font-size:0.9rem;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const res = await fetch(`${API_URL}/api/support/my-tickets?email=${encodeURIComponent(email)}`);
        if (!res.ok) throw new Error("Failed");
        const tickets = await res.json();
        if (!tickets.length) {
            container.innerHTML = '<div style="color:#888;font-size:0.9rem;text-align:center;padding:24px 0;">No tickets submitted yet.</div>';
            return;
        }
        container.innerHTML = tickets.map(t => {
            const statusColor = t.status === "Open" ? "#e67e22" : t.status === "In Progress" ? "#3498db" : "#27ae60";
            const statusBg = t.status === "Open" ? "rgba(230,126,34,0.12)" : t.status === "In Progress" ? "rgba(52,152,219,0.12)" : "rgba(39,174,96,0.12)";
            const closedBadge = t.isClosed ? `<span style="margin-left:6px;padding:2px 9px;border-radius:20px;font-size:0.72rem;background:rgba(231,76,60,0.12);color:#e74c3c;"><i class="fas fa-lock"></i> Closed</span>` : "";

            let conversation = [];
            try { if (t.conversationJson) conversation = JSON.parse(t.conversationJson); } catch (e) { }
            const convHTML = renderConversation(conversation, t.isClosed, t.id, API_URL);

            return `<div style="padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
                    <div>
                        <span style="font-weight:700;font-size:0.95rem;">${t.category || "General"}</span>
                        <span style="font-size:0.78rem;color:#888;margin-left:8px;">Ticket #${t.id}</span>
                        <span style="font-size:0.78rem;color:#888;margin-left:8px;">${fmtTicketDate(t.submittedAt)}</span>
                    </div>
                    <div>
                        <span style="padding:3px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;background:${statusBg};color:${statusColor};">${t.status}</span>
                        ${closedBadge}
                    </div>
                </div>
                <div>${convHTML}</div>
            </div>`;
        }).join("");
    } catch (e) {
        container.innerHTML = '<div style="color:#e74c3c;font-size:0.9rem;"> Could not load tickets. Check connection.</div>';
    }
}

async function sendUserReply(ticketId) {
    const msgEl = document.getElementById(`reply-msg-${ticketId}`);
    const fileEl = document.getElementById(`reply-file-${ticketId}`);
    const statusEl = document.getElementById(`reply-status-${ticketId}`);
    const message = msgEl ? msgEl.value.trim() : "";
    if (!message) {
        statusEl.innerHTML = '<span style="color:#e74c3c;"> Please type a message first.</span>';
        return;
    }
    statusEl.innerHTML = '<span style="color:#aaa;"><i class="fas fa-spinner fa-spin"></i> Sending...</span>';
    const formData = new FormData();
    formData.append("message", message);
    if (fileEl && fileEl.files[0]) formData.append("file", fileEl.files[0]);
    try {
        const res = await fetch(`${API_URL}/api/support/reply/${ticketId}`, { method: "POST", body: formData });
        if (res.ok) {
            statusEl.innerHTML = '<span style="color:#27ae60;"> Reply sent!</span>';
            if (msgEl) msgEl.value = "";
            if (fileEl) fileEl.value = "";
            setTimeout(() => loadMyTickets(), 800);
        } else {
            const txt = await res.text();
            statusEl.innerHTML = `<span style="color:#e74c3c;"> ${txt || "Failed to send."}</span>`;
        }
    } catch (e) {
        statusEl.innerHTML = '<span style="color:#e74c3c;"> Connection error.</span>';
    }
}

/* ============================================================
   TOAST NOTIFICATION SYSTEM
   ============================================================ */
function showToast(message, type = 'success') {
    const existing = document.getElementById('wt-toast');
    if (existing) existing.remove();

    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        info: 'fa-circle-info',
        warning: 'fa-triangle-exclamation'
    };
    const colors = {
        success: '#22c55e',
        error: '#ef4444',
        info: '#3b82f6',
        warning: '#f59e0b'
    };

    const toast = document.createElement('div');
    toast.id = 'wt-toast';
    toast.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 99999;
        background: var(--bg-card, #1e293b);
        color: var(--text-primary, #f1f5f9);
        border-left: 4px solid ${colors[type]};
        border-radius: 10px;
        padding: 14px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: Inter, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 8px 32px rgba(0,0,0,0.35);
        max-width: 360px;
        transform: translateX(120%);
        transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1);
    `;
    toast.innerHTML = `<i class="fa-solid ${icons[type]}" style="color:${colors[type]};font-size:18px;flex-shrink:0;"></i><span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
    });

    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}