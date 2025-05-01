FROM gradle:jdk-21-and-24-corretto-al2023 AS builder
WORKDIR /app
COPY . .

RUN ./gradlew dependencies --no-daemon
RUN ./gradlew bootJar --no-daemon

FROM openjdk:24-slim-bullseye
WORKDIR /app

# UID=1002, GID=1002로 appuser, appgroup 생성
RUN groupadd --gid 1002 appgroup && \
    useradd --uid 1002 --gid 1002 --system --create-home appuser

RUN apt update && \
    apt install -y net-tools curl procps && \
    apt clean && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/build/libs/*.jar app.jar

RUN chown appuser:appgroup /app/app.jar

USER appuser

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
