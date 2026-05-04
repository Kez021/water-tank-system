package com.tank.system.service;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * UNIFIED NOTIFICATION SERVICE — Email only.
 * Twilio/SMS support has been removed (was insecure & required paid account).
 */
@Service
public class NotificationService {

    @Autowired
    private JavaMailSender mailSender;

    @PostConstruct
    public void init() {
        System.out.println("LOG: NotificationService ready (Email-only mode).");
    }

    /**
     * SENDS CRITICAL ALERTS via Email.
     * Triggered when the water level drops below the user-defined threshold.
     */
    public void sendCriticalAlert(String email, String phone, String tankName, double level) {
        try {
            SimpleMailMessage mailMessage = new SimpleMailMessage();
            mailMessage.setTo(email);
            mailMessage.setSubject("⚠️ System Alert: Low Water Level in " + tankName);
            mailMessage.setText("Hello,\n\n" +
                    "This is an automated status update for: " + tankName + ".\n" +
                    "Current Water Level: " + String.format("%.2f", level) + "%\n\n" +
                    "System Action: The water level has reached the critical threshold. " +
                    "The automated pump sequence has been initiated to prevent supply disruption.\n\n" +
                    "Please monitor your dashboard for real-time progress.\n\n" +
                    "Best regards,\n" +
                    "Automated Water Tank Monitoring System");
            mailSender.send(mailMessage);
            System.out.println("LOG: Notification Email successfully sent to: " + email);
        } catch (Exception e) {
            System.err.println("ERROR: SMTP Failure -> " + e.getMessage());
        }
    }

    /**
     * SENDS PASSWORD RESET OTP
     */
    public void sendOtpEmail(String email, String otp) {
        try {
            SimpleMailMessage mailMessage = new SimpleMailMessage();
            mailMessage.setTo(email);
            mailMessage.setSubject("🔑 Automated Tank System Password Reset OTP");
            mailMessage.setText("Hello,\n\n" +
                    "Your One-Time Password is " + otp + "." + "\n\n" +
                    "This code is valid for 5 minutes. For security reasons, do not share this code with anyone.\n\n" +
                    "Best regards,\n" +
                    "System Security Team");
            mailSender.send(mailMessage);
            System.out.println("LOG: OTP Email successfully sent to: " + email);
        } catch (Exception e) {
            System.err.println("ERROR: SMTP OTP Failure -> " + e.getMessage());
        }
    }

    /**
     * Manual SMTP test — used by GET /api/test-email?to=...
     * Returns true if mailSender accepted the message (does NOT guarantee delivery).
     */
    public boolean sendTestEmail(String to) {
        try {
            SimpleMailMessage m = new SimpleMailMessage();
            m.setTo(to);
            m.setSubject("✅ Test Email — Automated Water Tank System");
            m.setText("Hello,\n\n" +
                    "If you can read this, your Gmail SMTP integration is working correctly.\n\n" +
                    "This is a test email triggered manually from /api/test-email.\n\n" +
                    "— Automated Water Tank Monitoring System");
            mailSender.send(m);
            System.out.println("LOG: Test email successfully sent to: " + to);
            return true;
        } catch (Exception e) {
            System.err.println("ERROR: Test email failure -> " + e.getMessage());
            return false;
        }
    }
}
