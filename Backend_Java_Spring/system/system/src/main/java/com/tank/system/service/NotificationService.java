package com.tank.system.service;

import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender; // Corrected import with .javamail.
import org.springframework.stereotype.Service;

/**
 * UNIFIED NOTIFICATION SERVICE
 * This service handles dual-channel alerts (Email and SMS)
 * when the system detects critical water levels.
 */
@Service
public class NotificationService {

    @Autowired
    private JavaMailSender mailSender;

    // Twilio credentials from application.properties
    @Value("${twilio.account.sid}")
    private String accountSid;

    @Value("${twilio.auth.token}")
    private String authToken;

    @Value("${twilio.phone.number}")
    private String twilioPhone;

    /**
     * Initializes the Twilio SDK with your Account SID and Auth Token
     * immediately after the service is constructed.
     */
    @PostConstruct
    public void initTwilio() {
        Twilio.init(accountSid, authToken);
    }

    /**
     * SENDS CRITICAL ALERTS via Email and SMS
     * Triggered when the water level drops below the user-defined threshold.
     * * @param email    Recipient's registered email address
     *
     * @param phone    Recipient's verified phone number
     * @param tankName The name of the tank triggering the alert
     * @param level    The current water percentage recorded
     */
    public void sendCriticalAlert(String email, String phone, String tankName, double level) {

        // 1. EXECUTE EMAIL ALERT
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

        // 2. EXECUTE SMS ALERT (Twilio)
        try {
            // Standardize phone number format to E.164 (+63xxxxxxxxxx)
            String formattedPhone = phone;
            if (phone.startsWith("0")) {
                formattedPhone = "+63" + phone.substring(1);
            } else if (!phone.startsWith("+")) {
                formattedPhone = "+63" + phone;
            }

            // Creating and sending the Twilio message
            Message.creator(
                    new PhoneNumber(formattedPhone),
                    new PhoneNumber(twilioPhone),
                    "⚠️ TANK ALERT " + tankName + " is CRITICAL at " + String.format("%.2f", level) + "%. Check supply immediately!"
            ).create();

            System.out.println("LOG: Notification SMS successfully sent to: " + formattedPhone);
        } catch (Exception e) {
            // Logs detailed error if SMS fails (e.g., Unverified number or insufficient balance)
            System.err.println("ERROR: Twilio SMS Failure -> " + e.getMessage());
        }
    }
    /**
     * SENDS PASSWORD RESET OTP
     * Provides a professional email template for security-related requests.
     */
    public void sendOtpEmail(String email, String otp) {
        try {
            SimpleMailMessage mailMessage = new SimpleMailMessage();
            mailMessage.setTo(email);
            mailMessage.setSubject("🔑 Automated Tank System Password Reset OTP");

            mailMessage.setText("Hello,\n\n" +
                    "Your One-Time Password is " + otp + "."+ "\n\n" +
                    "This code is valid for 5 minutes. For security reasons, do not share this code with anyone.\n\n" +
                    "Best regards,\n" +
                    "System Security Team");

            mailSender.send(mailMessage);
            System.out.println("LOG: OTP Email successfully sent to: " + email);
        } catch (Exception e) {
            System.err.println("ERROR: SMTP OTP Failure -> " + e.getMessage());
        }
    }
}
