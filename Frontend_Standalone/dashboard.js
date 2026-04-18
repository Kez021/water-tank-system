/* ============================================================
   DEPLOYMENT CONFIG — dashboard.js
   For LOCAL testing: keep RAILWAY_URL = "http://localhost:8080"
   After Railway deployment: change to your Railway URL
   ============================================================ */
const RAILWAY_URL = "http://localhost:8080"; // <-- Change this after deploying

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
            // Fetches data for the dashboard visual
            if (typeof fetchTankDetails === 'function') fetchTankDetails(activeTankId);
        });
    }

    // ANALYTICS SELECTOR (Inside Analytics View)
    const analyticsSelect = document.getElementById('tankSelect');
    if (analyticsSelect) {
        analyticsSelect.addEventListener('change', () => {
            // Trigger the analytics data refresh
            updateAnalytics();
        });
    }
    /* ==========================================================
   4. SESSION DATA SYNCHRONIZATION
   Synchronizes the UI components with the active session 
   stored in localStorage to ensure data isolation.
   ========================================================== */
const userEmail = localStorage.getItem("userEmail");
const userName = localStorage.getItem("userName") || "Administrator";
const emailField = document.getElementById('email-input');
const phoneField = document.getElementById('phone-input');

/**
 * ACCOUNT IDENTIFIER PROTECTION:
 * Configures the email field to be read-only and removes 
 * pointer events to prevent accidental modification and 
 * visual distraction (text cursor/blinking caret).
 */
if (userEmail && emailField) {
    emailField.value = userEmail;
    emailField.readOnly = true; 
    emailField.style.cursor = "default";   // Standard arrow pointer
    emailField.style.pointerEvents = "none"; // Disables click and focus
}

/**
 * CONTACT DATA ACCESSIBILITY:
 * Ensures the phone input remains interactive, allowing the 
 * user to update their SMS notification contact number.
 */
if (phoneField) {
    phoneField.style.cursor = "text";     // Displays text insertion cursor
    phoneField.style.pointerEvents = "auto"; // Enables full interaction
}

// Display authenticated user's name in the UI
const adminDisplay = document.querySelector('.admin-name');
if (adminDisplay) {
    adminDisplay.innerText = userName;
}

/**
 * DATABASE INITIALIZATION TRIGGER:
 * Verifies the session integrity. If a valid email is found, 
 * it triggers the fetch operations to populate the dashboard 
 * stats (Tank IDs) and user preferences.
 */
if (userEmail) {
    console.log("Session verified for:", userEmail);
    
    // CRITICAL: Fetches the 'Floor Tank' data and IDs (Fixes the "--" display)
    fetchInitialData(userEmail); 
    
    // Loads saved phone and notification toggles from the H2 Database
    loadSettingsData(); 
} else {
    console.warn("Security Alert: No active session found. Redirecting to login.");
}
/* ==========================================================
   5. FORM & BUTTON LISTENERS
   Event handlers for tank management and global user settings.
   ========================================================== */
const configForm = document.getElementById('tank-config-form');
if (configForm) {
    configForm.addEventListener('submit', handleFormSubmit);
}

/**
 * SETTINGS PERSISTENCE LISTENER
 * Attaches the save function to the Save button to update
 * user preferences in the backend repository.
 */
const saveSettingsBtn = document.querySelector('.action-btn-save');
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveUserSettings);
}

// 6. Password Visibility Toggle
// Improves UX by allowing users to reveal or hide password characters.
document.querySelectorAll('.password-toggle-icon').forEach(icon => {
    icon.addEventListener('click', function() {
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

// 7. Session Termination (Logout Logic)
// Ensures a clean session exit by wiping the localStorage to prevent
// account "pollution" when switching users (e.g., from Regine to Raphael).
const logoutBtn = document.getElementById('logout-btn'); 
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        // Permanently clear stored credentials and tank IDs
        localStorage.clear();
        // Redirect to the login page to finalize session end
        window.location.href = 'login.html';
    });
}

});

/* ============================================================
   ADD TANK & SCANNER LOGIC (FORM BLOCKING)
   ============================================================ */
// Function to Add a NEW Tank
window.openAddModal = function() {
    document.getElementById('tank-modal').style.display = 'flex';
    document.getElementById('scanner-section').style.display = 'block';
    document.getElementById('form-section').style.display = 'none';
    
    const form = document.getElementById('tank-config-form');
    form.reset();
    form.dataset.mode = "add"; // Set mode to ADD
    
    initializeQRScanner();
};

