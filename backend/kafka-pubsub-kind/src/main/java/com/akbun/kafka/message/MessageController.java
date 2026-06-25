package com.akbun.kafka.message;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MessageController {
  private final MessageProducer producer;
  private final MessageConsumer consumer;

  public MessageController(MessageProducer producer, MessageConsumer consumer) {
    this.producer = producer;
    this.consumer = consumer;
  }

  @PostMapping("/messages")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public PublishedMessage publish(@RequestBody PublishMessageRequest request) {
    return producer.publish(request.message());
  }

  @GetMapping("/messages")
  public List<ConsumedMessage> recentMessages() {
    return consumer.recentMessages();
  }
}
