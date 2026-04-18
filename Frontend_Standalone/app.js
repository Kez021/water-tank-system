/**
 * ============================================================
 * DEPLOYMENT CONFIG — app.js
 * For LOCAL testing: keep RAILWAY_URL = "http://localhost:8080"
 * After Railway deployment: change to your Railway URL
 * ============================================================
 */
const RAILWAY_URL = "http://localhost:8080"; // <-- Change this after deploying

/**
 * APP.JS - Unified System Logic for Barangay Manggahan Water System
 * Handles: QR Generation, User Registration with Tank Linking, and Secure Login.
 */

document.addEventListener("DOMContentLoaded", async () => {
    
    // --- GLOBAL CONFIGURATION (uses RAILWAY_URL from top of file) ---
    const baseUrl = `${RAILWAY_URL}/api/tank`;
    const userApiUrl = `${RAILWAY_URL}/api/users`;

    /* ==========================================================
       1. UI UTILITIES: Password Toggle Logic
       ========================================================== */
    const setupToggle = (inputId, iconId) => {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        if (input && icon) {
            icon.addEventListener("click", () => {
                const isPass = input.type === "password";
                input.type = isPass ? "text" : "password";
                icon.classList.toggle("fa-eye");
                icon.classList.toggle("fa-eye-slash");
            });
        }
    };

    setupToggle("regPassword", "toggleRegPassword");
    setupToggle("confirmPassword", "toggleConfirmPassword");
    setupToggle("password", "togglePassword");

    /* ==========================================================
       2. QR CODE GENERATION (qr_gen.html)
       ========================================================== */
    const qrCanvas = document.getElementById("qrCanvas");
    if (qrCanvas) {
        try {
            const response = await fetch(`${baseUrl}/generate-id`); 
            if (!response.ok) throw new Error("Failed to fetch Hardware ID");

            const data = await response.json();
            const tankId = data.tank_id;

            new QRious({
                element: qrCanvas,
                size: 250,
                value: tankId,
                background: "#ffffff",
                foreground: "#000000"
            });
            console.log("QR Ready for Device ID:", tankId);
        } catch (error) {
            console.error("QR Error:", error);
        }
    }

    /* ==========================================================
       3. REGISTRATION & SCANNER LOGIC
       ========================================================== */
    const registerForm = document.getElementById("registerForm");
    const tankInput = document.getElementById("tankId");
    const scannerOverlay = document.getElementById("scannerOverlay");
    const scanStatus = document.getElementById("scan-status");

    let html5QrCode;
    if (document.getElementById("qr-reader")) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    const startRegistrationScanner = () => {
        if (scannerOverlay && html5QrCode) {
            scannerOverlay.style.display = "flex";
            html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 10, qrbox: { width: 250, height: 250 } }, 
                onScanSuccess
            ).catch(err => {
                scanStatus.innerHTML = "Camera error. Please allow permissions.";
            });
        }
    };

    function stopScanner() {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => { 
                scannerOverlay.style.display = "none"; 
            });
        } else if (scannerOverlay) {
            scannerOverlay.style.display = "none";
        }
    }

    async function onScanSuccess(decodedText) {
        let deviceId = decodedText;
        try {
            scanStatus.innerHTML = "Verifying device...";
            const checkRes = await fetch(`${baseUrl}/check/${deviceId}`);
            const checkData = await checkRes.json();

            if (checkData.registered) {
                alert("This Tank ID is already linked to another account.");
                scanStatus.innerHTML = "<span style='color:red;'>ID Already Registered</span>";
            } else {
                tankInput.value = deviceId;
                alert("Device linked successfully!");
                stopScanner();
            }
        } catch (err) {
            scanStatus.innerHTML = "Server error during verification.";
        }
    }

    // --- TRIGGER: AUTO-OPEN SCANNER ON REGISTRATION PAGE ---
    if (registerForm) {
        // Start scanner immediately upon page load if no Tank ID is present
        const params = new URLSearchParams(window.location.search);
        if (!params.get("tank_id") && !tankInput.value) {
            startRegistrationScanner();
        } else if (params.get("tank_id")) {
            tankInput.value = params.get("tank_id");
        }

        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const tankId = tankInput.value.trim();
            if (!tankId) return alert("Please scan the device QR code first.");

            try {
                const payload = {
                    fullName: document.getElementById("regName").value.trim(),
                    email: document.getElementById("regEmail").value.trim(),
                    phoneNumber: document.getElementById("regPhone").value.trim(),
                    password: document.getElementById("regPassword").value,
                    tankId: tankId 
                };

                const regRes = await fetch(`${userApiUrl}/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (regRes.ok) {
                    alert("Success: Account created!");
                    window.location.href = "login.html";
                } else {
                    alert("Registration Failed: " + await regRes.text());
                }
            } catch (err) {
                alert("Server Connection Error.");
            }
        });
    }

    /* ==========================================================
       4. LOGIN LOGIC
       ========================================================== */
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const credentials = {
                email: document.getElementById("emailInput").value.trim(),
                password: document.getElementById("password").value
            };

            try {
                const response = await fetch(`${userApiUrl}/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(credentials)
                });

                if (response.ok) {
                    const data = await response.json();
                    localStorage.clear(); 

                    // 2. Store session flags and display names.
                    localStorage.setItem("isLoggedIn", "true");
                    localStorage.setItem("clientName", data.fullName);
                    localStorage.setItem("userName", data.fullName);
                    
                    /**
                     * 3. DATA ISOLATION KEY
                     * Store the database-verified email. This serves as the unique identifier
                     * to fetch only the tanks and logs linked to this specific User ID.
                     */
                    localStorage.setItem("userEmail", data.email);
                    window.location.href = "dashboard.html";
                } else {
                    alert("Login Failed.");
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    /* ==========================================================
       5. FORGOT PASSWORD LOGIC (New Recovery Flow)
       ========================================================== */
    const sendOtpBtn = document.getElementById("sendOtpBtn");
    const verifyOtpBtn = document.getElementById("verifyOtpBtn");
    const resetPassBtn = document.getElementById("resetPassBtn");

    // ACTIVATE EYE TOGGLE: Para sa Reset Password Step
    setupToggle("newPassword", "toggleNewPassword");

    // STEP 1: Send OTP to Email
    if (sendOtpBtn) {
        sendOtpBtn.addEventListener("click", async () => {
            const email = document.getElementById("forgotEmail").value.trim();
            if (!email) return alert("Please enter your email.");

            sendOtpBtn.innerText = "Sending...";
            sendOtpBtn.disabled = true;

            try {
                const res = await fetch(`${userApiUrl}/forgot-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email })
                });

                if (res.ok) {
                    alert("OTP sent! Please check your email inbox.");
                    document.getElementById("step-email").style.display = "none";
                    document.getElementById("step-otp").style.display = "block";
                } else {
                    alert("Error: Email not found.");
                    sendOtpBtn.innerText = "Send OTP";
                    sendOtpBtn.disabled = false;
                }
            } catch (err) {
                alert("Server error. Check connection.");
                sendOtpBtn.innerText = "Send OTP";
                sendOtpBtn.disabled = false;
            }
        });
    }

    // STEP 2: Verify the OTP
    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener("click", async () => {
            const email = document.getElementById("forgotEmail").value.trim();
            const otp = document.getElementById("otpInput").value.trim();

            if (otp.length < 6) return alert("Please enter the 6-digit code.");

            try {
                const res = await fetch(`${userApiUrl}/verify-otp`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, otp })
                });

                if (res.ok) {
                    alert("OTP Verified!");
                    document.getElementById("step-otp").style.display = "none";
                    document.getElementById("step-reset").style.display = "block";
                } else {
                    alert("Invalid or Expired OTP.");
                }
            } catch (err) {
                alert("Error during verification.");
            }
        });
    }

    // STEP 3: Reset the Password
    if (resetPassBtn) {
        resetPassBtn.addEventListener("click", async () => {
            const email = document.getElementById("forgotEmail").value.trim();
            const newPassword = document.getElementById("newPassword").value;

            if (newPassword.length < 6) return alert("Password must be at least 6 characters.");

            try {
                const res = await fetch(`${userApiUrl}/reset-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, newPassword })
                });

                if (res.ok) {
                    alert("Password reset successfully! Redirecting to login...");
                    window.location.href = "login.html";
                } else {
                    alert("Failed to reset password.");
                }
            } catch (err) {
                alert("Error connecting to server.");
            }
        });
    }

    // Manual triggers for scanner buttons
    const openScannerBtn = document.getElementById("openScannerBtn");
    const closeScannerBtn = document.getElementById("closeScannerBtn");
    if (openScannerBtn) openScannerBtn.addEventListener("click", startRegistrationScanner);
    if (closeScannerBtn) closeScannerBtn.addEventListener("click", stopScanner);
});