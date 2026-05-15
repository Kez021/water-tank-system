package com.tank.system.repository;

import com.tank.system.model.TankLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TankLogRepository extends JpaRepository<TankLog, Long> {

    /* ==========================================================
       BASIC PERSISTENCE QUERIES
       ========================================================== */

    List<TankLog> findByTankId(String tankId);

    List<TankLog> findAllByTankIdIn(List<String> tankIds);

    @Query("SELECT l FROM TankLog l WHERE l.tankData.user.email = :email ORDER BY l.timestamp DESC")
    List<TankLog> findAllByTankData_User_EmailOrderByTimestampDesc(@Param("email") String email);

    List<TankLog> findAllByOrderByTimestampDesc();

    List<TankLog> findByTankIdOrderByTimestampDesc(String tankId);

    List<TankLog> findTop10ByTankIdOrderByTimestampDesc(String tankId);

    @Query("SELECT l FROM TankLog l WHERE l.tankData.user.email = :email")
    List<TankLog> findAllByUserEmail(@Param("email") String email);

    /* ==========================================================
       DATA MAINTENANCE & PURGE QUERIES
       ========================================================== */

    @Modifying @Transactional
    void deleteByTankId(String tankId);

    @Modifying @Transactional
    @Query("DELETE FROM TankLog l WHERE l.tankData.id = :tankId")
    void deleteByTankData_Id(@Param("tankId") Long tankId);

    @Modifying @Transactional
    @Query("DELETE FROM TankLog l WHERE l.tankData.tankId = :tankId AND l.timestamp < :cutoffDate")
    void deleteByTankIdAndTimestampBefore(@Param("tankId") String tankId, @Param("cutoffDate") LocalDateTime cutoffDate);

    @Modifying @Transactional
    void deleteByIdNotIn(List<Long> ids);

    /* ==========================================================
       ANALYTICS — JPQL (works on BOTH H2 and PostgreSQL)
       Date filtering is done in Java, not SQL
       ========================================================== */

    // Fetch all logs for a tank within a date range — Java handles the grouping
    @Query("SELECT l FROM TankLog l WHERE l.tankData.tankId = :tankId AND l.timestamp >= :from ORDER BY l.timestamp ASC")
    List<TankLog> findByTankIdAndTimestampAfter(@Param("tankId") String tankId, @Param("from") LocalDateTime from);

    @Query("SELECT l FROM TankLog l WHERE l.tankData.tankId = :tankId AND l.action LIKE %:action% AND l.timestamp >= :from ORDER BY l.timestamp ASC")
    List<TankLog> findByTankIdAndActionContainingAndTimestampAfter(@Param("tankId") String tankId, @Param("action") String action, @Param("from") LocalDateTime from);

    @Query("SELECT l FROM TankLog l WHERE l.tankData.tankId = :tankId AND l.timestamp >= :from AND l.timestamp < :to")
    List<TankLog> findByTankIdAndTimestampBetween(@Param("tankId") String tankId, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT l FROM TankLog l WHERE l.tankData.user.email = :email AND l.timestamp >= :from AND l.timestamp < :to")
    List<TankLog> findByUserEmailAndTimestampBetween(@Param("email") String email, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT l FROM TankLog l WHERE l.tankData.user.email = :email AND l.timestamp >= :from")
    List<TankLog> findByUserEmailAndTimestampAfter(@Param("email") String email, @Param("from") LocalDateTime from);

    // Keep these for backwards compatibility — results computed in AnalyticsService
    default Double getUsageToday(String tankId) { return null; }
    default Double getUsageYesterday(String tankId) { return null; }
    default Double getUsageTodayByEmail(String email) { return null; }
    default Double getUsageYesterdayByEmail(String email) { return null; }
    default List<Object[]> getWeeklyConsumption(String tankId) { return List.of(); }
    default List<Object[]> getWeeklyRefill(String tankId) { return List.of(); }
    default List<Object[]> getSixMonthUsage(String tankId) { return List.of(); }
    default List<Object[]> getSixMonthUsageByEmail(String email) { return List.of(); }
}
