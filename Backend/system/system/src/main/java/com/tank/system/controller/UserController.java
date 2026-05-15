package com.tank.system.controller;

import com.tank.system.model.User;
import com.tank.system.model.TankData;
import com.tank.system.model.Settings;

import com.tank.system.repository.UserRepository;
import com.tank.system.repository.TankManagementRepository;
import com.tank.system.repository.SettingsRepository;

import com.tank.system.service.NotificationService;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.HashMap;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * USER CONTROLLER — Registration, Login, OTP Password Reset
 */
@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {

    @Autowired private UserRepository userRepository;
    @Autowired private TankManagementRepository tankRepository;
    @Autowired private BCryptPasswordEncoder passwordEncoder;
    @Autowired private NotificationService notificationService;
    @Autowired private SettingsRepository settingsRepository;

    /* ══════════════════════════════════════════════════════
       LOGIN RATE LIMITING — Per-Account Brute Force Protection
       Rule: 5 failed attempts within 5 minutes → account locked.
       Lockout email sent once to the registered address on trigger.
       Successful login resets the counter for that account.
       ══════════════════════════════════════════════════════ */
    private static final int    LOGIN_MAX_ATTEMPTS = 5;
    private static final long   LOGIN_WINDOW_MS    = 5 * 60 * 1000L; // 5 minutes

    private static class LoginBucket {
        int  attempts    = 0;
        long windowStart = System.currentTimeMillis();
        boolean notified = false; // send lockout email only once per window
    }
    private final Map<String, LoginBucket> loginBuckets = new ConcurrentHashMap<>();

    /** Returns true if the attempt is allowed; false if the account is locked. */
    private synchronized boolean tryConsumeLogin(String email) {
        long now = System.currentTimeMillis();
        LoginBucket b = loginBuckets.computeIfAbsent(email, k -> new LoginBucket());
        if (now - b.windowStart > LOGIN_WINDOW_MS) {
            // Window expired — fresh start
            b.attempts    = 0;
            b.windowStart = now;
            b.notified    = false;
        }
        if (b.attempts >= LOGIN_MAX_ATTEMPTS) return false;
        b.attempts++;
        return true;
    }

    /** True only when this attempt is exactly the one that triggered the lockout. */
    private synchronized boolean isJustLocked(String email) {
        LoginBucket b = loginBuckets.get(email);
        return b != null && b.attempts >= LOGIN_MAX_ATTEMPTS && !b.notified;
    }

    private synchronized void markNotified(String email) {
        LoginBucket b = loginBuckets.get(email);
        if (b != null) b.notified = true;
    }

    private synchronized long minutesLeftLogin(String email) {
        LoginBucket b = loginBuckets.get(email);
        if (b == null) return 0;
        long left = LOGIN_WINDOW_MS - (System.currentTimeMillis() - b.windowStart);
        return Math.max(1, left / 60000L);
    }

    private synchronized void resetLoginBucket(String email) {
        loginBuckets.remove(email);
    }

    /** Extracts the real client IP, respecting reverse-proxy headers. */
    private String clientIp(HttpServletRequest req) {
        String forwarded = req.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isEmpty()) return forwarded.split(",")[0].trim();
        return req.getRemoteAddr();
    }

    /* ══════════════════════════════════════════════════════
       1. REGISTER
       ══════════════════════════════════════════════════════ */
    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@RequestBody Map<String, Object> payload) {

        String email           = (String) payload.get("email");
        String tankId          = (String) payload.get("tankId");
        String rawPassword     = (String) payload.get("password");
        String confirmPassword = (String) payload.get("confirmPassword");

        // Password match check
        if (confirmPassword != null && !rawPassword.equals(confirmPassword)) {
            return ResponseEntity.badRequest().body("Error: Passwords do not match.");
        }

        // Password length check
        if (rawPassword == null || rawPassword.length() < 6) {
            return ResponseEntity.badRequest().body("Error: Password must be at least 6 characters.");
        }

        // Duplicate email check
        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.badRequest().body("Error: Email is already registered.");
        }

        // Duplicate tank ID check
        if (tankId != null && !tankId.isEmpty() && tankRepository.existsByTankId(tankId)) {
            return ResponseEntity.badRequest().body("Error: This Tank ID is already linked to another account.");
        }

        // Create user
        User newUser = new User();
        newUser.setFullName((String) payload.get("fullName"));
        newUser.setEmail(email);
        newUser.setPhoneNumber((String) payload.get("phoneNumber"));
        newUser.setPassword(passwordEncoder.encode(rawPassword));

        User savedUser = userRepository.save(newUser);

        // AUTO CREATE SETTINGS — only if not already existing
        if (!settingsRepository.findByEmail(savedUser.getEmail()).isPresent()) {
            Settings settings = new Settings();
            settings.setEmail(savedUser.getEmail());
            settings.setEmailEnabled(true);
            settings.setSmsEnabled(false);
            settingsRepository.save(settings);
        }

        // Link tank if provided
        if (tankId != null && !tankId.isEmpty()) {
            TankData tank = new TankData();
            tank.setTankId(tankId);
            tank.setTankName("Main Tank");
            tank.setUser(savedUser);
            tank.setTankHeight(150.0);
            tank.setMaxCapacity(1000.0);
            tank.setLowerThreshold(20.0);
            tank.setUpperThreshold(90.0);
            tank.setPumpStatus("OFF");
            tank.setIsAutomatic(true);
            tank.setLastUpdated(LocalDateTime.now());

            tankRepository.save(tank);
        }

        // Send welcome email
        try {
            notificationService.sendWelcomeEmail(
                    email,
                    savedUser.getFullName(),
                    tankId
            );
        } catch (Exception e) {
            System.err.println("WARN: Welcome email failed — " + e.getMessage());
        }

        return ResponseEntity.ok("Registration Successful! Your device is now linked.");
    }

    /* ══════════════════════════════════════════════════════
       2. LOGIN  (with brute-force rate limiting)
       ══════════════════════════════════════════════════════ */
    @PostMapping("/login")
    public ResponseEntity<?> loginUser(@RequestBody Map<String, String> credentials,
                                       HttpServletRequest req) {

        String email       = credentials.get("email");
        String rawPassword = credentials.get("password");

        // ── Check if account is currently locked ──────────────────────
        if (!tryConsumeLogin(email)) {
            long mins = minutesLeftLogin(email);
            Map<String, Object> locked = new HashMap<>();
            locked.put("locked", true);
            locked.put("minutesLeft", mins);
            locked.put("message", "Too many failed attempts. Try again in " + mins + " minute(s).");
            return ResponseEntity.status(429).body(locked);
        }

        // ── Authenticate ──────────────────────────────────────────────
        Optional<User> userOpt = userRepository.findByEmail(email);

        if (userOpt.isEmpty()) {
            // Email not registered at all — tell the frontend clearly
            return ResponseEntity.status(404).body("Error: No account found with this email. Please register first.");
        }

        User user = userOpt.get();

        if (passwordEncoder.matches(rawPassword, user.getPassword())) {
            resetLoginBucket(email);          // clear counter on success
            return ResponseEntity.ok(user);
        }

        // ── Failed attempt — check if this just triggered the lockout ──
        if (isJustLocked(email)) {
            markNotified(email);
            // Only send the email if the account actually exists
            try {
                notificationService.sendLoginLockoutEmail(
                        email,
                        user.getFullName(),
                        clientIp(req),
                        LOGIN_MAX_ATTEMPTS,
                        LOGIN_WINDOW_MS / 60000L   // window in minutes
                );
            } catch (Exception e) {
                System.err.println("WARN: Lockout notification email failed — " + e.getMessage());
            }
        }

        return ResponseEntity.status(401).body("Error: Incorrect password.");
    }

    /* ══════════════════════════════════════════════════════
       3. FORGOT PASSWORD
       ══════════════════════════════════════════════════════ */
    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> payload) {

        String email = payload.get("email");

        Optional<User> userOpt = userRepository.findByEmail(email);

        if (userOpt.isEmpty()) {
            return ResponseEntity.badRequest().body("Error: Email address not found.");
        }

        User user = userOpt.get();

        String otp = String.format("%06d", new Random().nextInt(1000000));

        user.setOtp(otp);
        user.setOtpExpiry(LocalDateTime.now().plusMinutes(5));

        userRepository.save(user);

        boolean sent = notificationService.sendOtpEmail(email, otp);

        if (!sent) {
            return ResponseEntity.status(500).body(
                    "Error: Could not send OTP email."
            );
        }

        return ResponseEntity.ok(
                Map.of("message", "OTP sent successfully.")
        );
    }

    /* ══════════════════════════════════════════════════════
       4. VERIFY OTP
       ══════════════════════════════════════════════════════ */
    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@RequestBody Map<String, String> payload) {

        String email      = payload.get("email");
        String enteredOtp = payload.get("otp");

        Optional<User> userOpt = userRepository.findByEmail(email);

        if (userOpt.isEmpty()) {
            return ResponseEntity.badRequest().body("User not found.");
        }

        User user = userOpt.get();

        if (user.getOtp() == null || !user.getOtp().equals(enteredOtp)) {
            return ResponseEntity.badRequest().body("Error: Invalid OTP.");
        }

        if (user.getOtpExpiry() == null ||
                user.getOtpExpiry().isBefore(LocalDateTime.now())) {

            return ResponseEntity.badRequest().body("Error: OTP expired.");
        }

        return ResponseEntity.ok(Map.of("message", "OTP Verified."));
    }

    /* ══════════════════════════════════════════════════════
       5. RESET PASSWORD
       ══════════════════════════════════════════════════════ */
    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> payload) {

        String email       = payload.get("email");
        String newPassword = payload.get("newPassword");

        if (newPassword == null || newPassword.length() < 6) {
            return ResponseEntity.badRequest().body(
                    "Error: Password must be at least 6 characters."
            );
        }

        Optional<User> userOpt = userRepository.findByEmail(email);

        if (userOpt.isPresent()) {

            User user = userOpt.get();

            user.setPassword(passwordEncoder.encode(newPassword));
            user.setOtp(null);
            user.setOtpExpiry(null);

            userRepository.save(user);

            return ResponseEntity.ok("Password reset successfully.");
        }

        return ResponseEntity.status(404).body("Error: User not found.");
    }
}