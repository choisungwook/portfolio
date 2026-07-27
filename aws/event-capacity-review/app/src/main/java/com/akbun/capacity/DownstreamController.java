package com.akbun.capacity;

import java.util.Map;
import java.util.concurrent.Semaphore;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The shared downstream that stands in for RDS. It has a fixed number of workers
 * (vCPU), a fixed service time per query, and a connection ceiling. Every app
 * instance shares this one process, which is the whole point of the lab.
 */
@RestController
@Profile("db")
class DownstreamController {

  private final Counters counters = new Counters();
  private final Semaphore workers;
  private final int maxConnections;
  private final long serviceMs;

  DownstreamController(
      @Value("${lab.db.workers:4}") int workers,
      @Value("${lab.db.max-connections:60}") int maxConnections,
      @Value("${lab.db.service-ms:20}") long serviceMs) {
    this.workers = new Semaphore(workers, true);
    this.maxConnections = maxConnections;
    this.serviceMs = serviceMs;
  }

  @GetMapping("/query")
  ResponseEntity<String> query() throws InterruptedException {
    if (counters.inFlight.get() >= maxConnections) {
      counters.rejected.incrementAndGet();
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("too-many-connections");
    }
    counters.enter();
    try {
      return ResponseEntity.ok(runQuery());
    } finally {
      counters.leave();
    }
  }

  private String runQuery() throws InterruptedException {
    counters.beginWait();
    workers.acquire();
    counters.endWait();
    try {
      Thread.sleep(serviceMs);
      return "rows";
    } finally {
      workers.release();
    }
  }

  @GetMapping("/stats")
  Map<String, Number> stats() {
    Map<String, Number> out = counters.snapshot();
    out.put("workers_available", workers.availablePermits());
    out.put("max_connections", maxConnections);
    return out;
  }

  @PostMapping("/reset")
  Map<String, Number> reset() {
    counters.reset();
    return counters.snapshot();
  }
}
