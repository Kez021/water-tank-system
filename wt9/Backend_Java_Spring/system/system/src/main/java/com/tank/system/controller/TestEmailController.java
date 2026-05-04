package com.tank.system.controller;

import com.tank.system.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Manual SMTP smoke-test endpoint.
 * Hit: GET /api/test-email?to=youremail@gmail.com
 * Returns JSON {success: true|false}. Check Spring console logs for SMTP errors.
 */
@RestController
@CrossOrigin(origins = "*")
public class TestEmailController {

    @Autowired
    private NotificationService notificationService;

    @GetMapping("/api/test-email")
    public ResponseEntity<?> testEmail(@RequestParam String to) {
        boolean ok = notificationService.sendTestEmail(to);
        return ResponseEntity.ok(Map.of(
            "success", ok,
            "to", to,
            "note", ok ? "Mail accepted by SMTP. Check inbox/spam." : "SMTP failed. See Spring server logs."
        ));
    }
}
