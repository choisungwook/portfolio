package com.akbun.kafka.message;

import java.util.concurrent.ExecutionException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
public class MessageProducer {
  private final KafkaTemplate<String, String> kafkaTemplate;
  private final String topic;

  public MessageProducer(KafkaTemplate<String, String> kafkaTemplate, @Value("${app.kafka.topic}") String topic) {
    this.kafkaTemplate = kafkaTemplate;
    this.topic = topic;
  }

  public PublishedMessage publish(String message) {
    try {
      var result = kafkaTemplate.send(topic, message).get();
      var metadata = result.getRecordMetadata();

      return new PublishedMessage(
          message,
          metadata.topic(),
          metadata.partition(),
          metadata.offset()
      );
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new MessagePublishException("Kafka publish was interrupted", exception);
    } catch (ExecutionException exception) {
      throw new MessagePublishException("Kafka publish failed", exception);
    }
  }
}
