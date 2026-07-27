package com.akbun.capacity.cache;

import java.util.concurrent.ThreadLocalRandom;

public final class CacheTtl {

  private CacheTtl() {}

  /**
   * Returns baseMillis extended by a random amount up to jitterRatio,
   * so that entries written together do not expire together.
   */
  public static long withJitter(long baseMillis, double jitterRatio) {
    if (baseMillis <= 0) {
      throw new IllegalArgumentException("baseMillis must be positive");
    }
    if (jitterRatio < 0 || jitterRatio > 1) {
      throw new IllegalArgumentException("jitterRatio must be between 0 and 1");
    }
    if (jitterRatio == 0) {
      return baseMillis;
    }
    long maxExtra = (long) (baseMillis * jitterRatio);
    return baseMillis + ThreadLocalRandom.current().nextLong(maxExtra + 1);
  }
}
