FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY src ./src

RUN javac -d out $(find src -name "*.java") \
  && jar --create --file app.jar --main-class com.example.metaspace.MetaspaceOomLab -C out .

RUN mkdir -p /dumps /tmp/metaspace-lab

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
