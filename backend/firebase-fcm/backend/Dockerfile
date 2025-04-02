FROM gradle:8-jdk21 AS builder
WORKDIR /app
COPY . .

RUN ./gradlew dependencies --no-daemon
RUN ./gradlew bootJar --no-daemon

FROM openjdk:21-jdk-slim
WORKDIR /app

COPY --from=builder /app/build/libs/*.jar app.jar

RUN apt update && \
    apt install net-tools curl procps -y

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
