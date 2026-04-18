package com.tank.system.controller;

import com.tank.system.model.TankLog;
import com.tank.system.repository.TankLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/logs")
@CrossOrigin(origins = "*")
public class TankLogController {

    @Autowired
    private TankLogRepository tankLogRepository;

    /**
     * FETCH MASTER ACTIVITY LOGS
     * Retrieves all system activities filtered by the authenticated user's email.
     * Records are sorted by timestamp in descending order to prioritize recent events.
     * * @param email The registered email address of the account owner.
     *
     * @return A list of TankLog entities belonging to the specified user.
     */
    @GetMapping("/all")
    public ResponseEntity<List<TankLog>> getAllLogs(@RequestParam String email) {
        // Core Logic: We update the method name to match the new Repository definition
        return ResponseEntity.ok(tankLogRepository.findAllByTankData_User_EmailOrderByTimestampDesc(email));
    }

    /**
     * FETCH UNIT-SPECIFIC LOGS
     * Retrieves the historical data for a specific hardware unit using its unique Tank ID.
     * This provides a granular view of operations for an individual sensor node.
     * * @param tankId The unique hardware identifier of the tank.
     *
     * @return A list of logs specifically associated with the provided Tank ID.
     */
    @GetMapping("/tank/{tankId}")
    public ResponseEntity<List<TankLog>> getLogsByTank(@PathVariable String tankId) {
        return ResponseEntity.ok(tankLogRepository.findByTankId(tankId));
    }
}
