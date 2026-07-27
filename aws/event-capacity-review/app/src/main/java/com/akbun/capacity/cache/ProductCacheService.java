package com.akbun.capacity.cache;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Read-through cache. A miss falls back to a deliberately slow DB read,
 * so when many keys expire at the same moment the miss storm lands on
 * the DB all at once - the cache stampede this lab reproduces.
 * TTL jitter spreads the expirations to break the storm.
 */
@Service
public class ProductCacheService {

  private static final String KEY_PREFIX = "product:";
  private static final int DB_READ_DELAY_MS = 100;

  private final StringRedisTemplate redisTemplate;
  private final JdbcTemplate jdbcTemplate;
  private final int ttlSeconds;
  private final double ttlJitterRatio;

  public ProductCacheService(
      StringRedisTemplate redisTemplate,
      JdbcTemplate jdbcTemplate,
      @Value("${cache.product.ttl-seconds}") int ttlSeconds,
      @Value("${cache.product.ttl-jitter-ratio}") double ttlJitterRatio
  ) {
    this.redisTemplate = redisTemplate;
    this.jdbcTemplate = jdbcTemplate;
    this.ttlSeconds = ttlSeconds;
    this.ttlJitterRatio = ttlJitterRatio;
  }

  public ProductResponse read(long id) {
    long startedAt = System.nanoTime();
    String key = KEY_PREFIX + id;

    String cached = redisTemplate.opsForValue().get(key);
    if (cached != null) {
      return new ProductResponse(id, cached, "cache", elapsedMsSince(startedAt));
    }

    String value = readFromDb(id);
    Duration ttl = Duration.ofMillis(CacheTtl.withJitter(ttlSeconds * 1000L, ttlJitterRatio));
    redisTemplate.opsForValue().set(key, value, ttl);
    return new ProductResponse(id, value, "db", elapsedMsSince(startedAt));
  }

  private String readFromDb(long id) {
    jdbcTemplate.queryForObject("SELECT SLEEP(? / 1000)", Integer.class, DB_READ_DELAY_MS);
    return "product-" + id;
  }

  private long elapsedMsSince(long startedAtNanos) {
    return (System.nanoTime() - startedAtNanos) / 1_000_000;
  }
}
