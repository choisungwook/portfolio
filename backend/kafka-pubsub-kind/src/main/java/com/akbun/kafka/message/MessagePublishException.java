package com.akbun.kafka.message;

public class MessagePublishException extends RuntimeException {
  public MessagePublishException(String message, Throwable cause) {
    super(message, cause);
  }
}