// Function to EDIT an existing Tank
window.openEditModal = async function(tankId) {
    try {
        const response = await fetch(`${RAILWAY_URL}/api/tank/details/${tankId}`);
        if (!response.ok) return alert("Could not fetch tank details.");
        
        const tank = await response.json();

        document.getElementById('tank-modal').style.display = 'flex';
        // Hide scanner, show form immediately for editing
        document.getElementById('scanner-section').style.display = 'none'; 
        document.getElementById('form-section').style.display = 'block';

        const form = document.getElementById('tank-config-form');
        form.dataset.mode = "edit"; // Set mode to EDIT

        // Fill form fields
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
    const mode = form.dataset.mode; // Check if adding or editing

    const payload = {
        tankId: document.getElementById('tank-hardware-id').value,
        tankName: document.getElementById('tank-name').value,
        // Fallback to "0" to prevent Java's Double.valueOf("") error
        maxCapacity: document.getElementById('tank-capacity').value || "0",
        tankHeight: document.getElementById('tank-height').value || "0",
        lowerThreshold: document.getElementById('lower-threshold').value || "0",
        upperThreshold: document.getElementById('upper-threshold').value || "0",
        isAutomatic: document.getElementById('op-mode').checked,
        email: localStorage.getItem("userEmail")
    };

    // Determine URL and Method based on mode
    const url = mode === "add" ? '/api/tank/add' : '/api/tank/update';
    const method = mode === "add" ? 'POST' : 'PUT';

    try {
        const res = await fetch(`${RAILWAY_URL}${url}`, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
       if (res.ok) {
            /* ============================================================
               LOCAL STORAGE SYNC
               This ensures the browser remembers the updated email 
               even after the page reloads.
               ============================================================ */
            const emailInput = document.getElementById('email-input');
            if (emailInput && emailInput.value) {
                localStorage.setItem("userEmail", emailInput.value);
            }

            alert(mode === "add" ? "Tank registered!" : "Settings updated!");
            
            // Reloads the page to apply the new email to all charts/analytics
            location.reload();
        } else {
            const errText = await res.text();
            alert("Error: " + errText);
        }
    } catch (err) {
        console.error("API Error:", err);
    }
}
/**
 * Closes the tank configuration modal and ensures the scanner is deactivated.
 */
window.closeModal = function() {
    const modal = document.getElementById('tank-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Stop the QR scanner if it's currently running to save resources
    stopScanner();
};
/**
 * Initializes the QR Code scanner using the Html5Qrcode library.
 * Transitions to the form view upon a successful scan.
 */
function initializeQRScanner() {
    // Ensure the Html5Qrcode library is properly imported in your HTML file
    html5QrScanner = new Html5Qrcode("interactive-scanner");
    
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 } 
    };

    html5QrScanner.start(
        { facingMode: "environment" }, // Prioritize back camera for mobile devices
        config, 
        (decodedText) => {
            console.log("Scan Success:", decodedText);
            
            // Extract Hardware ID if the QR contains a URL parameter, else use raw text
            let hardwareId = decodedText.includes("tank_id=") 
                ? decodedText.split("tank_id=")[1] 
                : decodedText;

            // Assign the scanned ID to the hidden/read-only input field
            document.getElementById('tank-hardware-id').value = hardwareId;

            // Switch UI from Scanner view to Form view
            document.getElementById('scanner-section').style.display = 'none';
            document.getElementById('form-section').style.display = 'block';

            // Stop the camera stream after successful capture
            stopScanner();
        },
        (errorMessage) => { 
            /* Scanning in progress... silent logging to avoid console clutter */ 
        }
    ).catch(err => console.error("Scanner initialization failed:", err));
}
/**
 * Fetches real-time details for a specific tank and updates the dashboard UI.
 */
async function fetchTankDetails(tankId) {
    if (!tankId || tankId === "---") return;
    try {
        const response = await fetch(`${RAILWAY_URL}/api/tank/details/${tankId}`);
        if (response.ok) {
            const tank = await response.json();
            updateDashboardUI(tank);
        }
    } catch (e) {
        console.warn("Polling offline or server unreachable");
    }
}

/**
 * Stops the QR scanner camera stream.
 */
function stopScanner() {
    if (html5QrScanner) {
        html5QrScanner.stop().then(() => {
            console.log("Scanner stopped.");
        }).catch(err => console.warn("Failed to stop scanner:", err));
    }
}

/* ============================================================
    DATA FETCHING & UI RENDERING
   ============================================================ */

async function fetchInitialData(email) {
    try {
        const response = await fetch(`${RAILWAY_URL}/api/tank/user-tanks?email=${email}`);
        const tanks = await response.json();

        if (tanks && tanks.length > 0) {
            allTanks = tanks;
            renderTankManagement(tanks);
            renderDashboardSwitcher(tanks);
            
            // Global Stats Update
            document.getElementById('tm-total-tanks').innerText = tanks.length;
            const totalCap = tanks.reduce((sum, t) => sum + (parseFloat(t.maxCapacity) || 0), 0);
            document.getElementById('tm-total-capacity').innerText = `${totalCap}L`;
            // 1. SET THE ID: Retrieve the last used ID or default to the first tank
            activeTankId = localStorage.getItem("userTankId") || tanks[0].tankId;
            const headerIdElement = document.getElementById('tm-header-tank-id');
         if (headerIdElement) {
          headerIdElement.innerText = activeTankId; 
        }
            
            // 2. INITIAL FETCH: One-time request to populate the UI immediately
            fetchTankDetails(activeTankId); 

            // 3. INTERVAL RESET: Clear any existing timers to prevent query stacking
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }

            // 4. START POLLING: Periodically fetch fresh data every 5 seconds
            pollingInterval = setInterval(() => {
                if (activeTankId && activeTankId !== "---") {
                    console.log("Polling active for tank:", activeTankId);
                    fetchTankDetails(activeTankId);
                }
            }, 5000);
            
        } else {
            displayNoTankState();
        }
    } catch (error) {
        console.error("System Initialization Error:", error);
    }
}
// Single version of Switcher (Merged the two previous ones)
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
/**
 * Updates the Dashboard UI components with real-time tank data.
 * This version is fully dynamic based on the provided HTML IDs.
 */
