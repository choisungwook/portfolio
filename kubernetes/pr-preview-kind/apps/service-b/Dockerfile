FROM gradle:8.14-jdk21 AS build

WORKDIR /workspace

COPY settings.gradle build.gradle ./
COPY src ./src
RUN gradle bootJar --no-daemon

FROM eclipse-temurin:21-jre

WORKDIR /app

COPY --from=build /workspace/build/libs/service-b.jar ./service-b.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "service-b.jar"]
