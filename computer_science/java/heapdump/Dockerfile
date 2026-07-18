FROM eclipse-temurin:21-jdk

WORKDIR /app
COPY app/LeakApp.java .
RUN javac LeakApp.java

# 기본 실행은 OOM 재현 모드. 다른 실험은 docker run에서 명령을 덮어쓴다.
CMD ["java", "-Xmx64m", "-XX:+HeapDumpOnOutOfMemoryError", "-XX:HeapDumpPath=/dumps/heap.hprof", "LeakApp"]