function updateDashboardUI(tank) {
    // 1. Update Cylinder Visual & Inner Percentage
    const cylinderText = document.getElementById('inner-percent');
    if (cylinderText) {
        cylinderText.innerText = `${tank.waterLevel.toFixed(0)}%`;
    }
    if (document.getElementById('visual-water-fill')) {
        document.getElementById('visual-water-fill').style.height = `${tank.waterLevel}%`;
    }

    // 2. Update Header & Tank Name
    if (document.getElementById('active-tank-id-label')) {
        document.getElementById('active-tank-id-label').innerText = tank.tankId || tank.id;
    }
    if (document.getElementById('card-tank-name')) {
        document.getElementById('card-tank-name').innerText = `ID: ${tank.tankId || tank.id}`;
    }

    // 3. Update Card Progress & Percent
    if (document.getElementById('card-progress-fill')) {
        document.getElementById('card-progress-fill').style.width = `${tank.waterLevel}%`;
    }
    if (document.getElementById('card-percent-stat')) {
        document.getElementById('card-percent-stat').innerText = `${tank.waterLevel.toFixed(1)}%`;
    }

    // 4. Update Volume Stats (Card and Monitor)
    const currentLiters = (tank.waterLevel / 100) * tank.maxCapacity;
    if (document.getElementById('monitor-volume')) {
        document.getElementById('monitor-volume').innerText = `${currentLiters.toFixed(1)} of ${tank.maxCapacity}L`;
    }
    if (document.getElementById('card-volume-stat')) {
        document.getElementById('card-volume-stat').innerText = `${currentLiters.toFixed(1)}L / ${tank.maxCapacity}L`;
    }

    // --- SECTION 5: REAL-TIME MONITORING TILES & PUMP STATUS ---
    const monitorPercent = document.getElementById('monitor-percent');
    const monitorBar = document.getElementById('monitor-mini-bar');

    if (monitorPercent) {
        /** * SYNCHRONIZATION: Updates the monitoring tile percentage 
         * based on the current water level data from the database.
         */
        monitorPercent.innerText = `${tank.waterLevel.toFixed(1)}%`;
    }
    
    if (monitorBar) {
        // Dynamically adjusts the width of the mini-progress bar
        monitorBar.style.width = `${tank.waterLevel}%`;
    }
    //5

    const pumpStatusBox = document.getElementById('monitor-pump-status');
    if (pumpStatusBox) {
        /**
         * DATA NORMALIZATION: Converts pump status to uppercase to ensure 
         * consistent UI rendering regardless of backend string casing (e.g., "On" vs "ON").
         */
        const currentStatus = (tank.pumpStatus || "").toUpperCase();
        pumpStatusBox.innerText = currentStatus; 
        
        // Dynamically assigns status classes for visual indicators
        pumpStatusBox.className = currentStatus === "ON" ? "status-on" : "status-off";
    }

    // 6. Update Timestamp (Syncs with Java LocalDateTime format)
    const lastUpdateDisplay = document.getElementById('monitor-timestamp');
    const rawDate = tank.lastUpdated || tank.last_updated;

    if (lastUpdateDisplay && rawDate) {
        let date;
        
        // Handle Array format (e.g., [2026, 3, 27, 18, 30])
        if (Array.isArray(rawDate)) {
            date = new Date(rawDate[0], rawDate[1]-1, rawDate[2], rawDate[3], rawDate[4], rawDate[5] || 0);
        } else {
            /**
             * Handle String format from Java Controller.
             * Removes the Pipe symbol (|) and normalizes spaces to ensure 
             * compatibility with the JavaScript Date constructor.
             */
            let sanitized = rawDate.replace("|", "").replace(/\s+/g, " ").trim();
            date = new Date(sanitized);
        }

        // Validate if the date object is valid before rendering to UI
        if (!isNaN(date.getTime())) {
            lastUpdateDisplay.innerText = date.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
        } else {
            // Log parsing error for debugging while showing a fallback on UI
            console.error("Date Parsing Failed for:", rawDate);
            lastUpdateDisplay.innerText = "Format Error";
        }
    } else if (lastUpdateDisplay) {
        // Fallback display if no timestamp data is available
        lastUpdateDisplay.innerText = "--:--:--";
    }

  // 7. Dynamic Footer Tags (Status Monitoring Logic)
    const sensorText = document.getElementById('sensor-text');
    const networkText = document.getElementById('network-text');
    const autoModeText = document.getElementById('auto-mode-text');

    // Update Auto Shut-off Status based on tank operation mode
    if (autoModeText) {
        if (tank.isAutomatic) {
            autoModeText.innerText = "Enabled Safe";
            autoModeText.style.color = "#22c55e"; // Green for Active Auto-mode
        } else {
            autoModeText.innerText = "Manual Control";
            autoModeText.style.color = "#f59e0b"; // Orange for Manual intervention
        }
    }

    // Update Sensor and Network status based on System Health
    if (tank.systemStatus === "Offline") {
        if (sensorText) {
            sensorText.innerText = "Disconnected";
            sensorText.style.color = "#ef4444"; // Red for Critical Failure
        }
        if (networkText) {
            networkText.innerText = "Offline";
            networkText.style.color = "#ef4444"; // Red for Connection Loss
        }
    } else if (tank.systemStatus === "Warning") {
        if (sensorText) {
            sensorText.innerText = "Low Level Alert";
            sensorText.style.color = "#f59e0b"; // Orange for Warning thresholds
        }
        if (networkText) {
            networkText.innerText = "Online Critical";
            networkText.style.color = "#f59e0b"; // Orange for Unstable network
        }
    } else {
        // Default Healthy State
        if (sensorText) {
            sensorText.innerText = "Connected";
            sensorText.style.color = "#22c55e"; // Green for Active Data
        }
        if (networkText) {
            networkText.innerText = "Online";
            networkText.style.color = "#22c55e"; // Green for Stable Connection
        }
    }
    // This updates the dot and status text on the Main Dashboard Card.
    const mainDot = document.getElementById('card-dot');
    const mainStatusLabel = document.getElementById('card-status-text');

    if (mainDot && mainStatusLabel) {
        // Reset to base classes first
        mainDot.className = 'dot';
        mainStatusLabel.className = 'status-text';

        // Get status from Java (Online, Offline, or Warning)
        const currentStatus = tank.systemStatus ? tank.systemStatus.toLowerCase() : 'offline';

        // Apply classes for colors (e.g., .warning, .warning-text)
        mainDot.classList.add(currentStatus);
        mainStatusLabel.classList.add(`${currentStatus}-text`);
        
        // Change the actual text displayed
        mainStatusLabel.innerText = tank.systemStatus || 'Offline';
    }

    // 8. Pump Button Control Logic (Manual Override & Safety Interlock)
    const pumpBtn = document.getElementById('pump-btn');
    const pumpBtnText = document.getElementById('pump-btn-text');
    
    if (pumpBtn) {
        /**
         * SYSTEM INTERLOCK: Disables manual interaction when Automatic Mode is active
         * to prevent user interference with the automated sensor logic.
         */
        if (tank.isAutomatic) {
            pumpBtn.disabled = true;
            if (pumpBtnText) pumpBtnText.innerText = "AUTO MODE ACTIVE";
            pumpBtn.classList.remove('pump-on'); // Resets button state to inactive
        } else {
            /**
             * MANUAL MODE: Enables user interaction and synchronizes button 
             * aesthetics with the current pump state from the database.
             */
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
    /* ==========================================================
       9. GLOBAL SUMMARY SYNCHRONIZATION
       Updates the top dashboard statistical cards (Total Volume 
       and Average Fill) based on the current tank's real-time data.
       ========================================================== */
    
    // Updated IDs to match your HTML: "tm-current-volume" and "tm-avg-fill"
    const topCurrentVolume = document.getElementById('tm-current-volume'); 
    const topAvgFill = document.getElementById('tm-avg-fill');

    if (topCurrentVolume) {
        // Calculate real-time volume: (Current Level % / 100) * Max Capacity
        const calculatedVol = (tank.waterLevel / 100) * tank.maxCapacity;
        topCurrentVolume.innerText = `${calculatedVol.toFixed(1)}L`;
    }

    if (topAvgFill) {
        // Update the global average fill level based on the active tank
        topAvgFill.innerText = `${tank.waterLevel.toFixed(1)}%`;
    }
}

/**
 * COMPONENT RENDERER: TANK MANAGEMENT VIEW
 * Dynamically generates HTML cards for registered tanks, 
 * showing real-time water levels and system connectivity.
 */
function renderTankManagement(tanks) {
    const container = document.getElementById('tm-cards-container');
    if (!container) return;
    const headerId = document.getElementById('tm-header-tank-id');
    if (headerId && activeTankId) {
        headerId.innerText = activeTankId;
    }
    
    container.innerHTML = tanks.map(t => `
        <div class="tm-card ${t.tankId === activeTankId ? 'active' : ''}" onclick="selectTank('${t.tankId}')">
            <div class="tm-card-top">
                <div class="tm-status-wrap">
                    <span class="tm-dot ${t.systemStatus ? t.systemStatus.toLowerCase() : 'offline'}"></span>
                    <span class="${t.systemStatus ? t.systemStatus.toLowerCase() : 'offline'}-text">
                        System ${t.systemStatus || 'Offline'}
                    </span>
                </div>
                <h3>${t.tankName}</h3>
                <small style="color: #64748b;">Hardware ID: ${t.tankId}</small>
            </div>

            <div class="tm-level-display">
                <div class="tm-progress-container">
                    <div class="tm-progress-fill" style="width: ${t.waterLevel}%"></div>
                </div>
                <div class="tm-percent-text">${t.waterLevel.toFixed(1)}%</div>
                <div style="font-size: 0.8rem; color: #64748b; text-align: center;">
                    Capacity: ${t.maxCapacity}L
                </div>
            </div>

            <div class="tm-mode-indicator">
                <i class="fas ${t.isAutomatic ? 'fa-robot' : 'fa-hand-pointer'} tm-mode-icon"></i> 
                ${t.isAutomatic ? 'Automatic Mode' : 'Manual Mode'}
            </div>

            <div class="tm-actions">
                <button class="tm-btn-edit" onclick="event.stopPropagation(); openEditModal('${t.tankId}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="tm-btn-delete" onclick="event.stopPropagation(); deleteTank('${t.tankId}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `).join('');
}
/**
 * DATA FETCHING: ACTIVITY LOGS
 * Retrieves the activity logs and associated tank data for the current user.
 * Maps Hardware IDs to User-Friendly Tank Names for better UI readability.
 * @param {string} emailFromNav - The email passed from the navigation trigger.
 */
async function fetchAllActivityLogs(emailFromNav) {
    try {
        const userEmail = emailFromNav || localStorage.getItem("userEmail") || "reginebagares27@gmail.com";
        
        const [logRes, tankRes] = await Promise.all([
            fetch(`${RAILWAY_URL}/api/logs/all?email=${userEmail}`),
            fetch(`${RAILWAY_URL}/api/tank/user-tanks?email=${userEmail}`)
        ]);

        const logs = await logRes.json();
        const tanks = await tankRes.json();
        const tableBody = document.getElementById('activity-log-table-body');
        
        if (!tableBody) return;

        /**
         * CHRONOLOGICAL SORTING (UI FIX)
         * We reverse the array to ensure March 28 logs appear at the top of the list.
         */
        const sortedLogs = logs.reverse();

        tableBody.innerHTML = sortedLogs.map(log => {
            const logTankId = log.tankData ? log.tankData.tankId : log.tankId;
            const tankMatch = tanks.find(t => t.tankId === logTankId);
            const displayName = logTankId || "System";
            
            // Format Timestamp for professional UI display
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

        updateActivitySummary(logs);
    } catch (error) {
        console.error("Activity Log Display Error:", error);
    }
}
/**
 * Counts logs based on status for the dashboard statistics boxes.
 * Improved: Handles leading/trailing spaces and any casing from Java.
 */
/**
 * UPDATES DASHBOARD STATISTICS BOXES
 * Categorizes logs into Success, Warning, or Critical based on their status.
 * @param {Array} logs - The list of activity logs from the database.
 */
function updateActivitySummary(logs) {
    /**
     * KEYWORD MATCHING LOGIC:
     * This helper function filters logs based on status keywords.
     */
    const getCount = (keywords) => logs.filter(l => {
        const s = (l.status || "").toString().trim().toUpperCase().replace('_', ' '); 
        return keywords.some(key => s.includes(key));
    }).length;

    const counts = {
        Success: getCount(['SUCCESS', 'UPDATED', 'SENT', 'ACTIVE', 'REGISTRATION', 'CONSUMPTION']),
        Warning: getCount(['USER OP', 'WARNING', 'RUNNING', 'TRIGGER', 'STOP', 'UPDATE']),
        Critical: getCount(['CRITICAL', 'ERROR', 'PUMP TRIGGERED', 'SAFETY SHUTOFF'])
    };

    /**
     * UI HEADER SYNCHRONIZATION:
     * Matches the <span id="log-count-display"></span> in your HTML.
     */
    const totalEventsEl = document.getElementById('log-count-display');
    if (totalEventsEl) {
        totalEventsEl.innerText = logs.length;
    }

    // Target the statistic boxes IDs from your HTML
    const successEl = document.getElementById('stat-count-success');
    const warningEl = document.getElementById('stat-count-warning');
    const criticalEl = document.getElementById('stat-count-critical');

    // Update UI elements
    if (successEl) successEl.innerText = counts.Success;
    if (warningEl) warningEl.innerText = counts.Warning;
    if (criticalEl) criticalEl.innerText = counts.Critical;

    console.log("Dashboard Statistics Updated:", counts); 
}

/* ============================================================
   PUMP CONTROL LOGIC (MANUAL MODE)
   ============================================================ */

/**
 * Handles the manual toggle request for the pump.
 * Placed here to separate manual actions from auto-polling updates.
 */
async function handleManualPumpToggle() {
    if (!activeTankId || activeTankId === "---") return alert("Please select a tank first.");

    try {
        const response = await fetch(`${RAILWAY_URL}/api/tank/toggle-pump`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tankId: activeTankId })
        });

        if (response.ok) {
            console.log("Pump Toggle Success");
            // Refresh data  status (ON/OFF)
            fetchTankDetails(activeTankId);
        } else {
            const errorMsg = await response.text();
            alert(errorMsg); 
        }
    } catch (err) {
        console.error("Toggle Error:", err);
    }
}

/* ============================================================ 
    HELPERS & SETTINGS
    Handles user profile updates and security configurations.
   ============================================================ */

/**
 * Sends updated notification preferences and security data to the backend.
 * Synchronizes the UI with the H2 Database upon success.
 */
async function saveUserSettings() {
    // 1. Retrieve the authenticated user's email from session storage
    const email = localStorage.getItem("userEmail");
    
    // 2. Capture security field values for validation
    const currentPass = document.getElementById('settings-curr-pass').value;
    const newPass = document.getElementById('settings-new-pass').value;
    const confirmPass = document.getElementById('settings-confirm-pass').value;

    // 3. Construct the JSON payload with UI input values
    const payload = {
        email: email,
        phone: document.getElementById('phone-input').value,
        emailEnabled: document.getElementById('email-notif-toggle').checked,
        smsEnabled: document.getElementById('sms-notif-toggle').checked
    };

    // 4. Password Update Validation Logic
    if (currentPass || newPass || confirmPass) {
        if (!currentPass) {
            return alert("Security Error: Current password is required to make changes.");
        }
        if (newPass !== confirmPass) {
            return alert("Validation Error: New password and confirmation do not match!");
        }
        
        // Attach security credentials to the payload for backend verification
        payload.currentPassword = currentPass;
        payload.newPassword = newPass;
    }

    try {
        /**
         * API REQUEST: POST to SettingsController
         * Sends the payload as a JSON string.
         */
        const response = await fetch(`${RAILWAY_URL}/api/settings/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Success: Settings updated in the H2 Database!");
            
            // 5. Clear sensitive password fields after a successful transaction
            document.getElementById('settings-curr-pass').value = "";
            document.getElementById('settings-new-pass').value = "";
            document.getElementById('settings-confirm-pass').value = "";

            /**
             * 6. UI SYNCHRONIZATION
             * Reloads the page to ensure the UI reflects the newly saved 
             * data from the database.
             */
            location.reload(); 
            
        } else {
            // Display server-side error messages (e.g., "Wrong Password")
            const errorText = await response.text();
            alert("Save Failed: " + errorText);
        }
    } catch (error) {
        // Handle network-related failures
        console.error("Database Connection Error:", error);
        alert("Network Error: Could not connect to the server.");
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
        const res = await fetch(`${RAILWAY_URL}/api/settings/load?email=${email}`);
        if (res.ok) {
            const data = await res.json();
            // 2. I-populate ang Phone at Toggles
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

window.deleteTank = async function(tankId) {
    if (!confirm(`Are you sure you want to delete Tank ${tankId}? This will erase all logs.`)) return;

    try {
        const res = await fetch(`${RAILWAY_URL}/api/tank/delete/${tankId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            alert("Tank deleted successfully.");
            if (activeTankId === tankId) localStorage.removeItem("userTankId");
            location.reload();
        } else {
            alert("Failed to delete tank.");
        }
    } catch (err) {
        console.error("Delete error:", err);
    }
};

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            // 1. Manage active states for navigation links
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            
            // 2. Hide all content sections initially to reset the view
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            
            // 3. Retrieve the target view ID from the clicked element's dataset
            const viewName = this.dataset.view; 
            const target = document.getElementById(viewName);
            
            if (target) {
                target.style.display = 'block';
            }

            // 4. Trigger specific logic for the Analytics view
            if (viewName === 'analytics-view') {
                loadTankNames();   // Populates dropdown with user-specific tanks
                updateAnalytics(); // Renders the charts with real-time data
            }

            /**
             * 5. TRIGGER ACTIVITY LOG SYNCHRONIZATION
             * Refreshes the log table every time the user enters the Activity Log view.
             * This ensures the latest events (e.g., March 28) are fetched from the database.
             */
            if (viewName === 'activity-log-view') {
                const userEmail = localStorage.getItem("userEmail");
                if (userEmail) {
                    fetchAllActivityLogs(userEmail); 
                } else {
                    console.error("Navigation Error: User email not found in local storage.");
                }
            }
        });
    });
}
/* ============================================================
   ACTIVITY LOG FILTERING SYSTEM
   ============================================================ */

