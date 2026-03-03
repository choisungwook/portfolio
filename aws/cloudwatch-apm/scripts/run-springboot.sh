#!/bin/bash
set -euo pipefail

SERVICE_NAME="${1:-spring-boot-demo}"
AGENT_PATH="${ADOT_AGENT_PATH:-/opt/aws-opentelemetry-agent.jar}"

cd "$(dirname "$0")/../spring-boot-app"

if [ ! -f "$AGENT_PATH" ]; then
  echo "ADOT Java agent not found at $AGENT_PATH"
  echo "Downloading..."
  sudo wget -q https://github.com/aws-observability/aws-otel-java-instrumentation/releases/latest/download/aws-opentelemetry-agent.jar \
    -O "$AGENT_PATH"
fi

if [ ! -f build/libs/demo-0.0.1-SNAPSHOT.jar ]; then
  echo "Building Spring Boot app..."
  ./gradlew bootJar
fi

echo "Starting Spring Boot app with Application Signals..."
echo "Service Name: $SERVICE_NAME"

JAVA_TOOL_OPTIONS="-javaagent:$AGENT_PATH" \
OTEL_METRICS_EXPORTER=none \
OTEL_LOGS_EXPORTER=none \
OTEL_AWS_APPLICATION_SIGNALS_ENABLED=true \
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4316/v1/traces \
OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT=http://localhost:4316/v1/metrics \
OTEL_TRACES_SAMPLER=xray \
OTEL_TRACES_SAMPLER_ARG="endpoint=http://localhost:2000" \
OTEL_RESOURCE_ATTRIBUTES="service.name=$SERVICE_NAME" \
java -jar build/libs/demo-0.0.1-SNAPSHOT.jar
