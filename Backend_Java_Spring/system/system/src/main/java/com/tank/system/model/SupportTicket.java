package com.tank.system.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/**
 * SupportTicket — stores user help requests submitted via "Need Help?" sidebar.
 * Admin dashboard can view, reply to, and update status of all tickets.
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

    // File attachment (photo/video)
    private String attachmentPath;
    private String attachmentOriginalName;
    private String attachmentType;

    private LocalDateTime submittedAt;

    @Column(columnDefinition = "TEXT")
    private String adminNote;

    @PrePersist
    protected void onCreate() {
        submittedAt = LocalDateTime.now();
        if (status == null) status = "Open";
    }
}
