package com.tank.system.controller;

import com.tank.system.model.TankData;
import com.tank.system.model.TankLog;
import com.tank.system.dto.UsageHistoryDTO;
import com.tank.system.repository.TankManagementRepository;
import com.tank.system.repository.TankLogRepository;
import com.tank.system.service.AnalyticsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    @Autowired private TankLogRepository tankLogRepository;
    @Autowired private TankManagementRepository tankRepository;
    @Autowired private AnalyticsService analyticsService;

    @GetMapping("/stats")
    public Map<String, Object> getTankStats(@RequestParam String tankId, @RequestParam(required = false) String email) {
        Map<String, Object> stats = new HashMap<>();
        double todayUsage, yesterdayUsage;
        List<TankLog> logs;

        if ("all".equalsIgnoreCase(tankId)) {
            todayUsage = analyticsService.getUsageTodayByEmail(email);
            yesterdayUsage = analyticsService.getUsageYesterdayByEmail(email);
            logs = tankLogRepository.findAllByUserEmail(email);
        } else {
            todayUsage = analyticsService.getUsageToday(tankId);
            yesterdayUsage = analyticsService.getUsageYesterday(tankId);
            logs = tankLogRepository.findByTankId(tankId);
        }

        String trendLabel = "Stable";
        if (yesterdayUsage > 0) {
            double trend = ((todayUsage - yesterdayUsage) / yesterdayUsage) * 100;
            trendLabel = String.format("%s%.1f%%", (trend >= 0 ? "+" : ""), trend);
        } else if (todayUsage > 0) {
            trendLabel = "+100%";
        }

        double totalAllTimeConsumption = logs.stream()
                .mapToDouble(log -> log.getUsageAmount() != null ? log.getUsageAmount() : 0.0).sum();

        long issueCount = logs.stream()
                .filter(l -> l.getStatus() != null && !l.getStatus().equalsIgnoreCase("Success")).count();

        double efficiency = Math.max(10.0, Math.min(100.0, 100.0 - (issueCount * 2.0)));

        stats.put("totalConsumption", String.format("%.1f L", todayUsage));
        stats.put("avgDailyUsage", String.format("%.1f L", totalAllTimeConsumption / 7.0));
        stats.put("monthlyTrend", trendLabel);
        stats.put("efficiencyScore", String.format("%.0f%%", efficiency));
        return stats;
    }

    @GetMapping("/insights")
    public List<String> getUsageInsights(@RequestParam String tankId, @RequestParam(required = false) String email) {
        List<String> insights = new ArrayList<>();

        if ("all".equalsIgnoreCase(tankId)) {
            List<TankData> tanks = tankRepository.findByUserEmail(email);
            insights.add("System Overview: Monitoring " + (tanks != null ? tanks.size() : 0) + " active tanks.");
            insights.add("Insight: Your total system consumption is being tracked across all hardware units.");
            return insights;
        }

        TankData tank = tankRepository.findByTankId(tankId);
        List<TankLog> recentLogs = tankLogRepository.findTop10ByTankIdOrderByTimestampDesc(tankId);

        if (tank == null) return Arrays.asList("No tank data found for insights.");

        if (tank.getWaterLevel() <= tank.getLowerThreshold() + 10) {
            insights.add("CRITICAL: Your tank is near its lower threshold. Auto-refill should trigger soon.");
        } else {
            insights.add("Current status: The water level is healthy and within normal parameters.");
        }

        double todayUsage = recentLogs.stream()
                .mapToDouble(l -> l.getUsageAmount() != null ? l.getUsageAmount() : 0.0).sum();

        if (todayUsage > 100.0) {
            insights.add("ADVICE: High water consumption detected today. Check for possible leaks or heavy usage.");
        }

        if (tank.getIsAutomatic() != null && tank.getIsAutomatic()) {
            insights.add("System efficiency is optimized via Automatic Mode targeting " + tank.getUpperThreshold() + "% capacity.");
        } else {
            insights.add("NOTICE: Manual Mode is active. Remember to monitor levels to prevent pump dry-run.");
        }

        insights.add("Tip: Peak water usage is usually recorded in the morning. Ensure thresholds are set correctly.");
        return insights;
    }

    @GetMapping("/distribution")
    public Map<String, Double> getDistribution(@RequestParam String email) {
        List<TankData> tanks = tankRepository.findByUserEmail(email);
        Map<String, Double> distribution = new HashMap<>();

        if (tanks.size() <= 1) {
            for (TankData t : tanks) {
                distribution.put("Water Level (%)", t.getWaterLevel());
                distribution.put("Empty Space (%)", 100.0 - t.getWaterLevel());
            }
        } else {
            for (TankData t : tanks) {
                List<TankLog> logs = tankLogRepository.findByTankId(t.getTankId());
                double consumption = logs.stream()
                        .mapToDouble(l -> l.getUsageAmount() != null ? l.getUsageAmount() : 0.0).sum();
                distribution.put(t.getTankName(), consumption);
            }
        }
        return distribution;
    }

    @GetMapping("/history")
    public UsageHistoryDTO getUsageHistory(@RequestParam String tankId) {
        List<Object[]> consumptionRaw = analyticsService.getWeeklyConsumption(tankId);
        List<Object[]> refillRaw = analyticsService.getWeeklyRefill(tankId);

        List<String> labels = new ArrayList<>();
        List<Double> consumptionData = new ArrayList<>();
        List<Double> refillData = new ArrayList<>();

        for (Object[] row : consumptionRaw) {
            labels.add(row[0].toString());
            consumptionData.add(((Number) row[1]).doubleValue());
        }
        for (Object[] row : refillRaw) {
            refillData.add(((Number) row[1]).doubleValue());
        }

        if (labels.isEmpty()) {
            labels = Arrays.asList("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun");
            consumptionData = Arrays.asList(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
            refillData = Arrays.asList(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        }

        return new UsageHistoryDTO(labels, consumptionData, refillData);
    }

    @GetMapping("/monthly-trend")
    public Map<String, Object> getMonthlyTrend(@RequestParam String tankId, @RequestParam(required = false) String email) {
        List<Object[]> rawData;

        if ("all".equalsIgnoreCase(tankId)) {
            rawData = analyticsService.getSixMonthUsageByEmail(email);
        } else {
            rawData = analyticsService.getSixMonthUsage(tankId);
        }

        List<String> labels = new ArrayList<>();
        List<Double> values = new ArrayList<>();

        for (Object[] row : rawData) {
            labels.add(row[0].toString());
            values.add(((Number) row[1]).doubleValue());
        }

        if (labels.isEmpty()) {
            labels = Arrays.asList("Nov", "Dec", "Jan", "Feb", "Mar", "Apr");
            values = Arrays.asList(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("labels", labels);
        response.put("data", values);
        return response;
    }
}
