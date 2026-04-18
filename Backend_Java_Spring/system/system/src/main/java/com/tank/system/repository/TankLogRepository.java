package com.tank.system.repository;

import com.tank.system.model.TankLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Repository
public interface TankLogRepository extends JpaRepository<TankLog, Long> {

    /* ==========================================================
       BASIC PERSISTENCE QUERIES
       ========================================================== */

    List<TankLog> findByTankId(String tankId);

    List<TankLog> findAllByTankIdIn(List<String> tankIds);

    /**
     * FETCHES ALL LOGS FOR A SPECIFIC USER
     * Ensures the dashboard displays the latest events (March 28) first.
     */
    @Query("SELECT l FROM TankLog l WHERE l.tankData.user.email = :email ORDER BY l.timestamp DESC")
    List<TankLog> findAllByTankData_User_EmailOrderByTimestampDesc(@Param("email") String email);

    /**
     * Retrieves all system logs sorted by the most recent timestamp.
     */
    List<TankLog> findAllByOrderByTimestampDesc();

    List<TankLog> findByTankIdOrderByTimestampDesc(String tankId);

    List<TankLog> findTop10ByTankIdOrderByTimestampDesc(String tankId);

    /* ==========================================================
       DATA MAINTENANCE & PURGE QUERIES
       ========================================================== */

    @Modifying
    @Transactional
    void deleteByTankId(String tankId);

    @Modifying
    @Transactional
    @Query("DELETE FROM TankLog l WHERE l.tankData.id = :tankId")
    void deleteByTankData_Id(@Param("tankId") Long tankId);

    @Modifying
    @Transactional
    @Query("DELETE FROM TankLog l WHERE l.tankData.tankId = :tankId AND l.timestamp < :cutoffDate")
    void deleteByTankIdAndTimestampBefore(@Param("tankId") String tankId, @Param("cutoffDate") java.time.LocalDateTime cutoffDate);

    /**
     * Maintenance query to keep the database lean by removing old records.
     */
    @Modifying
    @Transactional
    void deleteByIdNotIn(List<Long> ids);
    /* ==========================================================
       ANALYTICS & DATA VISUALIZATION QUERIES
       ========================================================== */

    /**
     * FETCH WEEKLY CONSUMPTION
     * Aggregates total usage_amount grouped by date for the last 30 days.
     */
    @Query(value = "SELECT FORMATDATETIME(timestamp, 'yyyy-MM-dd') as logDate, SUM(usage_amount) " +
            "FROM tank_logs WHERE tank_id = :tankId " +
            "AND timestamp >= CURRENT_DATE - 30 " +
            "GROUP BY logDate ORDER BY logDate ASC", nativeQuery = true)
    List<Object[]> getWeeklyConsumption(@Param("tankId") String tankId);

    /**
     * FETCH WEEKLY REFILL TRENDS
     * Identifies refill events based on system actions and calculates estimated volume.
     */
    @Query(value = "SELECT FORMATDATETIME(timestamp, 'yyyy-MM-dd') as logDate, SUM(usage_amount) " +
            "FROM tank_logs WHERE tank_id = :tankId " +
            "AND (action LIKE '%Refill%' OR action LIKE '%Trigger%') " +
            "AND timestamp >= CURRENT_DATE - 30 " +
            "GROUP BY logDate ORDER BY logDate ASC", nativeQuery = true)
    List<Object[]> getWeeklyRefill(@Param("tankId") String tankId);

    /**
     * FETCH 6-MONTH USAGE TREND
     * Aggregates total water consumption per month for long-term sensor data tracking.
     * This ensures each user sees their unique historical trend.
     */
    @Query(value = "SELECT FORMATDATETIME(timestamp, 'MMM yyyy') as monthYear, SUM(usage_amount) " +
            "FROM tank_logs WHERE tank_id = :tankId " +
            "GROUP BY FORMATDATETIME(timestamp, 'MMM yyyy'), MONTH(timestamp), YEAR(timestamp) " +
            "ORDER BY YEAR(timestamp) ASC, MONTH(timestamp) ASC LIMIT 6", nativeQuery = true)
    List<Object[]> getSixMonthUsage(@Param("tankId") String tankId);

    /**
     * GET TOTAL USAGE FOR TODAY
     */
    @Query(value = "SELECT COALESCE(SUM(usage_amount), 0.0) FROM tank_logs " +
            "WHERE tank_id = :tankId AND FORMATDATETIME(timestamp, 'yyyy-MM-dd') = CURRENT_DATE", nativeQuery = true)
    Double getUsageToday(@Param("tankId") String tankId);

    /**
     * GET TOTAL USAGE FOR YESTERDAY
     */
    @Query(value = "SELECT COALESCE(SUM(usage_amount), 0.0) FROM tank_logs " +
            "WHERE tank_id = :tankId AND FORMATDATETIME(timestamp, 'yyyy-MM-dd') = CURRENT_DATE - 1", nativeQuery = true)
    Double getUsageYesterday(@Param("tankId") String tankId);

   /* ==========================================================
       NEW OVERALL ANALYTICS QUERIES (MULTI-TANK BY EMAIL)
       ========================================================== */


    @Query(value = "SELECT COALESCE(SUM(l.usage_amount), 0.0) FROM tank_logs l " +
            "JOIN tank_data t ON l.tank_id = t.tank_id " +
            "WHERE t.user_id = (SELECT id FROM users WHERE email = :email) " +
            "AND FORMATDATETIME(l.timestamp, 'yyyy-MM-dd') = CURRENT_DATE", nativeQuery = true)
    Double getUsageTodayByEmail(@Param("email") String email);

    @Query(value = "SELECT COALESCE(SUM(l.usage_amount), 0.0) FROM tank_logs l " +
            "JOIN tank_data t ON l.tank_id = t.tank_id " +
            "WHERE t.user_id = (SELECT id FROM users WHERE email = :email) " +
            "AND FORMATDATETIME(l.timestamp, 'yyyy-MM-dd') = CURRENT_DATE - 1", nativeQuery = true)
    Double getUsageYesterdayByEmail(@Param("email") String email);

    @Query("SELECT l FROM TankLog l WHERE l.tankData.user.email = :email")
    List<TankLog> findAllByUserEmail(@Param("email") String email);

    /**
     * "OVERALL ALL TANKS" (6-MONTH TREND)
     */
    @Query(value = "SELECT FORMATDATETIME(l.timestamp, 'MMM yyyy') as monthYear, SUM(l.usage_amount) " +
            "FROM tank_logs l " +
            "JOIN tank_data t ON l.tank_id = t.tank_id " +
            "WHERE t.user_id = (SELECT id FROM users WHERE email = :email) " +
            "GROUP BY monthYear, MONTH(l.timestamp), YEAR(l.timestamp) " +
            "ORDER BY YEAR(l.timestamp) ASC, MONTH(l.timestamp) ASC LIMIT 6", nativeQuery = true)
    List<Object[]> getSixMonthUsageByEmail(@Param("email") String email);
}