/**
 * LIVE FILTER LOGIC
 * Filters the activity table rows in real-time based on Search Input, 
 * Tank Selection, and Status dropdowns.
 */
function filterActivityLogs() {
    const searchInput = document.getElementById('log-search-input');
    const tankFilterElem = document.getElementById('log-filter-tank');
    const statusFilterElem = document.getElementById('log-filter-status');

    if (!searchInput || !tankFilterElem || !statusFilterElem) return;

    const searchTerm = searchInput.value.toLowerCase();
    const statusFilter = statusFilterElem.value;
    const rows = document.querySelectorAll('#activity-log-table-body tr');

    // MGA COUNTERS NATIN:
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

            // GRUPUHAN BASE SA JAVA SAVE_LOG MO:
            if (['SUCCESS', 'ACTIVE', 'UPDATED', 'REGISTRATION', 'ONLINE', 'SENT'].includes(rawText)) {
                currentStatus = 'Success';
                successCount++; // Bilangin sa Success
            } 
            else if (['RUNNING', 'USER_OP', 'USER OP', 'WARNING', 'MANUAL TRIGGER', 'CONFIGURATION UPDATE'].includes(rawText)) {
                currentStatus = 'Warning';
                warningCount++; // Bilangin sa Warning
            } 
            else if (['SYSTEM_OFF', 'SYSTEM OFF', 'CRITICAL', 'ERROR', 'SAFETY SHUTOFF', 'OFFLINE'].includes(rawText)) {
                currentStatus = 'Critical';
                criticalCount++; // Bilangin sa Critical
            }
        }

        // --- MATCHING LOGIC ---
        const matchesSearch = searchTerm === "" || actionText.includes(searchTerm) || detailsText.includes(searchTerm) || currentTankID.includes(searchTerm);
        const matchesTank = (tankFilterElem.value === 'all' || currentTankID === tankFilterElem.value);
        const matchesStatus = (statusFilter === 'all' || currentStatus === statusFilter);

        row.style.display = (matchesSearch && matchesStatus && matchesTank) ? "" : "none";
    });

    // --- UPDATE THE SUMMARY BOXES SA UI (FIXED IDs) ---
    if(document.getElementById('stat-count-success')) {
        document.getElementById('stat-count-success').innerText = successCount;
    }
    if(document.getElementById('stat-count-warning')) {
        document.getElementById('stat-count-warning').innerText = warningCount;
    }
    if(document.getElementById('stat-count-critical')) {
        document.getElementById('stat-count-critical').innerText = criticalCount;
    }
}


