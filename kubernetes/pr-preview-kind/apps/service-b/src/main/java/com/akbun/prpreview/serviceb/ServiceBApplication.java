package com.akbun.prpreview.serviceb;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

@SpringBootApplication
public class ServiceBApplication {
  public static void main(String[] args) {
    SpringApplication.run(ServiceBApplication.class, args);
  }
}

@RestController
class ProcessController {
  private final RestClient restClient;
  private final String serviceName;
  private final String serviceVersion;
  private final String serviceCUrl;
  private final String zipkinUrl;

  ProcessController(
    RestClient.Builder restClientBuilder,
    @Value("${SERVICE_NAME:service-b}") String serviceName,
    @Value("${SERVICE_VERSION:main}") String serviceVersion,
    @Value("${SERVICE_C_URL:http://service-c-main:8080/finish}") String serviceCUrl,
    @Value("${ZIPKIN_URL:http://zipkin:9411/api/v2/spans}") String zipkinUrl
  ) {
    this.restClient = restClientBuilder.build();
    this.serviceName = serviceName;
    this.serviceVersion = serviceVersion;
    this.serviceCUrl = serviceCUrl;
    this.zipkinUrl = zipkinUrl;
  }

  @GetMapping("/process")
  Map<String, Object> process(@RequestHeader HttpHeaders incomingHeaders) {
    long startedAt = System.nanoTime();
    String incomingTraceparent = incomingHeaders.getFirst("traceparent");
    String traceId = traceIdFrom(incomingTraceparent);
    String parentSpanId = parentSpanIdFrom(incomingTraceparent);
    String spanId = newSpanId();
    Map<String, String> outgoingHeaders = outgoingHeaders(incomingHeaders, traceId, spanId);

    Map downstream = restClient.get()
      .uri(serviceCUrl)
      .headers(headers -> outgoingHeaders.forEach(headers::set))
      .retrieve()
      .body(Map.class);

    sendZipkinSpan(traceId, spanId, parentSpanId, startedAt);

    Map<String, Object> body = new HashMap<>();
    body.put("service", serviceName);
    body.put("version", serviceVersion);
    body.put("received_headers", visibleHeaders(incomingHeaders));
    body.put("forwarded_headers", outgoingHeaders);
    body.put("downstream", downstream);
    return body;
  }

  @GetMapping("/healthz")
  Map<String, String> healthz() {
    return Map.of("status", "ok");
  }

  private Map<String, String> outgoingHeaders(HttpHeaders incomingHeaders, String traceId, String spanId) {
    Map<String, String> headers = new HashMap<>();
    headers.put("x-request-id", valueOrDefault(incomingHeaders.getFirst("x-request-id"), UUID.randomUUID().toString()));
    headers.put("x-pr-preview", valueOrDefault(incomingHeaders.getFirst("x-pr-preview"), serviceVersion));
    headers.put("traceparent", "00-" + traceId + "-" + spanId + "-01");
    return headers;
  }

  private Map<String, String> visibleHeaders(HttpHeaders incomingHeaders) {
    return Map.of(
      "x-request-id", valueOrDefault(incomingHeaders.getFirst("x-request-id"), ""),
      "x-pr-preview", valueOrDefault(incomingHeaders.getFirst("x-pr-preview"), ""),
      "traceparent", valueOrDefault(incomingHeaders.getFirst("traceparent"), "")
    );
  }

  private String valueOrDefault(String value, String fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }
    return value;
  }

  private String traceIdFrom(String traceparent) {
    if (traceparent == null) {
      return UUID.randomUUID().toString().replace("-", "");
    }

    String[] parts = traceparent.split("-");
    if (parts.length == 4 && parts[1].length() == 32) {
      return parts[1];
    }

    return UUID.randomUUID().toString().replace("-", "");
  }

  private String parentSpanIdFrom(String traceparent) {
    if (traceparent == null) {
      return null;
    }

    String[] parts = traceparent.split("-");
    if (parts.length == 4 && parts[2].length() == 16) {
      return parts[2];
    }

    return null;
  }

  private String newSpanId() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
  }

  private void sendZipkinSpan(String traceId, String spanId, String parentSpanId, long startedAt) {
    long durationMicros = Math.max(1, (System.nanoTime() - startedAt) / 1000);
    Map<String, Object> span = new HashMap<>();
    span.put("traceId", traceId);
    span.put("id", spanId);
    span.put("name", serviceName + " /process");
    span.put("timestamp", Instant.now().toEpochMilli() * 1000);
    span.put("duration", durationMicros);
    span.put("localEndpoint", Map.of("serviceName", serviceName + "-" + serviceVersion, "port", 8080));
    span.put("tags", Map.of("preview.version", serviceVersion));

    if (parentSpanId != null) {
      span.put("parentId", parentSpanId);
    }

    try {
      restClient.post()
        .uri(zipkinUrl)
        .body(List.of(span))
        .retrieve()
        .toBodilessEntity();
    } catch (RuntimeException ignored) {
    }
  }
}
