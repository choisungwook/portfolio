# JVM 클래스 로딩 디버깅 실습

API 호출 전/후를 비교하여 정말 클래스 로드가 필요할 때 호출되는지 확인한다. `-Xlog:class+load=info` 플래그를 켜면 클래스 로드를 디버깅할 수 있다.

## 사전 준비

Docker와 `docker compose`가 설치되어 있어야 한다. 실습 디렉터리로 이동한다.

```bash
cd computer_science/jvm_class_loading
```

## 환경 시작

두 컨테이너를 함께 빌드하고 실행한다.

```bash
docker compose up --build -d
```

- `app-default` (포트 8081): 클래스 로딩 로그 없이 기본 실행
- `app-with-classloading-log` (포트 8082): `-Xlog:class+load=info` 플래그 활성화

컨테이너가 정상 기동되면 actuator 엔드포인트로 상태를 확인한다.

```bash
curl http://localhost:8082/actuator/health
```

응답이 `{"status":"UP"}` 형태로 오면 준비 완료다.

## 실습 1: 클래스 로딩 로그 켜기

`app-with-classloading-log` 컨테이너의 로그를 확인한다.

```bash
docker logs app-with-classloading-log 2>&1 | grep "\[class,load\]" | head -20
```

출력 예시는 아래와 같다. 줄 앞의 숫자가 JVM 시작 후 경과 시간(초)이다. `source:` 뒤에는 클래스를 어디서 로딩했는지 나온다.

```text
[0.012s][info][class,load] java.lang.Object source: shared objects file
[0.013s][info][class,load] java.lang.String source: shared objects file
[0.089s][info][class,load] org.springframework.boot.SpringApplication source: file:/app/app.jar
```

`app-default` 컨테이너와 비교하면 로그 양이 다른 것을 확인할 수 있다. `app-default`에는 class+load 로그가 없다. 플래그를 켰을 때만 출력된다.

```bash
docker logs app-default 2>&1 | grep "\[class,load\]" | wc -l
docker logs app-with-classloading-log 2>&1 | grep "\[class,load\]" | wc -l
```

## 실습 2: 어떤 클래스가 언제 로딩되는가

전체 로딩된 클래스 수를 확인한다.

```bash
docker logs app-with-classloading-log 2>&1 | grep "\[class,load\]" | wc -l
```

Spring, Hibernate, Jackson 관련 클래스만 필터링한다. 앱이 시작될 때 Spring 컨텍스트를 구성하면서 이미 상당수의 클래스가 로딩된다는 것을 볼 수 있다.

```bash
docker logs app-with-classloading-log 2>&1 | grep "\[class,load\]" | grep -E "springframework|hibernate|jackson" | head -20
```

## 실습 3: 첫 요청이 새로운 클래스 로딩을 유발하는가

요청을 보내기 전 현재 로딩된 클래스 수를 기록한다.

```bash
docker logs app-with-classloading-log 2>&1 | grep "\[class,load\]" | wc -l
```

첫 요청을 보낸다.

```bash
curl http://localhost:8082/products
```

요청 후 다시 클래스 수를 확인한다.

```bash
docker logs app-with-classloading-log 2>&1 | grep "\[class,load\]" | wc -l
```

숫자가 늘어난 것을 확인할 수 있다. Hibernate SQL 생성과 Jackson 직렬화 관련 클래스를 필터링해서 어떤 클래스가 새로 로딩됐는지 확인한다.

```bash
docker logs app-with-classloading-log 2>&1 | grep "\[class,load\]" | grep -E "hibernate|jackson"
```

`org.hibernate.sql`, `com.fasterxml.jackson` 계열 클래스들이 첫 요청 시점에 로딩된 것을 볼 수 있다.

두 번째 요청을 보내고 로그를 다시 확인한다.

```bash
curl http://localhost:8082/products
docker logs app-with-classloading-log 2>&1 | grep "\[class,load\]" | grep -E "hibernate|jackson" | wc -l
```

두 번째 요청에서는 이미 로딩된 클래스를 재사용하기 때문에 숫자가 늘어나지 않는다.

## 결과 해석

이 실습에서 클래스 로딩 시점이 두 구간으로 나뉜다는 것을 확인할 수 있다.

- 앱 시작 시점에는 Spring 컨텍스트 초기화가 일어나면서 `springframework`, `hibernate`, `jackson` 관련 클래스가 대거 로딩된다. 이 단계에서 이미 수천 개의 클래스가 메모리에 올라온다.
- 처음에는 `com.example` 하위 서비스 클래스들이 첫 요청 시에 로딩될 거라고 예상했다. 그런데 로그를 확인해 보면 `com.example.classloading.service.ProductQueryService`가 요청 전에 이미 떠 있다. 왜인지 찾아보니 Spring Bean의 초기화 방식 때문이었다. `@Service`, `@RestController`, `@Repository`가 붙은 클래스는 ApplicationContext가 시작될 때 컴포넌트 스캔에서 발견되는 즉시 인스턴스화된다. **인스턴스를 만드는 과정에서 JVM이 해당 클래스를 로딩**하기 때문에 요청 전에 이미 끝난다.
- 첫 요청 시점에는 다른 클래스들이 로딩된다. Hibernate SQL 생성, ResultSet 매핑, Jackson 직렬화 관련 클래스들이다. 이 클래스들은 Spring Bean이 아니라 실제로 쿼리를 실행하고 응답을 직렬화하는 순간에 처음 호출된다.
- **첫 요청이 느린 이유 중 하나가 이것이다.** 클래스 로딩은 디스크 I/O와 바이트코드 검증을 포함하는 작업이라 응답 시간에 영향을 준다.
- `jvm_warmup` 실습에서 워밍업을 하면 첫 요청 응답 시간이 줄어드는 이유도 여기에 있다. 워밍업 요청이 클래스 로딩을 미리 유발해서 실제 트래픽이 들어오기 전에 준비를 끝낸다.

## 참고

- [jvm_warmup 실습](../jvm_warmup/README.md)
- [theory.md](./theory.md) — ClassLoader 구조와 로딩 단계 이론
