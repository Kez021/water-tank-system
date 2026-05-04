package com.tank.system.repository;

import com.tank.system.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;



/**
 * USER REPOSITORY interface
 * Provides the abstraction layer for database operations on the 'users' table.
 * Extends JpaRepository to leverage built-in CRUD functionalities.
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Retrieves a user based on their unique email address.
     * Used for authentication and profile synchronization.
     * @param email The registered email of the user.
     * @return An Optional containing the User if found.
     */
    Optional<User> findByEmail(String email);

    /**
     * Checks if an email already exists in the system.
     * Prevents duplicate registration during the sign-up process.
     * @param email The email to verify.
     * @return true if the email exists, false otherwise.
     */
    boolean existsByEmail(String email);
}

