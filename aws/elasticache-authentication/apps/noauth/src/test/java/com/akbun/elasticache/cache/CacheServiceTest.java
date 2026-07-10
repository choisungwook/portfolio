package com.akbun.elasticache.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

@ExtendWith(MockitoExtension.class)
class CacheServiceTest {

  @Mock
  private StringRedisTemplate redisTemplate;

  @Mock
  private ValueOperations<String, String> valueOperations;

  private CacheService cacheService;

  @BeforeEach
  void setUp() {
    when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    cacheService = new CacheService(redisTemplate);
  }

  @Test
  void storesAValueForTenMinutes() {
    cacheService.put("greeting", "hello");

    verify(valueOperations).set("greeting", "hello", Duration.ofMinutes(10));
  }

  @Test
  void returnsAStoredValue() {
    when(valueOperations.get("greeting")).thenReturn("hello");

    assertThat(cacheService.get("greeting")).contains("hello");
  }

  @Test
  void returnsEmptyWhenAKeyDoesNotExist() {
    when(valueOperations.get("missing")).thenReturn(null);

    assertThat(cacheService.get("missing")).isEmpty();
  }
}
