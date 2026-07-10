package com.akbun.elasticache.iam;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.auth.aws.signer.AwsV4HttpSigner;

class ElastiCacheIamTokenProviderTest {

  @Test
  void createsSigV4TokenForReplicationGroupAndUser() {
    ElastiCacheIamTokenProvider provider = new ElastiCacheIamTokenProvider(
        "app-user",
        "cache-name",
        "ap-northeast-2",
        StaticCredentialsProvider.create(
            AwsBasicCredentials.create("access-key", "secret-key")
        ),
        AwsV4HttpSigner.create()
    );

    URI token = URI.create("http://" + provider.createToken());

    assertThat(token.getHost()).isEqualTo("cache-name");
    assertThat(token.getRawQuery()).contains(
        "Action=connect",
        "User=app-user",
        "X-Amz-Algorithm=AWS4-HMAC-SHA256",
        "X-Amz-Expires=900",
        "X-Amz-Signature="
    );
  }
}
