package com.tank.system.service;

import com.tank.system.model.TankLog;
import com.tank.system.repository.TankLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * ANALYTICS SERVICE
 * All date/time math done in Java — works on both H2 (local) and PostgreSQL (prod).
 */
@Service
public class AnalyticsService {

    @Autowired
    private TankLogRepository tankLogRepository;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("MMM yyyy");

    // ── TODAY / YESTERDAY ────────────────────────────────────────────

    public double getUsageToday(String tankId) {
        LocalDateTime startOfDay = LocalDateTime.now().toLocalDate().atStartOfDay();
        LocalDateTime endOfDay = startOfDay.plusDays(1);
        return tankLogRepository.findByTankIdAndTimestampBetween(tankId, startOfDay, endOfDay)
                .stream().mapToDouble(l -> l.getUsageAmount() != null ? l.getUsageAmount() : 0.0).sum();
    }

    public double getUsageYesterday(String tankId) {
        LocalDateTime startOfYesterday = LocalDateTime.now().toLocalDate().minusDays(1).atStartOfDay();
        LocalDateTime endOfYesterday = startOfYesterday.plusDays(1);
        return tankLogRepository.findByTankIdAndTimestampBetween(tankId, startOfYesterday, endOfYesterday)
                .stream().mapToDouble(l -> l.getUsageAmount() != null ? l.getUsageAmount() : 0.0).sum();
    }

    public double getUsageTodayByEmail(String email) {
        LocalDateTime startOfDay = LocalDateTime.now().toLocalDate().atStartOfDay();
        LocalDateTime endOfDay = startOfDay.plusDays(1);
        return tankLogRepository.findByUserEmailAndTimestampBetween(email, startOfDay, endOfDay)
                .stream().mapToDouble(l -> l.getUsageAmount() != null ? l.getUsageAmount() : 0.0).sum();
    }

    public double getUsageYesterdayByEmail(String email) {
        LocalDateTime startOfYesterday = LocalDateTime.now().toLocalDate().minusDays(1).atStartOfDay();
        LocalDateTime endOfYesterday = startOfYesterday.plusDays(1);
        return tankLogRepository.findByUserEmailAndTimestampBetween(email, startOfYesterday, endOfYesterday)
                .stream().mapToDouble(l -> l.getUsageAmount() != null ? l.getUsageAmount() : 0.0).sum();
    }

    // ── WEEKLY CONSUMPTION (last 30 days, grouped by date) ───────────

    public List<Object[]> getWeeklyConsumption(String tankId) {
        LocalDateTime from = LocalDateTime.now().minusDays(30);
        List<TankLog> logs = tankLogRepository.findByTankIdAndTimestampAfter(tankId, from);
        return groupByDate(logs);
    }

    public List<Object[]> getWeeklyRefill(String tankId) {
        LocalDateTime from = LocalDateTime.now().minusDays(30);
        List<TankLog> logs = tankLogRepository.findByTankIdAndTimestampAfter(tankId, from)
                .stream()
                .filter(l -> l.getAction() != null &&
                        (l.getAction().contains("Refill") || l.getAction().contains("Trigger")))
                .collect(Collectors.toList());
        return groupByDate(logs);
    }

    // ── 6-MONTH TREND ────────────────────────────────────────────────

    public List<Object[]> getSixMonthUsage(String tankId) {
        LocalDateTime from = LocalDateTime.now().minusMonths(6);
        List<TankLog> logs = tankLogRepository.findByTankIdAndTimestampAfter(tankId, from);
        return groupByMonth(logs);
    }

    public List<Object[]> getSixMonthUsageByEmail(String email) {
        LocalDateTime from = LocalDateTime.now().minusMonths(6);
        List<TankLog> logs = tankLogRepository.findByUserEmailAndTimestampAfter(email, from);
        return groupByMonth(logs);
    }

    // ── HELPERS ──────────────────────────────────────────────────────

    private List<Object[]> groupByDate(List<TankLog> logs) {
        Map<String, Double> grouped = new LinkedHashMap<>();
        for (TankLog l : logs) {
            if (l.getTimestamp() == null) continue;
            String key = l.getTimestamp().format(DATE_FMT);
            grouped.merge(key, l.getUsageAmount() != null ? l.getUsageAmount() : 0.0, Double::sum);
        }
        return grouped.entrySet().stream()
                .map(e -> new Object[]{e.getKey(), e.getValue()})
                .collect(Collectors.toList());
    }

    private List<Object[]> groupByMonth(List<TankLog> logs) {
        // Use a sorted map keyed by year-month for correct ordering
        Map<String, double[]> grouped = new TreeMap<>();
        for (TankLog l : logs) {
            if (l.getTimestamp() == null) continue;
            String sortKey = l.getTimestamp().format(DateTimeFormatter.ofPattern("yyyy-MM"));
            String label = l.getTimestamp().format(MONTH_FMT);
            grouped.computeIfAbsent(sortKey, k -> new double[]{0.0, 0.0});
            grouped.get(sortKey)[0] += l.getUsageAmount() != null ? l.getUsageAmount() : 0.0;
            grouped.get(sortKey)[1] = 0; // placeholder, label stored separately
        }

        // Build label map
        Map<String, String> labelMap = new LinkedHashMap<>();
        for (TankLog l : logs) {
            if (l.getTimestamp() == null) continue;
            String sortKey = l.getTimestamp().format(DateTimeFormatter.ofPattern("yyyy-MM"));
            labelMap.putIfAbsent(sortKey, l.getTimestamp().format(MONTH_FMT));
        }

        return grouped.entrySet().stream()
                .map(e -> new Object[]{labelMap.get(e.getKey()), e.getValue()[0]})
                .collect(Collectors.toList());
    }
}
