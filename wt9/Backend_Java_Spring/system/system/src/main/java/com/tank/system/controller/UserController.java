package com.tank.system.controller;

import com.tank.system.model.User;
import com.tank.system.model.TankData;
import com.tank.system.repository.UserRepository;
import com.tank.system.repository.TankManagementRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.concurrent.ConcurrentHashMap;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import com.tank.system.service.NotificationService;
import java.util.Random;

/**
 * USER CONTROLLER - Handles Secure Authentication and Registration
 * Updated with BCrypt Hashing and Automatic Tank Linking.
 */
@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {

    /* ===== USER LOGIN RATE LIMIT (5 attempts / 15 min per IP) ===== */
    private static final int LOGIN_MAX_ATTEMPTS = 5;
    private static final long LOGIN_WINDOW_MS = 15 * 60 * 1000L;
    private static class LoginBucket { int attempts; long windowStart = System.currentTimeMillis(); }
    private final java.util.Map<String, LoginBucket> loginBuckets = new ConcurrentHashMap<>();

    private String clientIp(HttpServletRequest req) {
        String h = req.getHeader("X-Forwarded-For");
        if (h != null && !h.isEmpty()) return h.split(",")[0].trim();
        return req.getRemoteAddr();
    }
    private synchronized boolean tryLogin(String ip) {
        long now = System.currentTimeMillis();
        LoginBucket b = loginBuckets.computeIfAbsent(ip, k -> new LoginBucket());
        if (now - b.windowStart > LOGIN_WINDOW_MS) { b.attempts = 0; b.windowStart = now; }
        if (b.attempts >= LOGIN_MAX_ATTEMPTS) return false;
        b.attempts++;
        return true;
    }
    private synchronized long loginMinutesLeft(String ip) {
        LoginBucket b = loginBuckets.get(ip);
        if (b == null) return 0;
        long left = LOGIN_WINDOW_MS - (System.currentTimeMillis() - b.windowStart);
        return Math.max(1, left / 60000L);
    }
    private synchronized void resetLoginBucket(String ip) { loginBuckets.remove(ip); }


    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TankManagementRepository tankRepository;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    /* ==========================================================
        1. REGISTRATION API - Hashes Password & Links Tank
        ========================================================== */
    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@RequestBody Map<String, Object> payload) {

        String email = (String) payload.get("email");
        String tankId = (String) payload.get("tankId"); // Get this early

        // 1. VALIDATION: Check if email exists
        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.badRequest().body("Error: Email is already registered.");
        }

        // 2. VALIDATION: Check if Tank ID is already taken by another user
        // Para hindi ma-duplicate ang hardware sa database
        if (tankId != null && tankRepository.existsByTankId(tankId)) {
            return ResponseEntity.badRequest().body("Error: This Tank ID is already linked to another account.");
        }

        // 3. CREATE NEW USER
        User newUser = new User();
        newUser.setFullName((String) payload.get("fullName"));
        newUser.setEmail(email);
        newUser.setPhoneNumber((String) payload.get("phoneNumber"));

        String rawPassword = (String) payload.get("password");
        newUser.setPassword(passwordEncoder.encode(rawPassword));

        User savedUser = userRepository.save(newUser);

        // 4. LINK TANK (If ID is provided and valid)
        if (tankId != null && !tankId.isEmpty()) {
            TankData tank = new TankData();
            tank.setTankId(tankId);
            tank.setTankName("Main Tank");
            tank.setUser(savedUser);

            // Initializing default values
            tank.setTankHeight(150.0);
            tank.setMaxCapacity(1000.0);
            tank.setLowerThreshold(20.0);
            tank.setUpperThreshold(90.0);
            tank.setPumpStatus("OFF");
            tank.setIsAutomatic(true);
            tank.setLastUpdated(LocalDateTime.now());

            tankRepository.save(tank);
        }

        return ResponseEntity.ok("Registration Successful! Your device is now linked.");
    }
    /* ==========================================================
       2. LOGIN API - Validates Hashed Credentials
       ========================================================== */
    @PostMapping("/login")
    public ResponseEntity<?> loginUser(@RequestBody Map<String, String> credentials,
                                       HttpServletRequest req) {
        String ip = clientIp(req);

        // 429 if IP is locked out
        if (!tryLogin(ip)) {
            long mins = loginMinutesLeft(ip);
            return ResponseEntity.status(429).body(Map.of(
                "locked", true,
                "minutesLeft", mins,
                "message", "Too many failed attempts. Try again in " + mins + " minutes."
            ));
        }

        String email = credentials.get("email");
        String rawPassword = credentials.get("password");

        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (passwordEncoder.matches(rawPassword, user.getPassword())) {
                resetLoginBucket(ip); // success → clear counter for this IP
                return ResponseEntity.ok(user);
            }
        }
        return ResponseEntity.status(401).body("Error: Invalid email or password.");
    }
    @Autowired
    private NotificationService notificationService;

    /* ==========================================================
       3. FORGOT PASSWORD API - OTP Generation & Verification
       ========================================================== */

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        Optional<User> userOpt = userRepository.findByEmail(email);

        if (userOpt.isEmpty()) {
            return ResponseEntity.badRequest().body("Error: Email address not found.");
        }

        User user = userOpt.get();

        // Generate a 6-digit random OTP
        String otp = String.format("%06d", new Random().nextInt(1000000));

        // Set OTP and 5-minute expiry
        user.setOtp(otp);
        user.setOtpExpiry(LocalDateTime.now().plusMinutes(5));
        userRepository.save(user);

        notificationService.sendOtpEmail(email, otp);
        return ResponseEntity.ok(Map.of("message", "OTP sent successfully to your email."));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String enteredOtp = payload.get("otp");

        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) return ResponseEntity.badRequest().body("User not found.");

        User user = userOpt.get();

        if (user.getOtp() == null || !user.getOtp().equals(enteredOtp)) {
            return ResponseEntity.badRequest().body("Error: Invalid OTP.");
        }

        if (user.getOtpExpiry().isBefore(LocalDateTime.now())) {
            return ResponseEntity.badRequest().body("Error: OTP has expired.");
        }

        return ResponseEntity.ok(Map.of("message", "OTP Verified."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String newPassword = payload.get("newPassword");

        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isPresent()) {
            User user = userOpt.get();

            // Hash the new password using your BCrypt encoder
            user.setPassword(passwordEncoder.encode(newPassword));

            // Clear OTP fields after use
            user.setOtp(null);
            user.setOtpExpiry(null);

            userRepository.save(user);
            return ResponseEntity.ok("Password updated successfully.");
        }
        return ResponseEntity.status(404).body("Error: User not found.");
    }
}