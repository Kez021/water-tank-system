package com.tank.system.controller;

import com.tank.system.model.*;
import com.tank.system.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

/**
 * ADMIN CONTROLLER — powers the separate Admin Dashboard website
 * GET /api/admin/stats        — summary numbers (users, tanks, online, tickets)
 * GET /api/admin/all-users    — all registered users (no passwords)
 * GET /api/admin/all-tanks    — all tanks with owner info
 * GET /api/admin/all-logs     — recent activity logs from all tanks
 * GET /api/admin/user-detail  — one user's full profile + their tanks
 */
@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "*")
public class AdminController {

    @Autowired private UserRepository userRepository;
    @Autowired private TankManagementRepository tankRepository;
    @Autowired private TankLogRepository tankLogRepository;
    @Autowired private SupportTicketRepository ticketRepository;

    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        long totalUsers = userRepository.count();
        long totalTanks = tankRepository.count();
        long totalTickets = ticketRepository.count();
        long openTickets = ticketRepository.findByStatusOrderBySubmittedAtDesc("Open").size();
        java.time.LocalDateTime cutoff = java.time.LocalDateTime.now().minusSeconds(30);
        long onlineTanks = tankRepository.findAll().stream()
            .filter(t -> t.getLastUpdated() != null && t.getLastUpdated().isAfter(cutoff)).count();
        return ResponseEntity.ok(Map.of(
            "totalUsers", totalUsers, "totalTanks", totalTanks,
            "onlineTanks", onlineTanks, "totalTickets", totalTickets, "openTickets", openTickets
        ));
    }

    @GetMapping("/all-users")
    public ResponseEntity<?> getAllUsers() {
        List<User> users = userRepository.findAll();
        List<Map<String, Object>> result = new ArrayList<>();
        for (User u : users) {
            Map<String, Object> d = new HashMap<>();
            d.put("id", u.getId()); d.put("fullName", u.getFullName());
            d.put("email", u.getEmail()); d.put("phoneNumber", u.getPhoneNumber());
            d.put("tankCount", tankRepository.findByUser(u).size());
            result.add(d);
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/all-tanks")
    public ResponseEntity<?> getAllTanks() {
        List<TankData> tanks = tankRepository.findAll();
        List<Map<String, Object>> result = new ArrayList<>();
        for (TankData t : tanks) {
            Map<String, Object> d = new HashMap<>();
            d.put("tankId", t.getTankId()); d.put("tankName", t.getTankName());
            d.put("waterLevel", t.getWaterLevel()); d.put("pumpStatus", t.getPumpStatus());
            d.put("isAutomatic", t.getIsAutomatic()); d.put("lastUpdated", t.getLastUpdated());
            d.put("maxCapacity", t.getMaxCapacity());
            d.put("lowerThreshold", t.getLowerThreshold()); d.put("upperThreshold", t.getUpperThreshold());
            if (t.getUser() != null) {
                d.put("ownerEmail", t.getUser().getEmail()); d.put("ownerName", t.getUser().getFullName());
            }
            result.add(d);
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/all-logs")
    public ResponseEntity<?> getAllLogs(@RequestParam(defaultValue = "200") int limit) {
        List<TankLog> logs = tankLogRepository.findAll();
        logs.sort((a, b) -> b.getTimestamp().compareTo(a.getTimestamp()));
        if (logs.size() > limit) logs = logs.subList(0, limit);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/user-detail")
    public ResponseEntity<?> getUserDetail(@RequestParam String email) {
        Optional<User> opt = userRepository.findByEmail(email);
        if (opt.isEmpty()) return ResponseEntity.status(404).body("User not found.");
        User u = opt.get();
        Map<String, Object> d = new HashMap<>();
        d.put("fullName", u.getFullName()); d.put("email", u.getEmail());
        d.put("phoneNumber", u.getPhoneNumber()); d.put("tanks", tankRepository.findByUser(u));
        return ResponseEntity.ok(d);
    }
}
