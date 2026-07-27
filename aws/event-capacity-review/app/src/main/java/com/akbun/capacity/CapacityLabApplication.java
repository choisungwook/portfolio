package com.akbun.capacity;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * One jar, two roles. The "app" profile is the Spring Boot API that runs on EC2,
 * the "db" profile is the shared downstream that stands in for RDS.
 */
@SpringBootApplication
public class CapacityLabApplication {

  public static void main(String[] args) {
    SpringApplication.run(CapacityLabApplication.class, args);
  }
}
