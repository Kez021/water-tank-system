
document.addEventListener('DOMContentLoaded', () => {
    // Initialize navigation at tank selection
    initNavigation();
    initTankSelection();

    // Clock
    updateDateTime();
    setInterval(updateDateTime, 1000);
});

/* =========================
   1️⃣ SECTION NAVIGATION
========================= */
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-view');
            if (!targetId) return;

            // Hide all sections
            document.querySelectorAll('.content-section').forEach(sec => sec.style.display = 'none');

            // Show selected
            const activeSection = document.getElementById(targetId);
            if (activeSection) activeSection.style.display = 'block';

            // Sidebar active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Optional: analytics loader
            if (targetId === 'analytics-view' && typeof loadFigmaAnalytics === 'function') {
                loadFigmaAnalytics();
            }
        });
    });
}

/**
 * 2️⃣ TANK SELECTION
 * Handles clicks on tank cards and updates the monitor panel
 */
function initTankSelection() {
    const tankCards = document.querySelectorAll('.tank-card');

    tankCards.forEach(card => {
        card.addEventListener('click', () => {
            // Extract tank type (card-main -> main)
            const tankType = card.id.replace('card-', '');

            // Highlight selected card
            tankCards.forEach(c => c.style.borderColor = "#e2e8f0");
            card.style.borderColor = "#3b82f6";

            // Update monitor panel with tank info
            updateMonitorUI(tankType);
        });
    });
}

/**
 * 3. DYNAMIC UI UPDATER
 * Updates the monitoring panel based on the HTML classes provided.
 */
function updateMonitorUI(tankType) {
    
    const tankData = {
        main: {
            name: "Main Tank A",
            volume: "700",
            max: "1000",
            percent: "70%",
            pump: "OFF"
        },
        secondary: {
            name: "Secondary Tank",
            volume: "50",
            max: "1000",
            percent: "5%",
            pump: "ON"
        },
        backup: {
            name: "Backup Tank",
            volume: "0",
            max: "500",
            percent: "0%",
            pump: "OFF"
        }
    };

    const selected = tankData[tankType];

    if (selected) {
        // 1. VOLUME UPDATE (Targeting .large-value)
        const volumeDisplay = document.querySelector('.large-value');
        if (volumeDisplay) {
            volumeDisplay.innerText = `${selected.volume} of ${selected.max}L capacity`;
        }

        // 2. CAPACITY % UPDATE (Targeting .stat-value)
        const percentDisplay = document.querySelector('.stat-value');
        if (percentDisplay) {
            percentDisplay.innerText = selected.percent;
        }

        // 3. PUMP STATUS (Targeting .status-off)
        const pumpStatus = document.querySelector('.status-off');
        if (pumpStatus) {
            pumpStatus.innerText = selected.pump;
            pumpStatus.style.color = (selected.pump === "ON") ? "#22c55e" : "#ef4444";
        }

        // 4. VISUAL TANK UPDATES
        const visualWater = document.querySelector('.water-level-fill');
        const innerPercent = document.getElementById('inner-percent');
        const miniBar = document.querySelector('.progress-mini-bar div');

        if (visualWater) visualWater.style.height = selected.percent;
        if (innerPercent) innerPercent.innerText = selected.percent;
        if (miniBar) miniBar.style.width = selected.percent;

        // 5. FOOTER TAG LOGIC (Auto Shut-off - 1st Tag)
        const shutoffTag = document.querySelectorAll('.footer-tag')[0];
        const percentValue = parseInt(selected.percent);

        if (shutoffTag) {
            if (percentValue >= 95) {
                shutoffTag.style.borderColor = "#22c55e";
                shutoffTag.style.color = "#15803d";
                shutoffTag.innerHTML = `<i class="fa-solid fa-bell"></i> Auto Shut-off: ACTIVE`;
            } else {
                shutoffTag.style.borderColor = "#cbd5e1";
                shutoffTag.style.color = "#64748b";
                shutoffTag.innerHTML = `<i class="fa-solid fa-bell-slash"></i> Auto Shut-off: Monitoring...`;
            }
        }
    }
} 

/**
 * 5. UTILITY: REAL-TIME CLOCK
 * Updates the timestamp class
 */
function updateDateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString();

    const timestampEl = document.querySelector('.timestamp');
    if (timestampEl) {
        timestampEl.innerText = `${timeStr} ${dateStr}`;
    }
}
const sheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwukaeDgfe5-QNbBJlJhm26ygOXYt-kk7LSq7g728VZXeZskGjPch1DpIP8x89xqvgEwoDJx9Vib19/pub?output=csv';

let tankDataStore = {};
let weeklyChart, distChart, trendChart;

async function loadAnalyticsData() {
    try {
        const response = await fetch(sheetURL);
        const csvText = await response.text();
        
        // Pinapagana nito ang pagbasa kahit may commas sa loob ng cells
        const rows = csvText.split('\n').slice(1); 

        rows.forEach(row => {
            // REGEX: Ito ang humahawak sa mga columns na may quotes/commas
            const cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            
            if (cols && cols.length >= 20) {
                const name = cols[0].replace(/"/g, '').trim(); 
                
                tankDataStore[name] = {
                    total: cols[1].replace(/"/g, ''),
                    avg: cols[2].replace(/"/g, ''),
                    trend: (parseFloat(cols[3]) * 100).toFixed(1) + "%",
                    eff: cols[4].replace(/"/g, ''),
                    weeklyCons: cols.slice(5, 12).map(v => Number(v.replace(/"/g, ''))),
                    monthlyTrend: cols.slice(12, 18).map(v => Number(v.replace(/"/g, ''))),
                    insight1: cols[18].replace(/"/g, ''), // Column S
                    insight2: cols[19].replace(/"/g, ''), // Column T
                    color: cols[20] ? cols[20].replace(/"/g, '').trim() : '#3b82f6'
                };
            }
        });

        console.log("Data Store Ready:", tankDataStore); // Tingnan mo ito sa F12 Console
        updateUI(document.getElementById('tankSelect').value);

    } catch (err) {
        console.error("Data fetch failed:", err);
    }
}

function updateUI(tankName) {
    const data = tankDataStore[tankName];
    if (!data) return;

    // 1. Cards
    document.getElementById('ana-total-cons').innerText = data.total + " L";
    document.getElementById('ana-avg-usage').innerText = data.avg + " L";
    document.getElementById('ana-monthly-trend').innerText = data.trend;
    document.getElementById('ana-eff-score').innerText = data.eff + "%";

    // 2. Insights (Bullet Points)
    const insightList = document.querySelector('.usage-insights-list');
    if (insightList) {
        insightList.innerHTML = `
            <li>${data.insight1}</li>
            <li>${data.insight2}</li>
        `;
    }

    // 3. Update Charts
    renderCharts(tankName, data);
}

function renderCharts(name, data) {
    // --- Weekly Bar Chart ---
    const weeklyCtx = document.getElementById('weeklyUsageChart').getContext('2d');
    if (weeklyChart) weeklyChart.destroy();
    weeklyChart = new Chart(weeklyCtx, {
        type: 'bar',
        data: {
            labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
            datasets: [
                { label: 'Consumption', data: data.weeklyCons, backgroundColor: '#3b82f6', borderRadius: 4 },
                { label: 'Refill', data: data.weeklyRefill, backgroundColor: '#10b981', borderRadius: 4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // --- Doughnut Chart (The "One Color" Figma Style) ---
    const distCtx = document.getElementById('tankDistributionChart').getContext('2d');
    if (distChart) distChart.destroy();
    
    let chartData, colors;
    if (name.includes("Overall")) {
        chartData = [50, 30, 20]; // Estimate distribution for overall
        colors = ['#3b82f6', '#10b981', '#fbbf24'];
    } else {
        const score = parseInt(data.eff);
        chartData = [score, 100 - score];
        colors = [data.color, '#e2e8f0']; // Single color + gray empty space
    }

    distChart = new Chart(distCtx, {
        type: 'doughnut',
        data: {
            datasets: [{ data: chartData, backgroundColor: colors, borderWidth: 0 }]
        },
        options: { cutout: '80%', responsive: true }
    });

    // --- 6-Month Trend Line Chart ---
    const trendCtx = document.getElementById('monthlyTrendChart').getContext('2d');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: ['Jan','Feb','Mar','Apr','May','Jun'],
            datasets: [{
                label: 'Usage Trend',
                data: data.monthlyTrend,
                borderColor: '#3b82f6',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// Dropdown Event Listener
document.getElementById('tankSelect').addEventListener('change', (e) => {
    updateUI(e.target.value);
});

// Start
document.addEventListener('DOMContentLoaded', loadAnalyticsData);

// ====================== ACTIVITY LOG ======================

let activityLogs = [
    { id: 1, type: 'success', message: 'User Danny Bagares logged in successfully', time: '2026-01-26 08:30 AM', icon: 'fa-check-circle' },
    { id: 2, type: 'info', message: 'Tank A water level updated to 85%', time: '2026-01-26 08:45 AM', icon: 'fa-info-circle' },
    { id: 3, type: 'warning', message: 'Low water level detected in Tank B', time: '2026-01-26 09:00 AM', icon: 'fa-exclamation-triangle' },
    { id: 4, type: 'error', message: 'Sensor connection lost in Tank 1', time: '2026-01-26 09:15 AM', icon: 'fa-times-circle' }
];

// Render Activity Logs
function renderActivityLogs(logsToRender = activityLogs) {
    const logListContainer = document.getElementById('log-list-container');
    const eventCount = document.getElementById('event-count');

    // Update event count
    if (eventCount) eventCount.innerText = `${logsToRender.length} events logged`;

    // Clear container
    if (!logListContainer) return;
    logListContainer.innerHTML = '';

    // Handle empty state
    if (logsToRender.length === 0) {
        logListContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">No activities found.</p>';
        updateActivitySummary(logsToRender);
        return;
    }

    // Generate log items
    logListContainer.innerHTML = logsToRender.map(log => `
        <div class="log-item ${log.type}">
            <i class="fas ${log.icon}" style="font-size: 1.2rem;"></i>
            <div class="log-details">
                <div style="font-weight: 600; color: #333;">${log.message}</div>
                <div style="font-size: 12px; color: #888;">${log.time}</div>
            </div>
        </div>
    `).join('');

    updateActivitySummary(logsToRender);
}

// Update Summary Counts
function updateActivitySummary(logs = activityLogs) {
    const infoCount = logs.filter(log => log.type === 'info').length;
    const successCount = logs.filter(log => log.type === 'success').length;
    const warningCount = logs.filter(log => log.type === 'warning').length;
    const errorCount = logs.filter(log => log.type === 'error').length;

    const mapping = {
        'count-info': infoCount,
        'count-success': successCount,
        'count-warning': warningCount,
        'count-error': errorCount
    };

    for (const id in mapping) {
        const el = document.getElementById(id);
        if (el) el.innerText = mapping[id];
    }
}

// Search and Filter Logic
function initActivityLogFilters() {
    const searchInput = document.getElementById('logSearch');
    const typeFilter = document.getElementById('filterType');

    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const term = e.target.value.toLowerCase();
            const filtered = activityLogs.filter(log =>
                log.message.toLowerCase().includes(term)
            );
            renderActivityLogs(filtered);
        });
    }

    if (typeFilter) {
        typeFilter.addEventListener('change', function(e) {
            const type = e.target.value;
            const filtered = type === 'all' ? activityLogs : activityLogs.filter(log => log.type === type);
            renderActivityLogs(filtered);
        });
    }
}

// Initialize Activity Log on page load
document.addEventListener('DOMContentLoaded', () => {
    renderActivityLogs();
    initActivityLogFilters();
});





//user management==============

let userAccountList = []; 
let editUserId = null; 

const addBtn = document.getElementById('btn-add-user');
const userModal = document.getElementById('userModal');
const addUserForm = document.getElementById('addUserForm');

// Open Modal for NEW User
if (addBtn) {
    addBtn.addEventListener('click', () => {
        editUserId = null; // Reset edit ID
        document.querySelector('.modal-header h2').innerText = "Add New User";
        addUserForm.reset();
        userModal.style.display = 'flex'; 
    });
}

function closeUserModal() {
    userModal.style.display = 'none'; 
}

// Function to start EDITING a user
function editUserAccount(id) {
    const user = userAccountList.find(u => u.id === id);
    if (!user) return;

    editUserId = id; 
    
    // Fill up the form with existing data
    document.querySelector('.modal-header h2').innerText = "Edit User Details";
    document.getElementById('newUserName').value = user.name;
    document.getElementById('newUserEmail').value = user.email;
    document.getElementById('newUserContact').value = user.contact;
    document.getElementById('newUserRole').value = user.role;
    document.getElementById('newUserTank').value = user.tank;

    userModal.style.display = 'flex';
}


function renderUserManagement() {
    const tableBody = document.getElementById('user-list-body');
    const totalUsersCount = document.getElementById('stat-total-users');
    const adminCount = document.getElementById('stat-admin-count');
    const clientCount = document.getElementById('stat-client-count');
    
    
    if (totalUsersCount) totalUsersCount.innerText = userAccountList.length;

    if (adminCount) {
        const totalAdmins = userAccountList.filter(user => user.role === 'Admin').length;
        adminCount.innerText = totalAdmins;
    }

    if (clientCount) {
        const totalClients = userAccountList.filter(user => user.role === 'Client').length;
        clientCount.innerText = totalClients;
    }

    
    if (userAccountList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:#888;">No current user data available</td></tr>`;
        return;
    }

    tableBody.innerHTML = userAccountList.map(user => `
        <tr>
            <td>
                <div style="font-weight: 600;">${user.name}</div>
                <div style="font-size: 11px; color: #888;">${user.email}</div>
            </td>
            <td>${user.contact}</td> 
            <td><span class="role-badge ${user.role.toLowerCase()}">${user.role}</span></td>
            <td>${user.tank}</td>
            <td><span class="status-badge">Active</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-edit" title="Edit" onclick="editUserAccount(${user.id})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-delete" title="Delete" onclick="deleteUserAccount(${user.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Updated Form Submission Logic
if (addUserForm) {
    addUserForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const userData = {
            name: document.getElementById('newUserName').value,
            email: document.getElementById('newUserEmail').value,
            contact: document.getElementById('newUserContact').value,
            role: document.getElementById('newUserRole').value,
            tank: document.getElementById('newUserTank').value || "All Tank"
        };

        if (editUserId) {
            
            const index = userAccountList.findIndex(u => u.id === editUserId);
            userAccountList[index] = { ...userAccountList[index], ...userData };
            alert("User updated successfully!");
        } else {
            
            const newUser = { id: Date.now(), ...userData };
            userAccountList.push(newUser);
            alert("New user added!");
        }

        renderUserManagement();
        closeUserModal();
        this.reset();
    });
}

function deleteUserAccount(id) {
    if(confirm("Are you sure you want to delete this user?")) {
        userAccountList = userAccountList.filter(u => u.id !== id);
        renderUserManagement();
    }
}

// ============ Tank Management ===================

//===============settings================
document.addEventListener('DOMContentLoaded', function() {
    const sliders = [
        { input: 'high-range', label: 'high-val-label' },
        { input: 'low-range', label: 'low-val-label' }
    ];

    function updateSliderAppearance(inputEl) {
        const val = inputEl.value;
       
        inputEl.style.background = `linear-gradient(to right, #04E93DC4 ${val}%, #e0e0e0 ${val}%)`;
    }

    sliders.forEach(s => {
        const sliderInput = document.getElementById(s.input);
        const label = document.getElementById(s.label);

        if (sliderInput) {
            // Initial appearance
            updateSliderAppearance(sliderInput);

            // slider
            sliderInput.addEventListener('input', function() {
                label.innerText = this.value + "%";
                updateSliderAppearance(this);
            });
        }
    });

    // Save Settings Event
    document.getElementById('save-settings-btn').addEventListener('click', function() {
        const payload = {
            email: document.getElementById('email-input').value,
            sms: document.getElementById('phone-input').value,
            highThreshold: document.getElementById('high-range').value,
            lowThreshold: document.getElementById('low-range').value
        };
        console.log("Ready for Backend:", payload);
        alert("Settings Saved!");
    });
});






//====== this islogout part======
document.addEventListener("DOMContentLoaded", () => {
    const logoutBtn = document.querySelector(".logout-btn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault(); 

            const confirmLogout = confirm("Are you sure you want to logout?");
            if (confirmLogout) {
                // Redirect sa login page
                window.location.href = "analytic.html";

                // Optional: Clear active session
                localStorage.removeItem("activeUserRole");
            }
        });
    }
});
