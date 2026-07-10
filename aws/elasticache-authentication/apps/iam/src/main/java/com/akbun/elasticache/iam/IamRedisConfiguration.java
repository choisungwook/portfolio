package com.akbun.elasticache.iam;

import io.lettuce.core.RedisCredentialsProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.data.redis.autoconfigure.LettuceClientConfigurationBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConfiguration;
import org.springframework.data.redis.connection.lettuce.RedisCredentialsProviderFactory;

@Configuration(proxyBeanMethods = false)
public class IamRedisConfiguration {

  @Bean
  ElastiCacheIamTokenProvider elastiCacheIamTokenProvider(
      @Value("${elasticache.iam.user}") String user,
      @Value("${elasticache.iam.cache-name}") String cacheName,
      @Value("${elasticache.iam.region}") String region
  ) {
    return new ElastiCacheIamTokenProvider(user, cacheName, region);
  }

  @Bean
  LettuceClientConfigurationBuilderCustomizer iamCredentialsCustomizer(
      ElastiCacheIamTokenProvider tokenProvider
  ) {
    return builder -> builder.redisCredentialsProviderFactory(
        new RedisCredentialsProviderFactory() {
          @Override
          public RedisCredentialsProvider createCredentialsProvider(
              RedisConfiguration redisConfiguration
          ) {
            return tokenProvider;
          }
        }
    );
  }
}