/* ============================================================
   CHART INSTANCES (To prevent "chart already in use" error)
   ============================================================ */
let weeklyChart, distributionChart, monthlyChart;

async function updateAnalytics() {
    const tankSelect = document.getElementById('tankSelect');
    if (!tankSelect) return;

    // Kunin ang kasalukuyang piniling tank at ang email
    const tankId = tankSelect.value || "all";
    const tankName = tankSelect.options[tankSelect.selectedIndex].text; 
    const email = localStorage.getItem("userEmail");
    
    // ITO ANG PINAKA-IMPORTANTENG DAGDAG:
    const encodedEmail = encodeURIComponent(email);
    const baseUrl = `${RAILWAY_URL}/api/analytics`;
    
    // Nilagay natin ang encodedEmail sa parameters
    const params = `?tankId=${tankId}&email=${encodedEmail}`;

    const headerTitle = document.querySelector('#analytics-view .view-header h1');
    if (headerTitle) {
        headerTitle.innerText = tankId === "all" ? "System Analytics" : `Analytics: ${tankName}`;
    }

    try {
        // 1. STATS REFRESH (Consumption, Efficiency, etc.)
        const statsRes = await fetch(`${baseUrl}/stats${params}`);
        if (statsRes.ok) {
            const stats = await statsRes.json();
            document.getElementById('ana-total-cons').innerText = stats.totalConsumption;
            document.getElementById('ana-avg-usage').innerText = stats.avgDailyUsage;
            document.getElementById('ana-eff-score').innerText = stats.efficiencyScore;
            document.getElementById('ana-monthly-trend').innerText = stats.monthlyTrend;

            // Efficiency Color Logic
            const scoreValue = parseInt(stats.efficiencyScore); 
            const labelElement = document.getElementById('ana-eff-label');
            if (labelElement) {
                if (scoreValue >= 90) { labelElement.innerText = "Excellent"; labelElement.style.color = "#2ecc71"; }
                else if (scoreValue >= 70) { labelElement.innerText = "Good"; labelElement.style.color = "#f1c40f"; }
                else if (scoreValue >= 40) { labelElement.innerText = "Fair"; labelElement.style.color = "#e67e22"; }
                else { labelElement.innerText = "Poor"; labelElement.style.color = "#e74c3c"; }
            }
        }

        // 2. INSIGHTS REFRESH
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

        // 3. DISTRIBUTION CHART (Doughnut)
        const distRes = await fetch(`${baseUrl}/distribution?email=${encodedEmail}`);
        if (distRes.ok) {
            const data = await distRes.json();
            renderDoughnutChart(data);
        }

        // 4. USAGE TRENDS (Weekly and Monthly Charts)
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
   /* ============================================================
       DYNAMIC DATA MAPPING
       Extracts live data from the database logs to populate charts.
       If no data is found, it falls back to empty values.
       ============================================================ */
    
    // 1. Weekly Data Mapping
    const labels = (weeklyLogs && weeklyLogs.labels) ? weeklyLogs.labels : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const consumptionData = (weeklyLogs && weeklyLogs.consumptionData) ? weeklyLogs.consumptionData : [0,0,0,0,0,0,0];
    const refillData = (weeklyLogs && weeklyLogs.refillData) ? weeklyLogs.refillData : [0,0,0,0,0,0,0];

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
  
   
    // 2. Monthly Data Mapping (Para sa 6-Month Trend)
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
/**
 * RENDERS THE WATER DISTRIBUTION DOUGHNUT CHART
 * Forces Gray for empty space and Blue for water to avoid confusing green circles.
 */
function renderDoughnutChart(distData) {
    const canvas = document.getElementById('tankDistributionChart');
    if (!canvas) return;

    if (distributionChart) distributionChart.destroy();

    const labels = Object.keys(distData);
    const values = Object.values(distData);

    // FIX: Instead of a random color palette, we explicitly define:
    // 1st Color: Blue (Water)
    // 2nd Color: Light Gray (Empty Space/Background)
    const customColors = ['#3b82f6', '#e2e8f0', '#a855f7', '#f59e0b', '#ef4444'];

    distributionChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                // Ito ang taga-patay ng Green: Ginawa nating pangalawa ang Gray
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
                        label: function(context) {
                            // Automatically adds % to whatever value is hovered
                            return ` ${context.label}: ${context.raw}%`;
                        }
                    }
                }
            }
        }
    });
}
/**
 * FETCH TANK NAMES FROM DATABASE AND POPULATE ANALYTICS DROPDOWN
 * This function retrieves all tanks associated with the user's email 
 * and adds their specific names to the "Viewing Analytics for:" selector.
 */
