package com.akbun.elasticache.cache;

import java.time.Duration;
import java.util.Optional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class CacheService {

  private static final Duration ENTRY_TTL = Duration.ofMinutes(10);

  private final StringRedisTemplate redisTemplate;

  public CacheService(StringRedisTemplate redisTemplate) {
    this.redisTemplate = redisTemplate;
  }

  public void put(String key, String value) {
    redisTemplate.opsForValue().set(key, value, ENTRY_TTL);
  }

  public Optional<String> get(String key) {
    return Optional.ofNullable(redisTemplate.opsForValue().get(key));
  }
}
