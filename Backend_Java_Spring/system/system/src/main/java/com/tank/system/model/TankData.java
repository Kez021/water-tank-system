package com.tank.system.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonManagedReference;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    @OneToMany(mappedBy = "tankData", cascade = CascadeType.ALL)
    @JsonManagedReference // ITO DAPAT ANG NANDITO
    private List<TankLog> logs;

    /* * Manual timestamp management is handled via the Controller
     * during hardware synchronization events.
     */
    /* @PrePersist
    @PreUpdate
    protected void onUpdate() {
        lastUpdated = LocalDateTime.now();
    }
    */

    // --- MANUAL GETTERS FOR CONTROLLER COMPATIBILITY ---
    // These ensure the Controller can access boolean and threshold values correctly

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