/**
 * APP.JS - Unified System Logic for Barangay Manggahan Water System
 * Handles: QR Generation, User Registration with Tank Linking, and Secure Login.
 *
 * NOTE: All native browser alert() popups have been replaced with a styled
 * in-page notification system (see notify.js / notify.css). Make sure both
 * are included in any HTML page that loads this script.
 */
const API_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:8080"
    : "https://water-tank-backend-4sje.onrender.com";

// Safe fallback if notify.js failed to load
const _notify = (msg, type) => (window.notify ? window.notify(msg, type) : console.log("[" + (type || 'info') + "]", msg));

document.addEventListener("DOMContentLoaded", async () => {

    const baseUrl = `${API_URL}/api/tank`;
    const userApiUrl = `${API_URL}/api/users`;

    /* ============ Password Toggle ============ */
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

    /* ============ QR CODE GENERATION ============ */
    // One-shot generation only — no auto-refresh / polling.
    const qrCanvas = document.getElementById("qrCanvas");
    if (qrCanvas && !qrCanvas.dataset.generated) {
        qrCanvas.dataset.generated = "1";
        try {
            const response = await fetch(`${baseUrl}/generate-id`);
            if (!response.ok) throw new Error("Failed to fetch Hardware ID");
            const data = await response.json();
            const tankId = data.tank_id;
            new QRious({
                element: qrCanvas, size: 250, value: tankId,
                background: "#ffffff", foreground: "#000000"
            });
            console.log("QR Ready for Device ID:", tankId);
        } catch (error) {
            console.error("QR Error:", error);
            _notify("Could not generate QR code. Please retry.", "error");
        }
    }

    /* ============ REGISTRATION & SCANNER ============ */
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
            if (scanStatus) scanStatus.innerHTML = '<i class="fas fa-camera"></i> Waiting for camera...';
            html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                onScanSuccess
            ).catch(() => {
                if (scanStatus) scanStatus.innerHTML = "Camera error. Please allow permissions.";
                _notify("Camera access denied or unavailable.", "error");
            });
        }
    };

    function stopScanner() {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => { scannerOverlay.style.display = "none"; }).catch(() => { });
        } else if (scannerOverlay) {
            scannerOverlay.style.display = "none";
        }
    }

    async function onScanSuccess(decodedText) {
        const deviceId = decodedText;
        try {
            if (scanStatus) scanStatus.innerHTML = "Verifying device...";
            const checkRes = await fetch(`${baseUrl}/check/${deviceId}`);
            const checkData = await checkRes.json();
            if (checkData.registered) {
                _notify("This Tank ID is already linked to another account.", "error");
                if (scanStatus) scanStatus.innerHTML = "<span style='color:#dc2626;font-weight:600;'>ID Already Registered</span>";
            } else {
                tankInput.value = deviceId;
                _notify("Device linked successfully!", "success");
                stopScanner();
            }
        } catch (err) {
            if (scanStatus) scanStatus.innerHTML = "Server error during verification.";
            _notify("Server error during verification.", "error");
        }
    }

    if (registerForm) {
        // Pre-fill tank id from URL if provided. NO auto scanner open.
        const params = new URLSearchParams(window.location.search);
        if (params.get("tank_id") && tankInput) tankInput.value = params.get("tank_id");

        let submitting = false;
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (submitting) return; // guard against double submit
            const tankId = tankInput ? tankInput.value.trim() : "";

            const password = document.getElementById("regPassword").value;
            const confirmPassword = document.getElementById("confirmPassword").value;

            if (password !== confirmPassword) {
                _notify("Passwords do not match.", "error");
                document.getElementById("confirmPassword").focus();
                return;
            }
            if (password.length < 6) {
                _notify("Password must be at least 6 characters.", "warn");
                document.getElementById("regPassword").focus();
                return;
            }

            submitting = true;
            const submitBtn = registerForm.querySelector("button[type=submit]");
            const originalText = submitBtn ? submitBtn.innerHTML : "";
            if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = "Creating account..."; }

            try {
                const payload = {
                    fullName: document.getElementById("regName").value.trim(),
                    email: document.getElementById("regEmail").value.trim().toLowerCase(),
                    phoneNumber: document.getElementById("regPhone").value.trim(),
                    password: password,
                    confirmPassword: confirmPassword,
                    tankId: tankId
                };

                const regRes = await fetch(`${userApiUrl}/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (regRes.ok) {
                    // Silent redirect — no banner text.
                    window.location.replace("login.html");
                    return;
                }

                let errText = "";
                try { errText = await regRes.text(); } catch (_) { }
                // Friendly mapping
                const lower = (errText || "").toLowerCase();
                if (regRes.status === 409 || lower.includes("already")) {
                    _notify("That email is already registered. Try logging in instead.", "error");
                } else {
                    _notify(errText || "Registration failed. Please try again.", "error");
                }
            } catch (err) {
                _notify("Server connection error. Please try again.", "error");
            } finally {
                submitting = false;
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; }
            }
        });
    }

    /* ============ LOGIN ============ */
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        let loggingIn = false;
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (loggingIn) return;
            loggingIn = true;
            const submitBtn = loginForm.querySelector("button[type=submit]");
            const original = submitBtn ? submitBtn.innerHTML : "";
            if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = "Signing in..."; }

            const credentials = {
                email: document.getElementById("emailInput").value.trim().toLowerCase(),
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
                    localStorage.setItem("isLoggedIn", "true");
                    localStorage.setItem("clientName", data.fullName);
                    localStorage.setItem("userName", data.fullName);
                    localStorage.setItem("userEmail", data.email);
                    window.location.href = "dashboard.html";
                    return;
                }
                if (response.status === 429) {
                    let mins = 15, msg = "";
                    try {
                        const data = await response.json();
                        if (data && data.minutesLeft) mins = data.minutesLeft;
                        msg = data.message || "";
                    } catch (_) { }
                    _notify(msg || `Too many failed attempts. Try again in ${mins} minutes.`, "warn");
                } else {
                    _notify("Login failed. Please check your email and password.", "error");
                }
            } catch (err) {
                console.error(err);
                _notify("Could not reach the server. Check your connection.", "error");
            } finally {
                loggingIn = false;
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = original; }
            }
        });
    }

    /* ============ FORGOT PASSWORD ============ */
    const sendOtpBtn = document.getElementById("sendOtpBtn");
    const verifyOtpBtn = document.getElementById("verifyOtpBtn");
    const resetPassBtn = document.getElementById("resetPassBtn");
    setupToggle("newPassword", "toggleNewPassword");

    if (sendOtpBtn) {
        sendOtpBtn.addEventListener("click", async () => {
            const email = document.getElementById("forgotEmail").value.trim();
            if (!email) return _notify("Please enter your email.", "warn");
            sendOtpBtn.innerText = "Sending...";
            sendOtpBtn.disabled = true;
            try {
                const res = await fetch(`${userApiUrl}/forgot-password`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email })
                });
                if (res.ok) {
                    _notify("OTP sent! Please check your email inbox.", "success");
                    document.getElementById("step-email").style.display = "none";
                    document.getElementById("step-otp").style.display = "block";
                } else {
                    _notify("Email not found.", "error");
                }
            } catch (err) {
                _notify("Server error. Check your connection.", "error");
            } finally {
                sendOtpBtn.innerText = "Send OTP";
                sendOtpBtn.disabled = false;
            }
        });
    }

    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener("click", async () => {
            const email = document.getElementById("forgotEmail").value.trim();
            const otp = document.getElementById("otpInput").value.trim();
            if (otp.length < 6) return _notify("Please enter the 6-digit code.", "warn");
            try {
                const res = await fetch(`${userApiUrl}/verify-otp`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, otp })
                });
                if (res.ok) {
                    _notify("OTP verified!", "success");
                    document.getElementById("step-otp").style.display = "none";
                    document.getElementById("step-reset").style.display = "block";
                } else {
                    _notify("Invalid or expired OTP.", "error");
                }
            } catch (err) {
                _notify("Error during verification.", "error");
            }
        });
    }

    if (resetPassBtn) {
        resetPassBtn.addEventListener("click", async () => {
            const email = document.getElementById("forgotEmail").value.trim();
            const newPassword = document.getElementById("newPassword").value;
            if (newPassword.length < 6) return _notify("Password must be at least 6 characters.", "warn");
            try {
                const res = await fetch(`${userApiUrl}/reset-password`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, newPassword })
                });
                if (res.ok) {
                    _notify("Password reset successfully.", "success");
                    setTimeout(() => { window.location.href = "login.html"; }, 800);
                } else {
                    _notify("Failed to reset password.", "error");
                }
            } catch (err) {
                _notify("Error connecting to server.", "error");
            }
        });
    }

    // Manual scanner triggers
    const openScannerBtn = document.getElementById("openScannerBtn");
    const closeScannerBtn = document.getElementById("closeScannerBtn");
    if (openScannerBtn) openScannerBtn.addEventListener("click", startRegistrationScanner);
    if (closeScannerBtn) closeScannerBtn.addEventListener("click", stopScanner);
});