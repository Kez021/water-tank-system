package com.tank.system.controller;

import com.tank.system.model.SupportTicket;
import com.tank.system.model.User;
import com.tank.system.repository.SupportTicketRepository;
import com.tank.system.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

/**
 * SUPPORT TICKET CONTROLLER
 * POST /api/support/submit      — user submits a concern (with optional photo/video)
 * GET  /api/support/my-tickets  — user views their own submitted tickets
 * GET  /api/admin/support/all   — admin sees ALL tickets from ALL users
 * PUT  /api/admin/support/update — admin updates ticket status + adds reply note
 * GET  /api/admin/support/stats  — admin sees ticket count stats
 */
@RestController
@CrossOrigin(origins = "*")
public class SupportTicketController {

    @Autowired private SupportTicketRepository ticketRepository;
    @Autowired private UserRepository userRepository;

    private static final String UPLOAD_DIR = "./uploads/support/";

    @PostMapping("/api/support/submit")
    public ResponseEntity<?> submitTicket(
            @RequestParam("email") String email,
            @RequestParam("message") String message,
            @RequestParam(value = "category", defaultValue = "General") String category,
            @RequestParam(value = "file", required = false) MultipartFile file) {
        try {
            Optional<User> userOpt = userRepository.findByEmail(email);
            String userName = userOpt.map(User::getFullName).orElse("Unknown User");

            SupportTicket ticket = new SupportTicket();
            ticket.setUserEmail(email);
            ticket.setUserName(userName);
            ticket.setMessage(message);
            ticket.setCategory(category);
            ticket.setStatus("Open");

            if (file != null && !file.isEmpty()) {
                File uploadDir = new File(UPLOAD_DIR);
                if (!uploadDir.exists()) uploadDir.mkdirs();
                String uniqueName = System.currentTimeMillis() + "_" + file.getOriginalFilename();
                Path filePath = Paths.get(UPLOAD_DIR + uniqueName);
                Files.write(filePath, file.getBytes());
                ticket.setAttachmentPath(UPLOAD_DIR + uniqueName);
                ticket.setAttachmentOriginalName(file.getOriginalFilename());
                ticket.setAttachmentType(file.getContentType());
            }

            ticketRepository.save(ticket);
            return ResponseEntity.ok(Map.of(
                "message", "Your concern has been submitted! Our team will get back to you soon.",
                "ticketId", ticket.getId()
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Error: " + e.getMessage());
        }
    }

    @GetMapping("/api/support/my-tickets")
    public ResponseEntity<?> getMyTickets(@RequestParam String email) {
        return ResponseEntity.ok(ticketRepository.findByUserEmailOrderBySubmittedAtDesc(email));
    }

    @GetMapping("/api/admin/support/all")
    public ResponseEntity<?> getAllTickets(@RequestParam(required = false) String status) {
        if (status != null && !status.isEmpty())
            return ResponseEntity.ok(ticketRepository.findByStatusOrderBySubmittedAtDesc(status));
        return ResponseEntity.ok(ticketRepository.findAllByOrderBySubmittedAtDesc());
    }

    @PutMapping("/api/admin/support/update")
    public ResponseEntity<?> updateTicket(@RequestBody Map<String, String> payload) {
        Long ticketId = Long.parseLong(payload.get("ticketId"));
        Optional<SupportTicket> opt = ticketRepository.findById(ticketId);
        if (opt.isEmpty()) return ResponseEntity.status(404).body("Ticket not found.");
        SupportTicket ticket = opt.get();
        if (payload.containsKey("status")) ticket.setStatus(payload.get("status"));
        if (payload.containsKey("adminNote")) ticket.setAdminNote(payload.get("adminNote"));
        ticketRepository.save(ticket);
        return ResponseEntity.ok("Ticket updated.");
    }

    @GetMapping("/api/admin/support/stats")
    public ResponseEntity<?> getStats() {
        List<SupportTicket> all = ticketRepository.findAll();
        long open = all.stream().filter(t -> "Open".equals(t.getStatus())).count();
        long inProgress = all.stream().filter(t -> "In Progress".equals(t.getStatus())).count();
        long resolved = all.stream().filter(t -> "Resolved".equals(t.getStatus())).count();
        return ResponseEntity.ok(Map.of("total", all.size(), "open", open, "inProgress", inProgress, "resolved", resolved));
    }
}
