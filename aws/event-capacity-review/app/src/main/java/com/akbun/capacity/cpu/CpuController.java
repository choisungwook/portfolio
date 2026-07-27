package com.akbun.capacity.cpu;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * CPU-bound endpoint. Under load the container CPU saturates while
 * DB and Redis stay idle - the bottleneck that scale out divides.
 */
@RestController
@RequestMapping("/api/cpu")
public class CpuController {

  @GetMapping
  public CpuResponse burn(@RequestParam(defaultValue = "300000") int iterations) {
    long startedAt = System.nanoTime();
    byte[] payload = "event-capacity-review".getBytes(StandardCharsets.UTF_8);
    MessageDigest digest = sha256();
    for (int i = 0; i < iterations; i++) {
      payload = digest.digest(payload);
    }
    long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;
    return new CpuResponse(iterations, elapsedMs);
  }

  private MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is not available", e);
    }
  }

  public record CpuResponse(int iterations, long elapsedMs) {}
}
