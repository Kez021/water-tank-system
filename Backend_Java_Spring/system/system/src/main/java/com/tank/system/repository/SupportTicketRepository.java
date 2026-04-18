package com.tank.system.repository;

import com.tank.system.model.SupportTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SupportTicketRepository extends JpaRepository<SupportTicket, Long> {
    List<SupportTicket> findByUserEmailOrderBySubmittedAtDesc(String userEmail);
    List<SupportTicket> findByStatusOrderBySubmittedAtDesc(String status);
    List<SupportTicket> findAllByOrderBySubmittedAtDesc();
}
