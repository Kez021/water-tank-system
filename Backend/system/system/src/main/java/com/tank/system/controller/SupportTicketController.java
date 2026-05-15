package com.tank.system.controller;

import com.tank.system.model.SupportTicket;
import com.tank.system.model.User;
import com.tank.system.repository.SupportTicketRepository;
import com.tank.system.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@CrossOrigin(origins = "*")
public class SupportTicketController {

    @Autowired private SupportTicketRepository ticketRepository;
    @Autowired private UserRepository userRepository;

    private static final String UPLOAD_DIR = "./uploads/support/";
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    /** Token guard for admin-only support endpoints. */
    private org.springframework.http.ResponseEntity<?> requireAdmin(String token) {
        if (!AdminAuthController.isValidToken(token)) {
            return org.springframework.http.ResponseEntity.status(401)
                .body(java.util.Map.of("error", "Unauthorized: invalid or expired admin token."));
        }
        return null;
    }

    private String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    private String buildMsgJson(String sender, String senderName, String message,
                                 String timestamp, String attachPath, String attachName, String attachType) {
        return "{" +
            "\"sender\":\"" + esc(sender) + "\"," +
            "\"senderName\":\"" + esc(senderName) + "\"," +
            "\"message\":\"" + esc(message) + "\"," +
            "\"timestamp\":\"" + esc(timestamp) + "\"," +
            "\"attachmentPath\":\"" + esc(attachPath) + "\"," +
            "\"attachmentOriginalName\":\"" + esc(attachName) + "\"," +
            "\"attachmentType\":\"" + esc(attachType) + "\"" +
        "}";
    }

    private String appendMsg(String existing, String msgJson) {
        if (existing == null || existing.isBlank() || existing.equals("[]"))
            return "[" + msgJson + "]";
        String trimmed = existing.trim();
        return trimmed.substring(0, trimmed.length() - 1) + "," + msgJson + "]";
    }

    private String initConversation(SupportTicket t) {
        String ts = t.getSubmittedAt() != null ? t.getSubmittedAt().format(TS_FMT) : LocalDateTime.now().format(TS_FMT);
        String firstMsg = buildMsgJson("user", t.getUserName(), t.getMessage(), ts,
                t.getAttachmentPath() != null ? t.getAttachmentPath() : "",
                t.getAttachmentOriginalName() != null ? t.getAttachmentOriginalName() : "",
                t.getAttachmentType() != null ? t.getAttachmentType() : "");
        String json = "[" + firstMsg + "]";
        if (t.getAdminNote() != null && !t.getAdminNote().isBlank()) {
            json = appendMsg(json, buildMsgJson("admin", "Admin", t.getAdminNote(), ts, "", "", ""));
        }
        return json;
    }

    private String[] saveFile(MultipartFile file) throws Exception {
        if (file == null || file.isEmpty()) return new String[]{"", "", ""};
        File uploadDir = new File(UPLOAD_DIR);
        if (!uploadDir.exists()) uploadDir.mkdirs();
        String uniqueName = System.currentTimeMillis() + "_" +
                file.getOriginalFilename().replaceAll("[^a-zA-Z0-9._-]", "_");
        Files.write(Paths.get(UPLOAD_DIR + uniqueName), file.getBytes());
        return new String[]{UPLOAD_DIR + uniqueName, file.getOriginalFilename(), file.getContentType()};
    }

