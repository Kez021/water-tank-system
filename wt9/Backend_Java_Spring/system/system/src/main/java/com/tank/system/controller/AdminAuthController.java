package com.tank.system.controller;

import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.security.SecureRandom;

/**
 * Admin login endpoint with built-in rate limiting (Bucket4j-style logic,
 * implemented with a simple in-memory ConcurrentHashMap so it works
 * identically on localhost (H2) and Railway (PostgreSQL) — no extra deps).
 *
 * Rule: 5 failed attempts per IP per 15 minutes -> 429 Too Many Requests.
 * Successful login resets the bucket for that IP.
 */
@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "*")
public class AdminAuthController {

    /* ==== Credentials (server-side) ==== */
    private static final String ADMIN_USERNAME = "admin";
    private static final String ADMIN_PASSWORD = "tank@admin2026";

    /* ==== Rate limit config ==== */
    private static final int MAX_ATTEMPTS = 5;
    private static final long WINDOW_MS  = 15 * 60 * 1000L; // 15 minutes

    /* ==== In-memory buckets per IP ==== */
    private static class Bucket {
        int attempts = 0;
        long windowStart = System.currentTimeMillis();
    }
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    /* ==== Active session tokens (in-memory) ==== */
    private static final Map<String, Long> activeTokens = new ConcurrentHashMap<>();
    private static final long TOKEN_TTL_MS = 4 * 60 * 60 * 1000L; // 4 hours
    private static final SecureRandom RNG = new SecureRandom();

    private String clientIp(HttpServletRequest req) {
        String h = req.getHeader("X-Forwarded-For");
        if (h != null && !h.isEmpty()) return h.split(",")[0].trim();
        return req.getRemoteAddr();
    }

    private synchronized boolean tryConsume(String ip) {
        long now = System.currentTimeMillis();
        Bucket b = buckets.computeIfAbsent(ip, k -> new Bucket());
        if (now - b.windowStart > WINDOW_MS) {
            b.attempts = 0;
            b.windowStart = now;
        }
        if (b.attempts >= MAX_ATTEMPTS) return false;
        b.attempts++;
        return true;
    }

    private synchronized long minutesLeft(String ip) {
        Bucket b = buckets.get(ip);
        if (b == null) return 0;
        long left = WINDOW_MS - (System.currentTimeMillis() - b.windowStart);
        return Math.max(1, left / 60000L);
    }

    private synchronized void resetBucket(String ip) { buckets.remove(ip); }

    private String issueToken() {
        byte[] buf = new byte[32];
        RNG.nextBytes(buf);
        StringBuilder sb = new StringBuilder();
        for (byte x : buf) sb.append(String.format("%02x", x));
        String tok = sb.toString();
        activeTokens.put(tok, System.currentTimeMillis() + TOKEN_TTL_MS);
        return tok;
    }

    public static boolean isValidToken(String token) {
        if (token == null) return false;
        Long exp = activeTokens.get(token);
        if (exp == null) return false;
        if (System.currentTimeMillis() > exp) {
            activeTokens.remove(token);
            return false;
        }
        return true;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body,
                                     HttpServletRequest req) {
        String ip = clientIp(req);
        Map<String, Object> resp = new HashMap<>();

        if (!tryConsume(ip)) {
            resp.put("success", false);
            resp.put("locked", true);
            resp.put("minutesLeft", minutesLeft(ip));
            resp.put("message", "Too many failed attempts. Try again in "
                    + minutesLeft(ip) + " minutes.");
            return resp;
        }

        String username = body.getOrDefault("username", "").trim();
        String password = body.getOrDefault("password", "");

        if (ADMIN_USERNAME.equals(username) && ADMIN_PASSWORD.equals(password)) {
            resetBucket(ip);
            resp.put("success", true);
            resp.put("token", issueToken());
            return resp;
        }

        resp.put("success", false);
        resp.put("message", "Invalid credentials");
        return resp;
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(@RequestBody(required = false) Map<String, String> body) {
        if (body != null && body.get("token") != null) {
            activeTokens.remove(body.get("token"));
        }
        return Map.of("success", true);
    }

    @GetMapping("/verify")
    public Map<String, Object> verify(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        return Map.of("valid", isValidToken(token));
    }
}
