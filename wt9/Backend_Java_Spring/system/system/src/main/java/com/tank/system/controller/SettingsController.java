package com.tank.system.controller;

import com.tank.system.model.Settings;
import com.tank.system.repository.SettingsRepository;
import org.springframework.beans.factory.annotation.Autowired;
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

    @GetMapping("/load")
    public Settings getSettings(@RequestParam String email) {
        return settingsRepository.findByEmail(email)
                .orElseGet(() -> {

                    Settings defaultSettings = new Settings();
                    defaultSettings.setEmail(email);
                    defaultSettings.setPhone("");
                    defaultSettings.setEmailEnabled(true);
                    defaultSettings.setSmsEnabled(false);
                    return defaultSettings;
                });
    }
    /**
     * UNIFIED SAVE ENDPOINT
     * Updates notification preferences (Settings table) and Profile security (User table).
     * This ensures both tables are synchronized in the H2 Database.
     */
    @PostMapping("/save")
    public String saveSettings(@RequestBody Map<String, Object> payload) {
        // 1. Extract the unique identifier (email) from the request payload
        String email = (String) payload.get("email");

        if (email == null || email.isEmpty()) {
            return "Error: Email identifier is missing from the request.";
        }

    /* ----------------------------------------------------------
       PART 1: UPDATE NOTIFICATION SETTINGS (Settings Table)
       ---------------------------------------------------------- */
        // Fetch existing settings or create a new instance if not found
        Settings settings = settingsRepository.findByEmail(email).orElse(new Settings());
        settings.setEmail(email);

        // Safely map payload values to the Settings entity
        if (payload.containsKey("phone")) {
            settings.setPhone((String) payload.get("phone"));
        }

        // Explicitly parse booleans to avoid Type Mismatch errors during persistence
        if (payload.containsKey("emailEnabled")) {
            settings.setEmailEnabled(Boolean.parseBoolean(payload.get("emailEnabled").toString()));
        }
        if (payload.containsKey("smsEnabled")) {
            settings.setSmsEnabled(Boolean.parseBoolean(payload.get("smsEnabled").toString()));
        }

        // Persist changes to the USER_SETTINGS table
        settingsRepository.save(settings);

    /* ----------------------------------------------------------
       PART 2: UPDATE USER ACCOUNT SECURITY (User Table)
       ---------------------------------------------------------- */
        return userRepository.findByEmail(email).map(user -> {

            // Handle Password Update with Security Verification
            String currentPass = (String) payload.get("currentPassword");
            String newPass = (String) payload.get("newPassword");

            if (newPass != null && !newPass.isEmpty()) {
                // Verify if the provided current password matches the encoded password in DB
                if (passwordEncoder.matches(currentPass, user.getPassword())) {
                    user.setPassword(passwordEncoder.encode(newPass));
                } else {
                    return "Error: Current password verification failed.";
                }
            }

            // Save updated user credentials
            userRepository.save(user);
            return "Success: Settings and Security configurations synchronized.";

        }).orElse("Error: Associated user account not found in the database.");
    }
}