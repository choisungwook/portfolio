package com.akbun.capacity.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

class CacheTtlTest {

  @Test
  void zeroJitterReturnsBaseAsIs() {
    assertThat(CacheTtl.withJitter(60_000, 0)).isEqualTo(60_000);
  }

  @RepeatedTest(20)
  void jitterStaysWithinRatio() {
    long ttl = CacheTtl.withJitter(60_000, 0.1);
    assertThat(ttl).isBetween(60_000L, 66_000L);
  }

  @Test
  void rejectsNonPositiveBase() {
    assertThatThrownBy(() -> CacheTtl.withJitter(0, 0.1))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void rejectsRatioOutOfRange() {
    assertThatThrownBy(() -> CacheTtl.withJitter(60_000, 1.5))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
