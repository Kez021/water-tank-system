package com.tank.system.model;

import jakarta.persistence.*;
import lombok.*;
import java.util.List;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * User Entity - Represents the homeowner and their authentication data.
 * This class handles user profile information and security credentials.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The full name of the homeowner.
     */
    private String fullName;

    /**
     * Unique email address used for login and system notifications.
     */
    @Column(unique = true, nullable = false)
    private String email;

    /**
     * Contact number for receiving SMS alerts.
     */
    private String phoneNumber;

    /**
     * Industry-standard hashed password for secure authentication.
     */
    @Column(nullable = false)
    @JsonIgnore
    private String password;

    /**
     * Temporary One-Time Password (OTP) used for the password recovery process.
     */
    private String otp;

    /**
     * Expiration timestamp for the generated OTP to ensure session security.
     */
    private LocalDateTime otpExpiry;

    /**
     * Relationship: A user can manage multiple tank systems.
     */
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL)
    @JsonIgnore
    private List<TankData> tanks;
}