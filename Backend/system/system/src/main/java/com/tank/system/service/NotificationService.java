package com.tank.system.service;

import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import jakarta.annotation.PostConstruct;
import jakarta.mail.internet.MimeMessage;

import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class NotificationService {

    @Autowired
    private JavaMailSender mailSender;

    @Value("${spring.mail.properties.mail.from:${spring.mail.username:system.water.tank@gmail.com}}")
    private String mailFrom;

    @Value("${spring.mail.username:system.water.tank@gmail.com}")
    private String mailUsername;

    @Value("${brevo.api.key:disabled}")
    private String brevoApiKey;

    @Value("${twilio.account.sid:disabled}")
    private String accountSid;

    @Value("${twilio.auth.token:disabled}")
    private String authToken;

    @Value("${twilio.phone.number:disabled}")
    private String twilioPhone;

    private boolean smsEnabled = false;

    @PostConstruct
    public void initTwilio() {
        smsEnabled = isConfigured(accountSid) && isConfigured(authToken) && isConfigured(twilioPhone);
        if (smsEnabled) {
            Twilio.init(accountSid, authToken);
            System.out.println("LOG: Twilio SMS is enabled.");
        } else {
            System.out.println("LOG: Twilio SMS is disabled. Email-only notifications active.");
        }
        String fromAddr = isConfigured(mailFrom) ? mailFrom : mailUsername;
        System.out.println("LOG: Mail sender configured as: " + fromAddr);
        if (isConfigured(brevoApiKey)) {
            System.out.println("LOG: Email mode = Brevo HTTP API (Render/online)");
        } else {
            System.out.println("LOG: Email mode = SMTP (localhost)");
        }
    }

    private boolean isConfigured(String value) {
        return StringUtils.hasText(value)
                && !"disabled".equalsIgnoreCase(value.trim())
                && !value.trim().isEmpty();
    }

    // =========================================================
    // CORE: localhost = SMTP, Render = Brevo HTTP API
    // =========================================================

    private boolean sendEmail(String to, String subject, String htmlBody) {
        if (isConfigured(brevoApiKey)) {
            return sendEmailViaBrevoApi(to, subject, htmlBody);
        }
        return sendEmailViaSmtp(to, subject, htmlBody);
    }

    // =========================================================
    // LOCALHOST — Gmail SMTP (unchanged)
    // =========================================================

    private boolean sendEmailViaSmtp(String to, String subject, String htmlBody) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
            String from = isConfigured(mailFrom) ? mailFrom : mailUsername;
            if (isConfigured(from)) {
                try {
                    helper.setFrom(from, "Water Tank System");
                } catch (UnsupportedEncodingException e) {
                    helper.setFrom(from);
                }
            }
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlToPlainText(htmlBody), htmlBody);
            mailSender.send(mime);
            System.out.println("LOG: Email sent successfully to: " + to);
            return true;
        } catch (Exception e) {
            System.err.println("ERROR: SMTP failure -- " + e.getMessage());
            return false;
        }
    }

    private String htmlToPlainText(String html) {
        return html.replaceAll("<br\\s*/?>", "\n")
                .replaceAll("<[^>]+>", "")
                .replaceAll("&nbsp;", " ")
                .replaceAll("&amp;", "&")
                .trim();
    }

    // =========================================================
    // RENDER — Brevo HTTP API (bypasses blocked SMTP)
    // =========================================================

    private boolean sendEmailViaBrevoApi(String to, String subject, String htmlBody) {
        try {
            String from = isConfigured(mailFrom) ? mailFrom : mailUsername;
            String safeSubject = subject.replace("\\", "\\\\").replace("\"", "\\\"");
            String safeHtml    = htmlBody.replace("\\", "\\\\").replace("\"", "\\\"")
                    .replace("\n", "\\n").replace("\r", "");
            String payload = "{"
                    + "\"sender\":{\"name\":\"Water Tank System\",\"email\":\"" + from + "\"},"
                    + "\"to\":[{\"email\":\"" + to + "\"}],"
                    + "\"subject\":\"" + safeSubject + "\","
                    + "\"htmlContent\":\"" + safeHtml + "\""
                    + "}";
            URI uri = new URI("https://api.brevo.com/v3/smtp/email");
            HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("api-key", brevoApiKey);
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }
            int response = conn.getResponseCode();
            if (response == 201) {
                System.out.println("LOG: Email sent via Brevo to " + to);
                return true;
            }
            System.err.println("ERROR: Brevo HTTP " + response);
            return false;
        } catch (Exception e) {
            System.err.println("ERROR: Brevo failed " + e.getMessage());
            return false;
        }
    }

    // =========================================================
    // OTP EMAIL — returns boolean (used by UserController)
    // =========================================================

    public boolean sendOtpEmail(String email, String otp) {
        String html =
                "<div style='font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;" +
                        "background:#f8faff;border-radius:12px;border:1px solid #dde4f0;'>" +
                        "<h2 style='color:#1a56db;margin-top:0;'>Password Reset OTP</h2>" +
                        "<p style='color:#374151;'>You requested a password reset for your Water Tank account.</p>" +
                        "<div style='background:#fff;border:2px dashed #1a56db;border-radius:8px;padding:20px 24px;" +
                        "text-align:center;margin:24px 0;'>" +
                        "<p style='font-size:13px;color:#6b7280;margin:0 0 10px;'>Your One-Time Password</p>" +
                        "<div style='display:flex;justify-content:center;align-items:center;gap:8px;" +
                        "flex-wrap:nowrap;margin:0 0 10px;'>" +
                        buildOtpDigits(otp) +
                        "</div>" +
                        "<p style='font-size:12px;color:#9ca3af;margin:0;'>Valid for 5 minutes</p>" +
                        "</div>" +
                        "<p style='color:#374151;'>If you did not request this, ignore this email. " +
                        "Do not share this code with anyone.</p>" +
                        "<hr style='border:none;border-top:1px solid #e5e7eb;margin:24px 0;'>" +
                        "<p style='font-size:12px;color:#9ca3af;'>Automated Water Tank Monitoring System</p>" +
                        "</div>";
        return sendEmail(email, "Password Reset OTP -- Water Tank System", html);
    }

    private String buildOtpDigits(String otp) {
        StringBuilder sb = new StringBuilder();
        for (char c : otp.toCharArray()) {
            sb.append("<span style='display:inline-flex;align-items:center;justify-content:center;" +
                    "width:38px;height:46px;background:#eff6ff;border:2px solid #1a56db;border-radius:8px;" +
                    "font-size:22px;font-weight:900;color:#1a56db;font-family:\"Courier New\",monospace;'>" +
                    c + "</span>");
        }
        return sb.toString();
    }

    // =========================================================
    // CRITICAL ALERT — void (called by other controllers)
    // =========================================================

    public void sendCriticalAlert(String email, String phone, String tankName, double level) {
        String levelStr = String.format("%.1f", level);
        String html =
                "<div style='font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;" +
                        "background:#fff8f0;border-radius:12px;border:2px solid #f59e0b;'>" +
                        "<h2 style='color:#d97706;margin-top:0;'>Low Water Level Alert</h2>" +
                        "<p style='color:#374151;'>This is an automated status update for:</p>" +
                        "<h3 style='color:#1f2937;'>" + tankName + "</h3>" +
                        "<div style='background:#fff;border-left:4px solid #ef4444;border-radius:4px;" +
                        "padding:12px 18px;margin:16px 0;'>" +
                        "<p style='margin:0;color:#ef4444;font-size:22px;font-weight:bold;'>" +
                        "Water Level: " + levelStr + "%</p>" +
                        "</div>" +
                        "<p style='color:#374151;'>The water level has reached the critical threshold. " +
                        "The automated pump sequence has been initiated to prevent supply disruption.</p>" +
                        "<p style='color:#374151;'>Please monitor your dashboard for real-time progress.</p>" +
                        "<hr style='border:none;border-top:1px solid #e5e7eb;margin:24px 0;'>" +
                        "<p style='font-size:12px;color:#9ca3af;'>Automated Water Tank Monitoring System</p>" +
                        "</div>";
        sendEmail(email, "Alert: Low Water Level -- " + tankName, html);
        if (!smsEnabled || !isConfigured(phone)) return;
        try {
            String fp = phone.startsWith("0") ? "+63" + phone.substring(1)
                    : phone.startsWith("+") ? phone : "+63" + phone;
            Message.creator(new PhoneNumber(fp), new PhoneNumber(twilioPhone),
                            "TANK ALERT: " + tankName + " is at " + levelStr + "%. Check supply immediately!")
                    .create();
            System.out.println("LOG: SMS alert sent to: " + fp);
        } catch (Exception e) {
            System.err.println("ERROR: Twilio SMS failure -- " + e.getMessage());
        }
    }

    // =========================================================
    // WELCOME EMAIL — void (called by UserController)
    // =========================================================

    public void sendWelcomeEmail(String email, String fullName, String tankId) {
        String html =
                "<div style='font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;" +
                        "background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;'>" +
                        "<h2 style='color:#15803d;margin-top:0;'>Welcome to Water Tank System!</h2>" +
                        "<p style='color:#374151;'>Hello <strong>" + fullName + "</strong>,</p>" +
                        "<p style='color:#374151;'>Your account has been created successfully.</p>" +
                        (tankId != null && !tankId.isEmpty() ?
                                "<div style='background:#fff;border-left:4px solid #15803d;border-radius:4px;" +
                                "padding:12px 18px;margin:16px 0;'>" +
                                "<p style='margin:0;color:#374151;'><strong>Tank ID linked:</strong> " + tankId + "</p>" +
                                "</div>" : "") +
                        "<p style='color:#374151;'>You can now log in and monitor your water tank in real time.</p>" +
                        "<hr style='border:none;border-top:1px solid #e5e7eb;margin:24px 0;'>" +
                        "<p style='font-size:12px;color:#9ca3af;'>Automated Water Tank Monitoring System</p>" +
                        "</div>";
        sendEmail(email, "Account Created -- Water Tank System", html);
    }

    // =========================================================
    // PASSWORD CHANGED — void
    // =========================================================

    public void sendPasswordChangedEmail(String email, String fullName) {
        String html =
                "<div style='font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;" +
                        "background:#f8faff;border-radius:12px;border:1px solid #dde4f0;'>" +
                        "<h2 style='color:#1a56db;margin-top:0;'>Password Changed</h2>" +
                        "<p style='color:#374151;'>Hello <strong>" + fullName + "</strong>,</p>" +
                        "<p style='color:#374151;'>Your account password has been successfully updated. " +
                        "You can now log in using your new password.</p>" +
                        "<div style='background:#fff;border-left:4px solid #f59e0b;border-radius:4px;" +
                        "padding:12px 18px;margin:16px 0;'>" +
                        "<p style='margin:0;color:#92400e;font-size:14px;'>" +
                        "<strong>Security Notice:</strong> If you did not make this change, contact support " +
                        "at system.water.tank@gmail.com or reset your password immediately.</p>" +
                        "</div>" +
                        "<hr style='border:none;border-top:1px solid #e5e7eb;margin:24px 0;'>" +
                        "<p style='font-size:12px;color:#9ca3af;'>Automated Water Tank Monitoring System</p>" +
                        "</div>";
        sendEmail(email, "Password Changed -- Water Tank System", html);
    }

    // =========================================================
    // LOGIN LOCKOUT — void (called by UserController)
    // =========================================================

    public void sendLoginLockoutEmail(String email, String fullName,
                                      String ipAddress, int maxAttempts, long windowMinutes) {
        String html =
                "<div style='font-family:Arial,sans-serif;max-width:480px;margin:auto;" +
                        "padding:24px 20px;background:#fff5f5;border-radius:14px;" +
                        "border:2px solid #fca5a5;box-sizing:border-box;'>" +
                        "<div style='text-align:center;margin-bottom:20px;'>" +
                        "<div style='display:inline-flex;align-items:center;justify-content:center;" +
                        "width:60px;height:60px;background:#fee2e2;border-radius:50%;margin-bottom:12px;'>" +
                        "<span style='font-size:30px;line-height:1;'>&#128274;</span>" +
                        "</div>" +
                        "<h2 style='color:#b91c1c;margin:0;font-size:20px;line-height:1.3;'>" +
                        "Account Temporarily Locked</h2>" +
                        "</div>" +
                        "<p style='color:#374151;font-size:15px;margin:0 0 12px;'>" +
                        "Hello <strong>" + fullName + "</strong>,</p>" +
                        "<p style='color:#374151;font-size:15px;margin:0 0 20px;line-height:1.6;'>" +
                        "We detected <strong>" + maxAttempts + " consecutive failed login attempts</strong> " +
                        "on your Water Tank account. For your security, access has been temporarily locked.</p>" +
                        "<div style='background:#ffffff;border:1px solid #fca5a5;border-radius:10px;" +
                        "padding:16px 18px;margin-bottom:20px;'>" +
                        "<div style='display:flex;justify-content:space-between;align-items:center;" +
                        "padding:10px 0;border-bottom:1px solid #fee2e2;'>" +
                        "<span style='color:#6b7280;font-size:14px;'>Failed Attempts</span>" +
                        "<span style='color:#b91c1c;font-weight:700;font-size:16px;'>" +
                        maxAttempts + " / " + maxAttempts + "</span>" +
                        "</div>" +
                        "<div style='display:flex;justify-content:space-between;align-items:center;" +
                        "padding:10px 0;border-bottom:1px solid #fee2e2;'>" +
                        "<span style='color:#6b7280;font-size:14px;'>Lockout Duration</span>" +
                        "<span style='color:#b91c1c;font-weight:700;font-size:16px;'>" +
                        windowMinutes + " minutes</span>" +
                        "</div>" +
                        "<div style='display:flex;justify-content:space-between;align-items:center;" +
                        "padding:10px 0;'>" +
                        "<span style='color:#6b7280;font-size:14px;'>IP Address</span>" +
                        "<span style='color:#374151;font-weight:600;font-size:14px;" +
                        "font-family:\"Courier New\",monospace;'>" + ipAddress + "</span>" +
                        "</div>" +
                        "</div>" +
                        "<div style='background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;" +
                        "padding:14px 16px;margin-bottom:20px;'>" +
                        "<p style='margin:0 0 8px;color:#92400e;font-weight:700;font-size:14px;'>" +
                        "&#9888;&#65039;&nbsp; Was this you?</p>" +
                        "<p style='margin:0;color:#78350f;font-size:14px;line-height:1.7;'>" +
                        "If you made these attempts, simply wait <strong>" + windowMinutes +
                        " minutes</strong> and try again.<br>" +
                        "If this was <strong>not you</strong>, reset your password immediately " +
                        "using the <em>Forgot Password</em> option on the login page.</p>" +
                        "</div>" +
                        "<hr style='border:none;border-top:1px solid #fecaca;margin:20px 0 16px;'>" +
                        "<p style='font-size:12px;color:#9ca3af;text-align:center;margin:0;line-height:1.7;'>" +
                        "Automated Water Tank Monitoring System<br>" +
                        "This is an automated security alert — do not reply to this email.</p>" +
                        "</div>";
        sendEmail(email, "Security Alert: Account Locked — Water Tank System", html);
    }
}