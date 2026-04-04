FROM gradle:8.5-jdk17 AS builder
WORKDIR /app
COPY build.gradle settings.gradle ./
COPY src/ src/
RUN gradle bootJar --no-daemon

FROM eclipse-temurin:17-jre
RUN apt-get update && apt-get install -y --no-install-recommends iproute2 procps && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
