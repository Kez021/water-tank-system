package com.tank.system.model;

import jakarta.persistence.*;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

/**
 * SupportTicket — stores user help requests submitted via "Need Help?" sidebar.
 * Admin dashboard can view, reply to, and update status of all tickets.
 *
 * NOTE: @Getter/@Setter removed intentionally — explicit accessors below
 * prevent Lombok/javac conflicts on Render (especially for Boolean isClosed).
 */
@Entity
@Table(name = "support_tickets")
@NoArgsConstructor @AllArgsConstructor
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

    @Column(columnDefinition = "TEXT")
    private String conversationJson = "[]";

    @Column(nullable = false)
    private Boolean isClosed = false;

    // ── Explicit accessors (avoids Lombok Boolean naming issues on Render) ──

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUserEmail() { return userEmail; }
    public void setUserEmail(String userEmail) { this.userEmail = userEmail; }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getAttachmentPath() { return attachmentPath; }
    public void setAttachmentPath(String attachmentPath) { this.attachmentPath = attachmentPath; }

    public String getAttachmentOriginalName() { return attachmentOriginalName; }
    public void setAttachmentOriginalName(String attachmentOriginalName) { this.attachmentOriginalName = attachmentOriginalName; }

    public String getAttachmentType() { return attachmentType; }
    public void setAttachmentType(String attachmentType) { this.attachmentType = attachmentType; }

    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime submittedAt) { this.submittedAt = submittedAt; }

    public String getAdminNote() { return adminNote; }
    public void setAdminNote(String adminNote) { this.adminNote = adminNote; }

    public String getConversationJson() { return conversationJson; }
    public void setConversationJson(String conversationJson) { this.conversationJson = conversationJson; }

    public Boolean getIsClosed() { return isClosed; }
    public void setIsClosed(Boolean isClosed) { this.isClosed = isClosed; }

    @PrePersist
    protected void onCreate() {
        submittedAt = LocalDateTime.now();
        if (status == null) status = "Open";
        if (isClosed == null) isClosed = false;
        if (conversationJson == null) conversationJson = "[]";
    }
}
