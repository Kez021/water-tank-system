package com.tank.system.repository;

import com.tank.system.model.TankData;
import com.tank.system.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Repository
public interface TankManagementRepository extends JpaRepository<TankData, Long> {

    TankData findByTankId(String tankId);

    boolean existsByTankId(String tankId);

    List<TankData> findByUserEmail(String email);

    List<TankData> findByUser(User user);

    @Transactional
    void deleteByTankId(String tankId);

    /**
     * PERMANENT FIX: Eagerly load the User in the same SQL query
     * using JOIN FETCH to avoid LazyInitializationException in AdminController.
     */
    @Query("SELECT t FROM TankData t LEFT JOIN FETCH t.user")
    List<TankData> findAllWithUser();
}
