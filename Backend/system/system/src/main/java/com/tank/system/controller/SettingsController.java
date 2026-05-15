package com.tank.system.controller;

import com.tank.system.model.Settings;
import com.tank.system.repository.SettingsRepository;
import com.tank.system.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/settings")
@CrossOrigin(origins = "*")
public class SettingsController {

    @Autowired
    private com.tank.system.repository.UserRepository userRepository;

    @Autowired
    private org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder passwordEncoder;

    @Autowired
    private SettingsRepository settingsRepository;

    @Autowired
    private NotificationService notificationService;

    @GetMapping("/load")
    public Settings getSettings(@RequestParam String email) {
        return settingsRepository.findByEmail(email).orElseGet(() -> {
            Settings def = new Settings();
            def.setEmail(email);
            def.setPhone("");
            def.setEmailEnabled(true);
            def.setSmsEnabled(false);
            return def;
        });
    }

    /**
     * UNIFIED SAVE — updates notification preferences (Settings table) and
     * account password (User table). Sends an email confirmation when the
     * password is changed successfully.
     *
     * Returns HTTP 400 on any validation or auth failure so the frontend can
     * distinguish errors from success without string-parsing the status code.
     */
    @PostMapping("/save")
    public ResponseEntity<String> saveSettings(@RequestBody Map<String, Object> payload) {
        String email = (String) payload.get("email");
        if (email == null || email.isEmpty()) {
            return ResponseEntity.badRequest().body("Error: Email identifier is missing from the request.");
        }

        // ── Part 1: Notification Settings ──────────────────────────────
        Settings settings = settingsRepository.findByEmail(email).orElse(new Settings());
        settings.setEmail(email);

        if (payload.containsKey("phone")) {
            settings.setPhone((String) payload.get("phone"));
        }
        if (payload.containsKey("emailEnabled")) {
            settings.setEmailEnabled(Boolean.parseBoolean(payload.get("emailEnabled").toString()));
        }
        if (payload.containsKey("smsEnabled")) {
            settings.setSmsEnabled(Boolean.parseBoolean(payload.get("smsEnabled").toString()));
        }

        // ── Part 2: Password Update ─────────────────────────────────────
        String currentPass = (String) payload.get("currentPassword");
        String newPass     = (String) payload.get("newPassword");

        boolean passwordChangeRequested = newPass != null && !newPass.isEmpty();

        if (passwordChangeRequested) {
            // Server-side minimum length check
            if (newPass.length() < 6) {
                return ResponseEntity.badRequest().body("Error: New password must be at least 6 characters.");
            }

            // Verify the user account exists
            var userOpt = userRepository.findByEmail(email);
            if (userOpt.isEmpty()) {
                return ResponseEntity.badRequest().body("Error: User account not found.");
            }

            var user = userOpt.get();

            // Verify current password — MUST match before anything is saved
            if (currentPass == null || currentPass.isEmpty()) {
                return ResponseEntity.badRequest().body("Error: Current password is required.");
            }
            if (!passwordEncoder.matches(currentPass, user.getPassword())) {
                return ResponseEntity.badRequest().body("Error: Current password is incorrect.");
            }

            // All checks passed — now save settings AND new password together
            settingsRepository.save(settings);
            user.setPassword(passwordEncoder.encode(newPass));
            userRepository.save(user);

            // Send email notification (non-blocking — failure does not abort the response)
            try {
                notificationService.sendPasswordChangedEmail(email, user.getFullName());
            } catch (Exception e) {
                System.err.println("WARN: Password-change notification email failed — " + e.getMessage());
            }

            return ResponseEntity.ok("Success: Password updated and notification sent.");
        }

        // No password change — just save notification settings
        settingsRepository.save(settings);
        return ResponseEntity.ok("Success: Settings saved.");
    }
}
