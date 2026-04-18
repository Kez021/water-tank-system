package com.tank.system.controller;

import com.tank.system.model.TankData;
import com.tank.system.model.User;
import com.tank.system.model.TankLog;
import com.tank.system.repository.TankManagementRepository;
import com.tank.system.repository.TankLogRepository;
import com.tank.system.repository.UserRepository;
import com.tank.system.repository.SettingsRepository;
import com.tank.system.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/tank")
@CrossOrigin(origins = "*")
public class TankManagementController {

    @Autowired
    private TankManagementRepository tankRepository;

    @Autowired
    private TankLogRepository tankLogRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SettingsRepository settingsRepository;

    // Unified Service for both Email and SMS
    @Autowired
    private NotificationService notificationService;
    /**
     * LOG RETENTION LOGIC (7-Month Rolling History)
     * Automatically purges logs for a specific tank that are older than 7 months.
     */
    private void purgeOldLogs(String tankId) {
        LocalDateTime cutoffDate = LocalDateTime.now().minusMonths(7);
        try {
            tankLogRepository.deleteByTankIdAndTimestampBefore(tankId, cutoffDate);
        } catch (Exception e) {
            System.err.println("Cleanup Error for Tank " + tankId + ": " + e.getMessage());
        }
    }

    /**
     * PRIVATE HELPER: Log tracking for Master History
     */
    private void saveLog(TankData tank, String action, String status, String details, Double amount) {
        TankLog log = new TankLog(tank, status, action, details, amount);
        tankLogRepository.save(log);

        // Execute cleanup for the specific tank that just logged data
        purgeOldLogs(tank.getTankId());
    }

    /**
     * 1. GENERATE ID (For QR Generation)
     */
    @GetMapping("/generate-id")
    public ResponseEntity<?> generateNewTankId() {
        String newId = String.valueOf(10000000 + new Random().nextInt(90000000));
        return ResponseEntity.ok(Map.of("tank_id", newId));
    }
    /**
     * 2. CHECK TANK OWNERSHIP (Used by QR Scanner before registration)
     * This endpoint verifies if a Tank ID is already registered in the system.
     * Frontend scanner will call this before allowing the user to proceed.
     */
    @GetMapping("/check/{tankId}")
    public ResponseEntity<?> checkTankOwnership(@PathVariable String tankId) {

        boolean exists = tankRepository.existsByTankId(tankId);

        Map<String, Object> response = new HashMap<>();
        response.put("tankId", tankId);
        response.put("registered", exists);

        if (exists) {
            response.put("message", "Tank ID already registered.");
        } else {
            response.put("message", "Tank ID available.");
        }

        return ResponseEntity.ok(response);
    }

    /**
     * 2. ADD TANK
     * Saves a new tank with custom thresholds and operation mode.
     */
    @PostMapping("/add")
    public ResponseEntity<?> addTank(@RequestBody Map<String, Object> payload) {
        try {
            String tankId = (String) payload.get("tankId");
            String email = (String) payload.get("email");

            Optional<User> userOpt = userRepository.findByEmail(email);
            if (userOpt.isEmpty()) return ResponseEntity.badRequest().body("Error: User not found.");
            if (tankRepository.existsByTankId(tankId)) return ResponseEntity.badRequest().body("Error: Hardware ID already registered.");

            TankData tank = new TankData();
            tank.setTankId(tankId);
            tank.setTankName((String) payload.get("tankName"));
            tank.setTankHeight(Double.valueOf(payload.get("tankHeight").toString()));
            tank.setMaxCapacity(Double.valueOf(payload.get("maxCapacity").toString()));

            // Map thresholds and mode from the new UI Modal
            tank.setLowerThreshold(Double.valueOf(payload.get("lowerThreshold").toString()));
            tank.setUpperThreshold(Double.valueOf(payload.get("upperThreshold").toString()));
            tank.setIsAutomatic((Boolean) payload.get("isAutomatic"));

            tank.setUser(userOpt.get());
            tank.setPumpStatus("Off");
            tank.setLastUpdated(LocalDateTime.now());

            TankData saved = tankRepository.save(tank);
            saveLog(saved, "Registration", "Success", "New tank added via QR Scan.", 0.0);
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Registration Error: " + e.getMessage());
        }
    }

    /**
     * 3. UPDATE TANK
     * Updates existing tank settings including thresholds and operation mode.
     */
    @PutMapping("/update")
    public ResponseEntity<?> updateTank(@RequestBody Map<String, Object> payload) {
        try {
            String tankId = (String) payload.get("tankId");
            TankData tank = tankRepository.findByTankId(tankId);
            if (tank == null) return ResponseEntity.status(404).body("Tank not found.");

            tank.setTankName((String) payload.get("tankName"));
            tank.setTankHeight(Double.valueOf(payload.get("tankHeight").toString()));
            tank.setMaxCapacity(Double.valueOf(payload.get("maxCapacity").toString()));

            // Update mode and thresholds
            tank.setLowerThreshold(Double.valueOf(payload.get("lowerThreshold").toString()));
            tank.setUpperThreshold(Double.valueOf(payload.get("upperThreshold").toString()));
            tank.setIsAutomatic((Boolean) payload.get("isAutomatic"));

            TankData updated = tankRepository.save(tank);
            saveLog(updated, "Configuration Update", "Updated", "Tank settings modified by user.", 0.0);
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Update Error: " + e.getMessage());
        }
    }

