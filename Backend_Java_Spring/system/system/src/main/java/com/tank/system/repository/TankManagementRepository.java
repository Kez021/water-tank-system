package com.tank.system.repository;

import com.tank.system.model.TankData;
import com.tank.system.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;

@Repository
public interface TankManagementRepository extends JpaRepository<TankData, Long> {

    /**
     * SEARCH BY HARDWARE ID
     */
    TankData findByTankId(String tankId);

    /**
     * DUPLICATE CHECK
     */
    boolean existsByTankId(String tankId);

    /**
     * DASHBOARD FILTERING BY EMAIL
     */
    List<TankData> findByUserEmail(String email);

    /**
     * OWNERSHIP VERIFICATION
     */
    List<TankData> findByUser(User user);

    /**
     * DELETE BY HARDWARE ID
     * Ito ang kailangang-kailangan para mawala ang error sa Controller (Line 124).
     */
    @Transactional
    void deleteByTankId(String tankId);
}