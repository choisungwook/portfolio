package com.akbun.kafka.message;

import java.time.Instant;

public record ConsumedMessage(
    String value,
    String topic,
    int partition,
    long offset,
    Instant consumedAt
) {
}
