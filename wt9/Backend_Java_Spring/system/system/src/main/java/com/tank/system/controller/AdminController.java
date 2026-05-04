package com.tank.system.controller;

import com.tank.system.model.*;
import com.tank.system.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "*")
public class AdminController {

    @Autowired private UserRepository userRepository;
    @Autowired private TankManagementRepository tankRepository;
    @Autowired private TankLogRepository tankLogRepository;
    @Autowired private SupportTicketRepository ticketRepository;

    private ResponseEntity<?> requireAuth(String token) {
        if (!AdminAuthController.isValidToken(token)) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized: invalid or expired admin token."));
        }
        return null;
    }

    /* ── STATS ── */
    @GetMapping("/stats")
    public ResponseEntity<?> getStats(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> guard = requireAuth(token); if (guard != null) return guard;
        long totalUsers  = userRepository.count();
        long totalTanks  = tankRepository.count();
        long openTickets = ticketRepository.findByStatusOrderBySubmittedAtDesc("Open").size();
        java.time.LocalDateTime cutoff = java.time.LocalDateTime.now().minusSeconds(30);
        // Use findAllWithUser() so the user proxy is already loaded — no LazyInitException
        long onlineTanks = tankRepository.findAllWithUser().stream()
            .filter(t -> t.getLastUpdated() != null && t.getLastUpdated().isAfter(cutoff)).count();
        return ResponseEntity.ok(Map.of(
            "totalUsers", totalUsers, "totalTanks", totalTanks,
            "onlineTanks", onlineTanks, "openTickets", openTickets
        ));
    }

    /* ── ALL USERS ── */
    @GetMapping("/all-users")
    public ResponseEntity<?> getAllUsers(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> guard = requireAuth(token); if (guard != null) return guard;
        List<User> users = userRepository.findAll();
        List<Map<String, Object>> result = new ArrayList<>();
        for (User u : users) {
            Map<String, Object> d = new HashMap<>();
            d.put("id",          u.getId());
            d.put("fullName",    u.getFullName());
            d.put("email",       u.getEmail());
            d.put("phoneNumber", u.getPhoneNumber());
            d.put("tankCount",   tankRepository.findByUser(u).size());
            d.put("ticketCount", ticketRepository.findByUserEmailOrderBySubmittedAtDesc(u.getEmail()).size());
            result.add(d);
        }
        return ResponseEntity.ok(result);
    }

    /* ── DELETE USER ── */
    @DeleteMapping("/delete-user/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id,
                                        @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> guard = requireAuth(token); if (guard != null) return guard;
        Optional<User> opt = userRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.status(404).body("User not found.");
        User u = opt.get();
        List<TankData> tanks = tankRepository.findByUser(u);
        for (TankData t : tanks) tankLogRepository.deleteByTankId(t.getTankId());
        tankRepository.deleteAll(tanks);
        ticketRepository.deleteAll(ticketRepository.findByUserEmailOrderBySubmittedAtDesc(u.getEmail()));
        userRepository.delete(u);
        return ResponseEntity.ok(Map.of("message", "User deleted successfully."));
    }

    /* ── ALL TANKS ──
       PERMANENT FIX: Use findAllWithUser() which does LEFT JOIN FETCH t.user
       so the User entity is already in memory — no LazyInitializationException. */
    @GetMapping("/all-tanks")
    public ResponseEntity<?> getAllTanks(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> guard = requireAuth(token); if (guard != null) return guard;
        // ← The only change that matters: findAllWithUser() instead of findAll()
        List<TankData> tanks = tankRepository.findAllWithUser();
        List<Map<String, Object>> result = new ArrayList<>();
        for (TankData t : tanks) {
            Map<String, Object> d = new HashMap<>();
            d.put("tankId",         t.getTankId());
            d.put("tankName",       t.getTankName());
            d.put("waterLevel",     t.getWaterLevel());
            d.put("pumpStatus",     t.getPumpStatus());
            d.put("isAutomatic",    t.getIsAutomatic());
            d.put("lastUpdated",    t.getLastUpdated() != null ? t.getLastUpdated().toString() : null);
            d.put("maxCapacity",    t.getMaxCapacity());
            d.put("lowerThreshold", t.getLowerThreshold());
            d.put("upperThreshold", t.getUpperThreshold());
            // Safe to call now — User was JOIN FETCH-ed in the same query
            if (t.getUser() != null) {
                d.put("ownerEmail", t.getUser().getEmail());
                d.put("ownerName",  t.getUser().getFullName());
                d.put("ownerId",    t.getUser().getId());
            }
            result.add(d);
        }
        return ResponseEntity.ok(result);
    }

    /* ── ALL LOGS ── Convert to plain maps so usageAmount is always visible */
    @GetMapping("/all-logs")
    public ResponseEntity<?> getAllLogs(@RequestParam(defaultValue = "200") int limit,
                                        @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> guard = requireAuth(token); if (guard != null) return guard;
        List<TankLog> logs = tankLogRepository.findAll();
        logs.sort((a, b) -> b.getTimestamp().compareTo(a.getTimestamp()));
        if (logs.size() > limit) logs = logs.subList(0, limit);

        // Convert to plain maps — avoids any Jackson serialization issues and
        // guarantees usageAmount is always present (even when it is 0).
        List<Map<String, Object>> result = new ArrayList<>();
        for (TankLog l : logs) {
            Map<String, Object> m = new HashMap<>();
            m.put("id",          l.getId());
            m.put("tankId",      l.getTankId());
            m.put("action",      l.getAction());
            m.put("status",      l.getStatus());
            m.put("details",     l.getDetails());
            m.put("waterLevel",  l.getWaterLevel());
            m.put("usageAmount", l.getUsageAmount() != null ? l.getUsageAmount() : 0.0);
            m.put("timestamp",   l.getTimestamp() != null ? l.getTimestamp().toString() : null);
            result.add(m);
        }
        return ResponseEntity.ok(result);
    }

    /* ── USER DETAIL — for View modal & Account Monitor ── */
    @GetMapping("/user-detail")
    public ResponseEntity<?> getUserDetail(@RequestParam String email,
                                           @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> guard = requireAuth(token); if (guard != null) return guard;
        Optional<User> opt = userRepository.findByEmail(email);
        if (opt.isEmpty()) return ResponseEntity.status(404).body("User not found.");
        User u = opt.get();

        List<TankData> tanks = tankRepository.findByUser(u);

        // ── Logs: convert to plain maps (usageAmount always present) ──
        List<Map<String, Object>> logMaps = new ArrayList<>();
        for (TankData t : tanks) {
            List<TankLog> tLogs = tankLogRepository.findByTankIdOrderByTimestampDesc(t.getTankId());
            for (TankLog l : tLogs) {
                Map<String, Object> lm = new HashMap<>();
                lm.put("id",          l.getId());
                lm.put("tankId",      l.getTankId());
                lm.put("action",      l.getAction());
                lm.put("status",      l.getStatus());
                lm.put("details",     l.getDetails());
                lm.put("waterLevel",  l.getWaterLevel());
                lm.put("usageAmount", l.getUsageAmount() != null ? l.getUsageAmount() : 0.0);
                lm.put("timestamp",   l.getTimestamp() != null ? l.getTimestamp().toString() : null);
                logMaps.add(lm);
            }
        }
        logMaps.sort((a, b) -> String.valueOf(b.get("timestamp")).compareTo(String.valueOf(a.get("timestamp"))));
        if (logMaps.size() > 50) logMaps = logMaps.subList(0, 50);

        // ── Tanks: plain maps ──
        List<Map<String, Object>> tankMaps = new ArrayList<>();
        for (TankData t : tanks) {
            Map<String, Object> tm = new HashMap<>();
            tm.put("tankId",      t.getTankId());
            tm.put("tankName",    t.getTankName());
            tm.put("waterLevel",  t.getWaterLevel());
            tm.put("maxCapacity", t.getMaxCapacity());
            tm.put("pumpStatus",  t.getPumpStatus());
            tm.put("isAutomatic", t.getIsAutomatic());
            tm.put("lastUpdated", t.getLastUpdated() != null ? t.getLastUpdated().toString() : null);
            tankMaps.add(tm);
        }

        List<SupportTicket> tickets = ticketRepository.findByUserEmailOrderBySubmittedAtDesc(u.getEmail());

        Map<String, Object> d = new HashMap<>();
        d.put("id",             u.getId());
        d.put("fullName",       u.getFullName());
        d.put("email",          u.getEmail());
        d.put("phoneNumber",    u.getPhoneNumber());
        d.put("tanks",          tankMaps);
        d.put("recentLogs",     logMaps);
        d.put("supportTickets", tickets);
        return ResponseEntity.ok(d);
    }
}
