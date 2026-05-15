package com.tank.system.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonFormat;

@Entity
@Table(name = "tank_data")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TankData {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String tankId; // Hardware ID from QR code

    private String tankName;

    private Double tankHeight = 150.0; // Default height in cm

    private Double maxCapacity = 1000.0; // Default capacity in Liters

    private Double waterLevel = 0.0; // Current level in percentage (%)

    private Double currentVolume = 0.0; // Calculated volume in Liters (L)

    private Double lowerThreshold = 20.0; // Pump ON trigger (%)

    private Double upperThreshold = 90.0; // Pump OFF trigger (%)

    private String pumpStatus = "OFF"; // Current relay state (ON/OFF)

    private Boolean isAutomatic = true; // Operation Mode: true=Auto, false=Manual

    private Boolean isAlertSent = false; // Flag to prevent multiple alert spamming

    /**
     * Last recorded synchronization with the IoT hardware.
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastUpdated;

    /**
     * The owner of this tank. LAZY fetch + @JsonIgnore prevents
     * LazyInitializationException when this entity is serialized
     * outside of a JPA transaction (e.g. in /api/tank/user-tanks).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    /**
     * Logs relationship. @JsonIgnore here prevents Jackson from
     * triggering a LAZY collection load during REST serialization,
     * which caused the HTTP 500 on /api/tank/user-tanks.
     * Logs are fetched explicitly by the log/analytics endpoints.
     */
    @OneToMany(mappedBy = "tankData", cascade = CascadeType.ALL)
    @JsonIgnore
    private List<TankLog> logs;

    // --- MANUAL GETTERS FOR CONTROLLER COMPATIBILITY ---
    public Boolean getIsAlertSent() {
        return isAlertSent != null ? isAlertSent : false;
    }

    public void setIsAlertSent(Boolean alertSent) {
        this.isAlertSent = alertSent;
    }

    public Double getLowerThreshold() {
        return lowerThreshold != null ? lowerThreshold : 20.0;
    }

    public Double getUpperThreshold() {
        return upperThreshold != null ? upperThreshold : 90.0;
    }

    public Boolean getIsAutomatic() {
        return isAutomatic != null ? isAutomatic : true;
    }
}
