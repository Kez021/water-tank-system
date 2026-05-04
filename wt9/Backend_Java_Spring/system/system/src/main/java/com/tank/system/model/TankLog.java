package com.tank.system.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonBackReference;

@Entity
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
@Table(name = "tank_logs")
public class TankLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The physical link to the TankData record (Foreign Key)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tank_internal_id", nullable = false)
    @JsonBackReference
    private TankData tankData;

    private String tankId;    // Hardware ID (e.g., E16D466C)
    private Double waterLevel; // Recorded level at the time of log
    private String status;     // Success, Warning, User_OP, Error
    private String action;     // Notification, Manual Trigger, System Sync
    private String details;    // Dynamic details (e.g., "Pump turned ON via Dashboard")
    private LocalDateTime timestamp;

    @Column(name = "usage_amount")
    private Double usageAmount = 0.0;

    /**
     * CONSTRUCTOR FOR SYSTEM LOGGING
     * Automatically pulls current info from the TankData object.
     */
    public TankLog(TankData tankData, String status, String action, String details, Double usageAmount) {
        this.tankData = tankData;
        this.tankId = tankData.getTankId();
        // Get the most recent level from the tank object
        this.waterLevel = tankData.getWaterLevel();
        this.status = status;
        this.action = action;
        this.details = details;
        this.usageAmount = usageAmount != null ? usageAmount : 0.0;
        this.timestamp = LocalDateTime.now();
    }
}