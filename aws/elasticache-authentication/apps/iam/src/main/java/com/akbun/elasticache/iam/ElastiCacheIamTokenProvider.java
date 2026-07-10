package com.akbun.elasticache.iam;

import io.lettuce.core.RedisCredentials;
import io.lettuce.core.RedisCredentialsProvider;
import java.time.Duration;
import reactor.core.publisher.Mono;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.http.SdkHttpMethod;
import software.amazon.awssdk.http.SdkHttpRequest;
import software.amazon.awssdk.http.auth.aws.signer.AwsV4FamilyHttpSigner;
import software.amazon.awssdk.http.auth.aws.signer.AwsV4HttpSigner;
import software.amazon.awssdk.http.auth.spi.signer.SignedRequest;

public class ElastiCacheIamTokenProvider implements RedisCredentialsProvider {

  private static final Duration TOKEN_VALIDITY = Duration.ofMinutes(15);

  private final String cacheName;
  private final AwsCredentialsProvider credentialsProvider;
  private final String region;
  private final AwsV4HttpSigner signer;
  private final String user;

  public ElastiCacheIamTokenProvider(String user, String cacheName, String region) {
    this(
        user,
        cacheName,
        region,
        DefaultCredentialsProvider.builder().build(),
        AwsV4HttpSigner.create()
    );
  }

  ElastiCacheIamTokenProvider(
      String user,
      String cacheName,
      String region,
      AwsCredentialsProvider credentialsProvider,
      AwsV4HttpSigner signer
  ) {
    this.user = user;
    this.cacheName = cacheName;
    this.region = region;
    this.credentialsProvider = credentialsProvider;
    this.signer = signer;
  }

  @Override
  public Mono<RedisCredentials> resolveCredentials() {
    return Mono.fromSupplier(() -> RedisCredentials.just(user, createToken()));
  }

  String createToken() {
    SdkHttpRequest request = SdkHttpRequest.builder()
        .protocol("http")
        .host(cacheName)
        .encodedPath("/")
        .method(SdkHttpMethod.GET)
        .putRawQueryParameter("Action", "connect")
        .putRawQueryParameter("User", user)
        .build();

    SignedRequest signedRequest = signer.sign(builder -> builder
        .identity(credentialsProvider.resolveCredentials())
        .request(request)
        .putProperty(AwsV4HttpSigner.SERVICE_SIGNING_NAME, "elasticache")
        .putProperty(AwsV4HttpSigner.REGION_NAME, region)
        .putProperty(
            AwsV4HttpSigner.AUTH_LOCATION,
            AwsV4FamilyHttpSigner.AuthLocation.QUERY_STRING
        )
        .putProperty(AwsV4HttpSigner.EXPIRATION_DURATION, TOKEN_VALIDITY));

    return signedRequest.request().getUri().toString().replaceFirst("^http://", "");
  }
}
