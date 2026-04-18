package com.tank.system.dto;

import java.util.List;

/**
 * USAGE HISTORY DATA TRANSFER OBJECT (DTO)
 * Synchronized with dashboard.js to provide dynamic chart data.
 * The variable names here MUST match the keys used in the frontend fetch logic.
 */
public class UsageHistoryDTO {


    // The X-axis labels (e.g., "2026-03-17" or "Mon", "Tue")
    private List<String> labels;

    // Matches 'logs.consumptionData' in dashboard.js (Blue bars)
    private List<Double> consumptionData;

    // Matches 'logs.refillData' in dashboard.js (Green bars)
    private List<Double> refillData;

    /**
     * Default constructor required for JSON serialization/deserialization.
     */
    public UsageHistoryDTO() {}

    /**
     * Overloaded constructor to quickly initialize chart data from the Controller.
     */
    public UsageHistoryDTO(List<String> labels, List<Double> consumptionData, List<Double> refillData) {
        this.labels = labels;
        this.consumptionData = consumptionData;
        this.refillData = refillData;
    }

    // --- GETTERS AND SETTERS ---
    // Jackson uses these to generate the JSON keys for the API response.

    public List<String> getLabels() {
        return labels;
    }

    public void setLabels(List<String> labels) {
        this.labels = labels;
    }

    public List<Double> getConsumptionData() {
        return consumptionData;
    }

    public void setConsumptionData(List<Double> consumptionData) {
        this.consumptionData = consumptionData;
    }

    public List<Double> getRefillData() {
        return refillData;
    }

    public void setRefillData(List<Double> refillData) {
        this.refillData = refillData;
    }
}