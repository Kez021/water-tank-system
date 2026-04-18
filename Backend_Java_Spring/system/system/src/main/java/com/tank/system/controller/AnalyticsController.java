package com.tank.system.controller;

import com.tank.system.model.TankData;
import com.tank.system.model.TankLog;
import com.tank.system.dto.UsageHistoryDTO; // Imported successfully
import com.tank.system.repository.TankManagementRepository;
import com.tank.system.repository.TankLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;
/**
 * ANALYTICS CONTROLLER
 * Processes historical logs and tank states to generate real-time insights.
 */
@RestController
@RequestMapping("/api/analytics")

public class AnalyticsController {

    @Autowired
    private TankLogRepository tankLogRepository;

    @Autowired
    private TankManagementRepository tankRepository;
    /**
     * DYNAMIC STATS BOXES - FORMULA CALCULATIONS:@RequestMapping("/api/analytics")
     * * 1. TOTAL CONSUMPTION (24h):
     * Formula: Sum of (Previous_Level - Current_Level) where Previous > Current.
     * Logic: Tracks every time the water level drops (usage) within the last 24 hours.
     * * 2. AVERAGE DAILY USAGE:
     * Formula: Total_Consumption_All_Time / Number_of_Days_Active.
     * Logic: Provides a baseline of how much water is typically used per day.
     * * 3. SYSTEM EFFICIENCY:
     * Formula: (Actual_Pump_Runtime / Ideal_Pump_Runtime) * 100.
     * Logic: Measures if the pump is cycling too frequently (short cycling) or running optimally.
     * * 4. USAGE TREND (%):
     * Formula: ((Today_Usage - Yesterday_Usage) / Yesterday_Usage) * 100.
     * Logic: Shows if consumption is increasing or decreasing compared to the previous day.
     */
    /**
     * DYNAMIC STATS CALCULATION
     * Fetches real-time consumption data and compares it with historical logs
     * to generate trends and efficiency metrics for the dashboard.
     */
    @GetMapping("/stats")
    public Map<String, Object> getTankStats(@RequestParam String tankId, @RequestParam(required = false) String email) {
        Map<String, Object> stats = new HashMap<>();
        Double todayUsage, yesterdayUsage;
        List<TankLog> logs;

        // 1. DATA ROUTING: Check if 'Overall' (all) or Specific Tank
        if ("all".equalsIgnoreCase(tankId)) {
            todayUsage = tankLogRepository.getUsageTodayByEmail(email);
            yesterdayUsage = tankLogRepository.getUsageYesterdayByEmail(email);
            logs = tankLogRepository.findAllByUserEmail(email);
        } else {
            todayUsage = tankLogRepository.getUsageToday(tankId);
            yesterdayUsage = tankLogRepository.getUsageYesterday(tankId);
            logs = tankLogRepository.findByTankId(tankId);
        }

        // Ensure values are not null to avoid calculation errors
        todayUsage = (todayUsage != null) ? todayUsage : 0.0;
        yesterdayUsage = (yesterdayUsage != null) ? yesterdayUsage : 0.0;

        // 2. CALCULATE USAGE TREND PERCENTAGE (%)
        String trendLabel = "Stable";
        if (yesterdayUsage > 0) {
            double trend = ((todayUsage - yesterdayUsage) / yesterdayUsage) * 100;
            trendLabel = String.format("%s%.1f%%", (trend >= 0 ? "+" : ""), trend);
        } else if (todayUsage > 0) {
            trendLabel = "+100%";
        }

        // 3. CALCULATE OVERALL CONSUMPTION & SYSTEM EFFICIENCY
        double totalAllTimeConsumption = logs.stream()
                .mapToDouble(log -> log.getUsageAmount() != null ? log.getUsageAmount() : 0.0)
                .sum();

        // 4. DYNAMIC EFFICIENCY LOGIC
        double efficiency = 100.0;
        long issueCount = logs.stream()
                .filter(l -> l.getStatus() != null && !l.getStatus().equalsIgnoreCase("Success"))
                .count();

        efficiency = 100.0 - (issueCount * 2.0);
        if (efficiency > 100.0) efficiency = 100.0;
        if (efficiency < 10.0) efficiency = 10.0;

        // 5. MAP CALCULATED VALUES TO DASHBOARD UI KEYS
        stats.put("totalConsumption", String.format("%.1f L", todayUsage));
        stats.put("avgDailyUsage", String.format("%.1f L", totalAllTimeConsumption / 7.0));
        stats.put("monthlyTrend", trendLabel);
        stats.put("efficiencyScore", String.format("%.0f%%", efficiency));

        return stats;
    }