    /**
     * 5. SYNC (IoT, Safety Bypass, & Alerts)
     * This is the main bridge between your ESP32 and the Web System.
     */
    @PostMapping("/sync")
    public ResponseEntity<?> syncHardware(@RequestBody Map<String, Object> payload) {
        System.out.println("LOG: Sync signal received for Tank ID: " + payload.get("tankId"));
        try {
            String id = (String) payload.get("tankId");
            Double rawDist = Double.valueOf(payload.get("rawDistance").toString());

            TankData tank = tankRepository.findByTankId(id);

            // validate if the hardware ID exists in the database
            if (tank == null) {
                System.err.println("ERROR: Hardware ID " + id + " is not registered.");
                return ResponseEntity.status(404).body("Hardware ID Not Found.");
            }

            System.out.println("LOG: Processing sync for: " + tank.getTankName());

            double oldLevel = tank.getWaterLevel();

// a. calculate water level percentage based on tank height
            double level = Math.max(0, Math.min(100, ((tank.getTankHeight() - rawDist) / tank.getTankHeight()) * 100.0));
            tank.setWaterLevel(level);
            tank.setLastUpdated(LocalDateTime.now());

// --- dynamic consumption logging ---
            // --- DYNAMIC LOGGING LOGIC (Consumption vs. Refill Tracking) ---
            if (payload.containsKey("usageAmount")) {
                Double usagePercentDelta = Double.valueOf(payload.get("usageAmount").toString());

                // Retrieve the specific 'action' label sent by the ESP32 (e.g., "Auto Refill Triggered" or "Consumption")
                // If no action is provided, it defaults to "Consumption" for safety.
                String incomingAction = payload.getOrDefault("action", "Consumption").toString();

                // Convert the percentage delta from the sensor into actual Liters based on Tank Capacity
                double usageInLiters = (usagePercentDelta / 100.0) * tank.getMaxCapacity();

                // Only log significant movements (above 0.1L) to prevent database bloating from sensor jitter
                if (usageInLiters > 0.1) {
                    int hour = LocalDateTime.now().getHour();
                    String timePeriod;

                    // Categorize the event based on the time of day for better user insights
                    if (hour >= 5 && hour < 12) timePeriod = "morning activity";
                    else if (hour >= 12 && hour < 18) timePeriod = "afternoon activity";
                    else if (hour >= 18 && hour < 22) timePeriod = "evening activity";
                    else timePeriod = "late-night activity";

                    String logDetails = String.format("%s of %.2fL detected.", timePeriod, usageInLiters);

                    // CRITICAL FIX: We now use 'incomingAction' instead of a hardcoded "Consumption" string.
                    // This ensures the data is correctly mapped to either the Blue Bar or Green Bar in Analytics.
                    saveLog(tank, incomingAction, "Active", logDetails, usageInLiters);
                }
            }
// [FIX 2] B. SAFETY BYPASS & AUTO SHUTOFF (Dito lalabas ang Green Bar)
            if (level >= 95.0 || level >= tank.getUpperThreshold()) {

                if ("ON".equalsIgnoreCase(tank.getPumpStatus())) {
                    tank.setPumpStatus("Off");

                    // CALCULATE REFILL VOLUME: (Current Level - Old Level)
                    double refillAmount = ((level - oldLevel) / 100.0) * tank.getMaxCapacity();
                    if (refillAmount < 0) refillAmount = 0;

                    saveLog(tank, "Refill (Auto)", "System_Off",
                            String.format("Refilled %.2fL. Upper threshold reached.", refillAmount), refillAmount);
                }
            }

// C. AUTO FILL MODE
            else if (Boolean.TRUE.equals(tank.getIsAutomatic())) {
                if (level <= tank.getLowerThreshold() && "Off".equalsIgnoreCase(tank.getPumpStatus())) {
                    tank.setPumpStatus("ON");
                    saveLog(tank, "Auto Start", "Running", "Lower threshold reached. Pump started.", 0.0);
                }
            }



            // D. ALERT LOGIC (Unified Email & SMS)private void saveLog
            if (tank.getUser() != null) {
                String userEmail = tank.getUser().getEmail();

                settingsRepository.findByEmail(userEmail).ifPresentOrElse(s -> {
                    // Requirement 1: Level is low
                    // Requirement 2: Alert hasn't been sent yet (isAlertSent is false/null)
                    if (level <= tank.getLowerThreshold() && !Boolean.TRUE.equals(tank.getIsAlertSent())) {
                        System.out.println("LOG: Level critical (" + level + "%). Sending alerts...");

                        // This calls the service we updated with +63 formatting
                        notificationService.sendCriticalAlert(userEmail, s.getPhone(), tank.getTankName(), level);

                        saveLog(tank, "Notification", "Sent", "Critical alert dispatched.", 0.0);
                        tank.setIsAlertSent(true); // Flag as sent to prevent spam
                    }
                    // Reset logic: Allow alerts again once the tank is refilled
                    else if (level >= tank.getUpperThreshold()) {
                        tank.setIsAlertSent(false);
                    }
                }, () -> System.err.println("ERROR: No settings found for " + userEmail));
            }


            tankRepository.save(tank);

            Map<String, Object> response = new HashMap<>();
            response.put("level", level);
            response.put("pumpCommand", tank.getPumpStatus().equalsIgnoreCase("ON") ? "AUTO_ON" : "AUTO_OFF");
            response.put("lowLimit", tank.getLowerThreshold());
            response.put("highLimit", tank.getUpperThreshold());
            response.put("tankHeight", tank.getTankHeight());
            response.put("status", "Success");
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            System.out.println("DEBUG CRITICAL ERROR: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.internalServerError().body("Sync Error: " + e.getMessage());
        }
    }

    /**
     * 4. DELETE TANKlowLimit    : 20.0
     * level       : 50.0
     * pumpCommand : AUTO_ON
     * highLimit   : 90.0
     * tankHeight  : 90.0
     * status      : Success
     */
    @DeleteMapping("/delete/{tankId}")
    @Transactional
    public ResponseEntity<?> deleteTank(@PathVariable String tankId) {
        try {
            if (!tankRepository.existsByTankId(tankId)) return ResponseEntity.status(404).body("Not found.");
            tankLogRepository.deleteByTankId(tankId);
            tankRepository.deleteByTankId(tankId);
            return ResponseEntity.ok("Deleted successfully.");
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Delete Error.");
        }
    }



    @PostMapping("/toggle-pump")
    public ResponseEntity<?> togglePump(@RequestBody Map<String, String> payload) {
        TankData tank = tankRepository.findByTankId(payload.get("tankId"));
        if (tank == null) return ResponseEntity.status(404).body("Not found.");
        if (Boolean.TRUE.equals(tank.getIsAutomatic())) return ResponseEntity.badRequest().body("In Auto Mode.");

        String status = tank.getPumpStatus().equals("Off") ? "On" : "Off";
        tank.setPumpStatus(status);
        tankRepository.save(tank);
        saveLog(tank, status.equals("On") ? "Manual Trigger" : "Manual Stop", "User_Op", "User manually toggled pump.", 0.0);
        return ResponseEntity.ok("Pump is " + status);
    }

    @GetMapping("/user-tanks")
    public ResponseEntity<?> getUserTanks(@RequestParam String email) {
        return userRepository.findByEmail(email).map(u -> ResponseEntity.ok(tankRepository.findByUser(u)))
                .orElse(ResponseEntity.status(404).build());
    }
    @GetMapping("/details/{tankId}")
    public ResponseEntity<?> getTankDetails(@PathVariable String tankId) {
        TankData tank = tankRepository.findByTankId(tankId);
        if (tank == null) {
            return ResponseEntity.notFound().build();
        }

        double currentVolume = (tank.getWaterLevel() / 100.0) * tank.getMaxCapacity();

        Map<String, Object> data = new HashMap<>();
        data.put("tankId", tank.getTankId());
        data.put("tankName", tank.getTankName());
        data.put("waterLevel", tank.getWaterLevel());
        data.put("currentVolume", currentVolume);
        data.put("maxCapacity", tank.getMaxCapacity());
        data.put("pumpStatus", tank.getPumpStatus());
        data.put("isAutomatic", tank.getIsAutomatic());

        if (tank.getLastUpdated() != null) {
            // Format: "Mar 26, 2026 | 10:33:12 PM"
            java.time.format.DateTimeFormatter formatter = java.time.format.DateTimeFormatter.ofPattern("MMM dd, yyyy | hh:mm:ss a");
            data.put("lastUpdated", tank.getLastUpdated().format(formatter));
        } else {
            data.put("lastUpdated", "Never Updated");
        }

        // --- SYSTEM STATUS CALCULATION ---
// We determine the system status based on hardware heartbeat and water level thresholds.
        String status = "Online";
        LocalDateTime now = LocalDateTime.now();

// Check for Hardware Connectivity (Timeout after 20 seconds)
        if (tank.getLastUpdated() == null || tank.getLastUpdated().isBefore(now.minusSeconds(20))) {
            status = "Offline"; // System is considered disconnected
        }
// DYNAMIC WARNING LOGIC:
// Triggered if the level is equal to or below the user-defined lower threshold (e.g., 10%, 20%, etc.)
        else if (tank.getWaterLevel() <= tank.getLowerThreshold()) {
            status = "Warning"; // Critical low level detected
        }

// Final assignment to the response map
        data.put("systemStatus", status);
        return ResponseEntity.ok(data);
    }


}

