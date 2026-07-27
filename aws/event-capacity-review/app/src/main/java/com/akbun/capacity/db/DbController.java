package com.akbun.capacity.db;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Connection-bound endpoint. SELECT SLEEP holds one Hikari connection
 * and one Tomcat thread for the whole delay, so the pool saturates
 * long before CPU does - the bottleneck that scale out multiplies
 * into more DB connections instead of dividing.
 */
@RestController
@RequestMapping("/api/db")
public class DbController {

  private final JdbcTemplate jdbcTemplate;

  public DbController(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @GetMapping
  public DbResponse query(@RequestParam(defaultValue = "200") int delayMs) {
    long startedAt = System.nanoTime();
    jdbcTemplate.queryForObject("SELECT SLEEP(? / 1000)", Integer.class, delayMs);
    long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;
    return new DbResponse(delayMs, elapsedMs);
  }

  public record DbResponse(int delayMs, long elapsedMs) {}
}
