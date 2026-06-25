package com.akbun.kafka.message;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Service
public class MessageConsumer {
  private static final int MAX_RECENT_MESSAGES = 20;

  private final ConcurrentLinkedDeque<ConsumedMessage> recentMessages = new ConcurrentLinkedDeque<>();

  @KafkaListener(topics = "${app.kafka.topic}", groupId = "${spring.kafka.consumer.group-id}")
  public void consume(ConsumerRecord<String, String> record) {
    recentMessages.addFirst(new ConsumedMessage(
        record.value(),
        record.topic(),
        record.partition(),
        record.offset(),
        Instant.now()
    ));

    while (recentMessages.size() > MAX_RECENT_MESSAGES) {
      recentMessages.pollLast();
    }
  }

  public List<ConsumedMessage> recentMessages() {
    return new ArrayList<>(recentMessages);
  }
}