    /* 1. SUBMIT NEW TICKET */
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
            ticket.setUserEmail(email); ticket.setUserName(userName);
            ticket.setMessage(message); ticket.setCategory(category);
            ticket.setStatus("Open"); ticket.setIsClosed(false);
            if (file != null && !file.isEmpty()) {
                String[] saved = saveFile(file);
                ticket.setAttachmentPath(saved[0]); ticket.setAttachmentOriginalName(saved[1]); ticket.setAttachmentType(saved[2]);
            }
            ticketRepository.save(ticket);
            ticket.setConversationJson(initConversation(ticket));
            ticketRepository.save(ticket);
            return ResponseEntity.ok(Map.of("message", "Your concern has been submitted! Our team will get back to you soon.", "ticketId", ticket.getId()));
        } catch (Exception e) { return ResponseEntity.internalServerError().body("Error: " + e.getMessage()); }
    }

    /* 2. USER: VIEW OWN TICKETS */
    @GetMapping("/api/support/my-tickets")
    public ResponseEntity<?> getMyTickets(@RequestParam String email) {
        return ResponseEntity.ok(ticketRepository.findByUserEmailOrderBySubmittedAtDesc(email));
    }

    /* 3. SERVE INITIAL ATTACHMENT */
    @GetMapping("/api/support/attachment/{id}")
    public ResponseEntity<Resource> getAttachment(@PathVariable Long id) {
        try {
            Optional<SupportTicket> opt = ticketRepository.findById(id);
            if (opt.isEmpty() || opt.get().getAttachmentPath() == null) return ResponseEntity.notFound().build();
            SupportTicket ticket = opt.get();
            File file = new File(ticket.getAttachmentPath());
            if (!file.exists()) return ResponseEntity.notFound().build();
            String ct = ticket.getAttachmentType() != null ? ticket.getAttachmentType() : "application/octet-stream";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + ticket.getAttachmentOriginalName() + "\"")
                    .contentType(MediaType.parseMediaType(ct))
                    .body(new FileSystemResource(file));
        } catch (Exception e) { return ResponseEntity.internalServerError().build(); }
    }

    /* 4. SERVE REPLY ATTACHMENT by filename */
    @GetMapping("/api/support/msg-attachment/{filename}")
    public ResponseEntity<Resource> getMsgAttachment(@PathVariable String filename) {
        try {
            File file = new File(UPLOAD_DIR + filename);
            if (!file.exists()) return ResponseEntity.notFound().build();
            String ct = Files.probeContentType(file.toPath());
            if (ct == null) ct = "application/octet-stream";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                    .contentType(MediaType.parseMediaType(ct))
                    .body(new FileSystemResource(file));
        } catch (Exception e) { return ResponseEntity.internalServerError().build(); }
    }

    /* 5. USER: REPLY ON EXISTING TICKET */
    @PostMapping("/api/support/reply/{id}")
    public ResponseEntity<?> userReply(
            @PathVariable Long id,
            @RequestParam("message") String message,
            @RequestParam(value = "file", required = false) MultipartFile file) {
        try {
            Optional<SupportTicket> opt = ticketRepository.findById(id);
            if (opt.isEmpty()) return ResponseEntity.status(404).body("Ticket not found.");
            SupportTicket ticket = opt.get();
            if (Boolean.TRUE.equals(ticket.getIsClosed()))
                return ResponseEntity.status(403).body("This conversation has been closed. Please submit a new ticket.");
            if (ticket.getConversationJson() == null || ticket.getConversationJson().isBlank())
                ticket.setConversationJson(initConversation(ticket));
            String[] saved = saveFile(file);
            String ts = LocalDateTime.now().format(TS_FMT);
            ticket.setConversationJson(appendMsg(ticket.getConversationJson(),
                    buildMsgJson("user", ticket.getUserName(), message, ts, saved[0], saved[1], saved[2])));
            if ("Resolved".equals(ticket.getStatus())) ticket.setStatus("In Progress");
            ticketRepository.save(ticket);
            return ResponseEntity.ok(Map.of("message", "Reply sent successfully."));
        } catch (Exception e) { return ResponseEntity.internalServerError().body("Error: " + e.getMessage()); }
    }

    /* 6. ADMIN: ALL TICKETS */
    @GetMapping("/api/admin/support/all")
    public ResponseEntity<?> getAllTickets(@RequestParam(required = false) String status) {
        if (status != null && !status.isEmpty())
            return ResponseEntity.ok(ticketRepository.findByStatusOrderBySubmittedAtDesc(status));
        return ResponseEntity.ok(ticketRepository.findAllByOrderBySubmittedAtDesc());
    }

    /* 7. ADMIN: UPDATE STATUS */
    @PutMapping("/api/admin/support/update")
    public ResponseEntity<?> updateTicket(@RequestBody Map<String, String> payload,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> g = requireAdmin(token); if (g != null) return g;
        Long ticketId = Long.parseLong(payload.get("ticketId"));
        Optional<SupportTicket> opt = ticketRepository.findById(ticketId);
        if (opt.isEmpty()) return ResponseEntity.status(404).body("Ticket not found.");
        SupportTicket ticket = opt.get();
        if (payload.containsKey("status")) ticket.setStatus(payload.get("status"));
        if (payload.containsKey("adminNote")) ticket.setAdminNote(payload.get("adminNote"));
        ticketRepository.save(ticket);
        return ResponseEntity.ok("Ticket updated.");
    }

    /* 8. ADMIN: REPLY ON TICKET */
    @PostMapping("/api/admin/support/reply/{id}")
    public ResponseEntity<?> adminReply(
            @PathVariable Long id,
            @RequestParam("message") String message,
            @RequestParam(value = "status", defaultValue = "") String status,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> g = requireAdmin(token); if (g != null) return g;
        try {
            Optional<SupportTicket> opt = ticketRepository.findById(id);
            if (opt.isEmpty()) return ResponseEntity.status(404).body("Ticket not found.");
            SupportTicket ticket = opt.get();
            if (ticket.getConversationJson() == null || ticket.getConversationJson().isBlank())
                ticket.setConversationJson(initConversation(ticket));
            String ts = LocalDateTime.now().format(TS_FMT);
            ticket.setConversationJson(appendMsg(ticket.getConversationJson(),
                    buildMsgJson("admin", "Admin", message, ts, "", "", "")));
            ticket.setAdminNote(message);
            if (!status.isBlank()) ticket.setStatus(status);
            ticketRepository.save(ticket);
            return ResponseEntity.ok(Map.of("message", "Reply sent."));
        } catch (Exception e) { return ResponseEntity.internalServerError().body("Error: " + e.getMessage()); }
    }

    /* 9. ADMIN: CLOSE CONVERSATION */
    @PutMapping("/api/admin/support/close/{id}")
    public ResponseEntity<?> closeConversation(@PathVariable Long id,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> g = requireAdmin(token); if (g != null) return g;
        Optional<SupportTicket> opt = ticketRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.status(404).body("Ticket not found.");
        SupportTicket ticket = opt.get();
        ticket.setIsClosed(true);
        ticket.setStatus("Resolved");
        ticketRepository.save(ticket);
        return ResponseEntity.ok(Map.of("message", "Conversation closed."));
    }

    /* 9b. ADMIN: REOPEN CONVERSATION */
    @PutMapping("/api/admin/support/reopen/{id}")
    public ResponseEntity<?> reopenConversation(@PathVariable Long id,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> g = requireAdmin(token); if (g != null) return g;
        Optional<SupportTicket> opt = ticketRepository.findById(id);
        if (opt.isEmpty()) return ResponseEntity.status(404).body("Ticket not found.");
        SupportTicket ticket = opt.get();
        ticket.setIsClosed(false);
        ticket.setStatus("In Progress");
        ticketRepository.save(ticket);
        return ResponseEntity.ok(Map.of("message", "Conversation reopened."));
    }

    /* 10. ADMIN: STATS */
    @GetMapping("/api/admin/support/stats")
    public ResponseEntity<?> getStats(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        ResponseEntity<?> g = requireAdmin(token); if (g != null) return g;
        List<SupportTicket> all = ticketRepository.findAll();
        long open = all.stream().filter(t -> "Open".equals(t.getStatus())).count();
        long inProgress = all.stream().filter(t -> "In Progress".equals(t.getStatus())).count();
        long resolved = all.stream().filter(t -> "Resolved".equals(t.getStatus())).count();
        return ResponseEntity.ok(Map.of("total", all.size(), "open", open, "inProgress", inProgress, "resolved", resolved));
    }
}
