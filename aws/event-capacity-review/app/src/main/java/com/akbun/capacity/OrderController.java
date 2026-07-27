package com.akbun.capacity;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The API on EC2. A request is served from cache, or it borrows a connection from a
 * bounded pool and calls the shared downstream. Both bounds are the ones you size
 * before an event: Tomcat threads and the connection pool.
 */
@RestController
@Profile("app")
class OrderController {

  private final Counters counters = new Counters();
  private final Semaphore pool;
  private final HttpClient http;
  private final URI downstream;
  private final long poolTimeoutMs;
  private final double cacheHitRatio;
  private final long cacheLatencyMs;

  OrderController(
      @Value("${lab.pool.size:10}") int poolSize,
      @Value("${lab.pool.timeout-ms:3000}") long poolTimeoutMs,
      @Value("${lab.cache.hit-ratio:0.0}") double cacheHitRatio,
      @Value("${lab.cache.latency-ms:1}") long cacheLatencyMs,
      @Value("${lab.downstream.url:http://127.0.0.1:9000/query}") String downstreamUrl,
      @Value("${lab.downstream.timeout-ms:5000}") long downstreamTimeoutMs) {
    this.pool = new Semaphore(poolSize);
    this.poolTimeoutMs = poolTimeoutMs;
    this.cacheHitRatio = cacheHitRatio;
    this.cacheLatencyMs = cacheLatencyMs;
    this.downstream = URI.create(downstreamUrl);
    this.http = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofMillis(downstreamTimeoutMs))
        .build();
  }

  @GetMapping("/order")
  ResponseEntity<String> order() throws InterruptedException {
    counters.enter();
    try {
      if (ThreadLocalRandom.current().nextDouble() < cacheHitRatio) {
        return serveFromCache();
      }
      return serveFromDownstream();
    } finally {
      counters.leave();
    }
  }

  private ResponseEntity<String> serveFromCache() throws InterruptedException {
    Thread.sleep(cacheLatencyMs);
    counters.cacheHits.incrementAndGet();
    return ResponseEntity.ok("cache");
  }

  private ResponseEntity<String> serveFromDownstream() throws InterruptedException {
    if (!acquireConnection()) {
      counters.rejected.incrementAndGet();
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("pool-timeout");
    }
    try {
      return callDownstream();
    } finally {
      pool.release();
    }
  }

  private boolean acquireConnection() throws InterruptedException {
    counters.beginWait();
    try {
      return pool.tryAcquire(poolTimeoutMs, TimeUnit.MILLISECONDS);
    } finally {
      counters.endWait();
    }
  }

  private ResponseEntity<String> callDownstream() throws InterruptedException {
    HttpRequest request = HttpRequest.newBuilder(downstream).GET().build();
    try {
      HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
      return ResponseEntity.status(response.statusCode()).body(response.body());
    } catch (IOException e) {
      counters.failed.incrementAndGet();
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body("downstream-error");
    }
  }

  @GetMapping("/stats")
  Map<String, Number> stats() {
    Map<String, Number> out = counters.snapshot();
    out.put("pool_available", pool.availablePermits());
    return out;
  }

  @PostMapping("/reset")
  Map<String, Number> reset() {
    counters.reset();
    return counters.snapshot();
  }
}
