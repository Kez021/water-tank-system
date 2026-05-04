package com.tank.system.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/**
 * SupportTicket — stores user help requests submitted via "Need Help?" sidebar.
 * Supports a full conversation thread (JSON array) between user and admin.
 * Admin can close the conversation to prevent further user replies.
 */
@Entity
@Table(name = "support_tickets")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class SupportTicket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String userEmail;
    private String userName;

    @Column(columnDefinition = "TEXT")
    private String message;

    private String category;
    private String status = "Open";

    // Initial file attachment (photo/video on first submission)
    private String attachmentPath;
    private String attachmentOriginalName;
    private String attachmentType;

    private LocalDateTime submittedAt;

    // Legacy single-reply note (kept for backward compat)
    @Column(columnDefinition = "TEXT")
    private String adminNote;

    /**
     * Conversation thread — JSON array of message objects:
     * [{ "sender": "user"|"admin", "senderName": "...", "message": "...",
     *    "timestamp": "...", "attachmentPath": "...",
     *    "attachmentOriginalName": "...", "attachmentType": "..." }, ...]
     * Auto-created from the first message + admin note on first reply.
     */
    @Column(columnDefinition = "TEXT")
    private String conversationJson;

    /**
     * When true: admin has closed the thread.
     * User can no longer reply; must open a new ticket.
     */
    @Column(nullable = false)
    private Boolean isClosed = false;

    @PrePersist
    protected void onCreate() {
        submittedAt = LocalDateTime.now();
        if (status == null) status = "Open";
        if (isClosed == null) isClosed = false;
    }
}
