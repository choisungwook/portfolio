# JVM 클래스 로딩 이론

## Lazy Loading이 기본인 이유

- JVM은 클래스가 실제로 필요한 시점까지 로딩을 미룬다. 앱 시작 시점에 모든 클래스를 올리지 않는다. 이유는 단순하다. 메모리다.
- Java 애플리케이션 하나가 의존하는 라이브러리는 수백 개에 달하므로 클래스 파일 수는 수만 개가 될 수 있다. 그중에서 실제 요청 처리에 쓰이는 클래스는 일부다. 나머지를 미리 올려두면 메모리를 낭비한다.
- Lazy Loading은 이 문제를 해결한다. 처음 참조되는 시점에 로딩하면, 쓰이지 않는 클래스는 평생 메모리에 올라오지 않는다. 부작용은 첫 요청이 느리다는 것이다.

## 클래스 로딩을 관찰하는 방법

JVM에는 클래스 로딩 과정을 로그로 출력하는 옵션이 있다. JVM 플래그로 클래스 로딩 로그를 활성화하는 방법이다.

```text
-Xlog:class+load=info
```

이 플래그를 켜면 stdout에 다음과 같은 형태로 출력된다.

```text
[0.123s][info][class,load] com.example.classloading.service.ProductQueryService source: file:/app/app.jar
[0.456s][info][class,load] org.springframework.data.jpa.repository.JpaRepository source: file:/app/app.jar
```

줄 앞의 타임스탬프가 JVM 시작 후 경과 시간이다. 이것으로 어떤 클래스가 언제 로딩되었는지 추적할 수 있다. `docker-compose.yml`에서는 `JAVA_OPTS` 환경변수로 이 플래그를 주입한다.

```yaml
environment:
  JAVA_OPTS: "-Xlog:class+load=info"
```

`Dockerfile`의 `ENTRYPOINT`가 이 환경변수를 받아서 JVM에 전달한다.

```dockerfile
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

## 참고

- [JVM 클래스 로딩 명세 (OpenJDK)](https://docs.oracle.com/javase/specs/jvms/se17/html/jvms-5.html)
- [JVM Unified Logging (-Xlog)](https://openjdk.org/jeps/158)