async function loadTankNames() {
    const email = localStorage.getItem("userEmail");
    const select = document.getElementById('tankSelect');
    
    // Safety check: exit if the dropdown element is not found
    if (!select) return;

    try {
        // Updated URL to /api/tank/user-tanks to match your working dashboard endpoint (prevents 403)
        const encodedEmail = encodeURIComponent(email); 
        const response = await fetch(`${RAILWAY_URL}/api/tank/user-tanks?email=${encodedEmail}`);
        
        if (response.ok) {
            const tanks = await response.json();
            
            // Clear existing options but retain the "Overall" summary choice
            select.innerHTML = '<option value="all">Overall All Tanks</option>';
            
            // Iterate through the tank list and create a dropdown option for each Tank Name
            tanks.forEach(tank => {
                const option = document.createElement('option');
                // Use tankId for the value and tankName for the visible label
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

/**
 * LIVE DASHBOARD CLOCK (Header Component)
 * This function synchronizes the UI with the client's system time.
 * It provides a real-time visual indicator that the dashboard is active.
 * * @format: "Mar 26, 26 | 11:55:01 PM"
 */
function startLiveClock() {
    // Target the specific header element next to the user profile
    const clockElement = document.getElementById('current-pc-time'); 
    
    if (!clockElement) {
        console.warn("Live Clock: Target element 'current-pc-time' not found in DOM.");
        return;
    }

    // Initialize a 1-second interval to update the clock display
    setInterval(() => {
        const now = new Date();
        
        // Configuration for localized date and time formatting
        const options = { 
            month: 'short', 
            day: '2-digit', 
            year: '2-digit',
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: true 
        };

        // Convert date object to string and format for UI consistency
        const formattedDate = now.toLocaleString('en-US', options).replace(',', ' |');
        clockElement.innerText = formattedDate;
        
    }, 1000); // 1000ms Refresh Rate
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
   NEED HELP? — SUPPORT TICKET SUBMISSION (NEW FEATURE)
   Called from the "Need Help?" sidebar section
   ============================================================ */
async function submitHelpTicket() {
    const email = localStorage.getItem("userEmail");
    if (!email) { alert("Please log in first."); return; }

    const message = document.getElementById("help-message")?.value?.trim();
    const category = document.getElementById("help-category")?.value;
    const fileInput = document.getElementById("help-attachment");
    const statusDiv = document.getElementById("help-submit-status");
    const submitBtn = document.getElementById("help-submit-btn");

    if (!message) {
        statusDiv.innerHTML = '<p style="color:#e74c3c;margin-top:10px;">⚠️ Please describe your concern first.</p>';
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
        const res = await fetch(`${RAILWAY_URL}/api/support/submit`, { method: "POST", body: formData });
        if (res.ok) {
            const data = await res.json();
            statusDiv.innerHTML = `<p style="color:#27ae60;margin-top:10px;padding:12px;background:rgba(39,174,96,0.1);border-radius:8px;border:1px solid rgba(39,174,96,0.3);">
                ✅ ${data.message}</p>`;
            document.getElementById("help-message").value = "";
            if (fileInput) fileInput.value = "";
        } else {
            statusDiv.innerHTML = '<p style="color:#e74c3c;margin-top:10px;">❌ Failed to submit. Try again.</p>';
        }
    } catch (err) {
        statusDiv.innerHTML = '<p style="color:#e74c3c;margin-top:10px;">❌ Cannot connect to server. Is IntelliJ running?</p>';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Concern';
    }
}
