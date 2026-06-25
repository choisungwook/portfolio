package com.akbun.kafka.message;

public record PublishedMessage(
    String value,
    String topic,
    int partition,
    long offset
) {
}