    /**
     * DYNAMIC USAGE INSIGHTS
     * Generates human-readable advice based on the tank's current configuration and logs.
     */
    @GetMapping("/insights")
    public List<String> getUsageInsights(@RequestParam String tankId, @RequestParam(required = false) String email) {
        List<String> insights = new ArrayList<>();

        // 1. GENERATE OVERALL SYSTEM INSIGHTS IF TANK_ID IS 'ALL'
        if ("all".equalsIgnoreCase(tankId)) {
            List<TankData> tanks = tankRepository.findByUserEmail(email);
            insights.add("System Overview: Monitoring " + (tanks != null ? tanks.size() : 0) + " active tanks.");
            insights.add("Insight: Your total system consumption is being tracked across all hardware units.");
            return insights;
        }

        // 2. FETCH DATA FOR SPECIFIC TANK (Fixes the "red" error in IDE)
        TankData tank = tankRepository.findByTankId(tankId);
        List<TankLog> recentLogs = tankLogRepository.findTop10ByTankIdOrderByTimestampDesc(tankId);

        // 3. VALIDATE IF TANK EXISTS
        if (tank == null) {
            return Arrays.asList("No tank data found for insights.");
        }

        // 4. CONDITION 1: Check if the tank is near the lower threshold
        if (tank.getWaterLevel() <= tank.getLowerThreshold() + 10) {
            insights.add("CRITICAL: Your tank is near its lower threshold. Auto-refill should trigger soon.");
        } else {
            insights.add("Current status: The water level is healthy and within normal parameters.");
        }

        // 5. CONDITION 2: Check for high consumption alerts
        double todayUsage = recentLogs.stream()
                .mapToDouble(l -> l.getUsageAmount() != null ? l.getUsageAmount() : 0.0)
                .sum();

        if (todayUsage > 100.0) {
            insights.add("ADVICE: High water consumption detected today. Check for possible leaks or heavy usage.");
        }

        // 6. CONDITION 3: System Efficiency Insight
        if (tank.getIsAutomatic() != null && tank.getIsAutomatic()) {
            insights.add("System efficiency is optimized via Automatic Mode targeting " + tank.getUpperThreshold() + "% capacity.");
        } else {
            insights.add("NOTICE: Manual Mode is active. Remember to monitor levels to prevent pump dry-run.");
        }

        // 7. CONDITION 4: Predictive Tip
        insights.add("Tip: Peak water usage is usually recorded in the morning. Ensure thresholds are set correctly.");

        return insights;
    }

    /**
     * DOUGHNUT CHART LOGIC (DISTRIBUTION)
     * Compares usage between multiple tanks or shows Fill vs Empty ratio if only one tank exists.
     */
    @GetMapping("/distribution")
    public Map<String, Double> getDistribution(@RequestParam String email) {
        List<TankData> tanks = tankRepository.findByUserEmail(email);
        Map<String, Double> distribution = new HashMap<>();

        if (tanks.size() <= 1) {
            // If only 1 tank, show Fill Level vs Empty Space for the doughnut chart
            for (TankData t : tanks) {
                distribution.put("Water Level (%)", t.getWaterLevel());
                distribution.put("Empty Space (%)", 100.0 - t.getWaterLevel());
            }
        } else {
            // If multiple tanks, show the consumption ratio of each tank
            for (TankData t : tanks) {
                List<TankLog> logs = tankLogRepository.findByTankId(t.getTankId());
                double consumption = logs.stream()
                        .mapToDouble(l -> l.getUsageAmount() != null ? l.getUsageAmount() : 0.0)
                        .sum();

                distribution.put(t.getTankName(), consumption);
            }
        }
        return distribution;
    }

    /**
     * LINE CHART LOGIC
     * Aggregates consumption data points for the 7-day trend chart.
     */
    @GetMapping("/history")
    public UsageHistoryDTO getUsageHistory(@RequestParam String tankId) {

        List<Object[]> consumptionRaw = tankLogRepository.getWeeklyConsumption(tankId);
        List<Object[]> refillRaw = tankLogRepository.getWeeklyRefill(tankId);

        List<String> labels = new ArrayList<>();
        List<Double> consumptionData = new ArrayList<>();
        List<Double> refillData = new ArrayList<>();

        // 2. I-process ang Consumption data (Blue Bars)
        for (Object[] row : consumptionRaw) {
            labels.add(row[0].toString());
            consumptionData.add(((Number) row[1]).doubleValue());
        }

        // 3. I-process ang Refill data (Green Bars)

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

    /**
     * LONG-TERM USAGE TREND (6-MONTH)
     * Aggregates total water consumption per month for long-term sensor data tracking.
     * This ensures each user sees their unique historical trend.
     */
    @GetMapping("/monthly-trend")
    public Map<String, Object> getMonthlyTrend(@RequestParam String tankId, @RequestParam(required = false) String email) {
        List<Object[]> rawData;

        /* * 1. DATA ROUTING:
         * Determine whether to fetch aggregated data for all tanks based on user email
         * or filtered data for a specific tank ID.
         */
        if ("all".equalsIgnoreCase(tankId)) {
            // Fetch multi-tank consumption data using the user's email
            rawData = tankLogRepository.getSixMonthUsageByEmail(email);
        } else {
            // Fetch historical data for a specific tank instance
            rawData = tankLogRepository.getSixMonthUsage(tankId);
        }

        List<String> labels = new ArrayList<>();
        List<Double> values = new ArrayList<>();

        /* * 2. DATA PROCESSING:
         * Iterate through the database result set to populate labels (Month-Year)
         * and usage values (Total Liters).
         */
        for (Object[] row : rawData) {
            labels.add(row[0].toString());
            values.add(((Number) row[1]).doubleValue());
        }

        /* * 3. DYNAMIC FALLBACK:
         * If no logs are found in the database, provide a default 6-month range
         * including the current month (April 2026) to prevent empty charts.
         */
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