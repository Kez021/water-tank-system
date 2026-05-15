package com.tank.system;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication(exclude = {UserDetailsServiceAutoConfiguration.class})
@EnableAsync
public class TankSystemApplication {

    public static void main(String[] args) {
        SpringApplication.run(TankSystemApplication.class, args);
        System.out.println("Regine Bagares");
        System.out.println("tabang Lord");
        System.out.println("sakit sa ulo ");


        System.out.println("Kesha Mae Bangcoyo");
        System.out.println("okay lang yan hahahhaha");
        System.out.println("kaya yan teh ");
    }
}
