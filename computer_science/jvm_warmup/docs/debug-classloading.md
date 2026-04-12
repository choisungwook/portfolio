# Class Loading 디버깅

`docs/hands-on.md`를 끝낸 뒤 첫 요청에서 실제로 어떤 클래스가 처음 준비됐는지 확인하는 문서다.

타깃은 첫 HTTP 요청에서 lazy-load되는 클래스다. `ProductController`, `DispatcherServlet` 같은 클래스는 Spring 컨텍스트 초기화 시점에 로드되어 no-warmup/with-warmup 양쪽에 동일하게 찍힌다 — 차이 분석에 도움이 안 된다.

여기서 볼 것은 `QuerySqmImpl`(Hibernate SQM), `$$SpringCGLIB$$`(AOP 프록시), `BeanSerializerFactory`(Jackson), `HibernateConstraintValidatorContext`(validation)처럼 첫 요청 경로에서만 끌려오는 클래스다.

## 전제

- `docs/hands-on.md`를 한 번은 끝내본 상태
- `make up`이 통과하고 두 앱이 healthy 상태

## 1단계 — class loading 로그 켜고 재시작

기존 컨테이너를 내리고 env var와 함께 다시 올린다.

```bash
make down
CLASS_LOADING_LOG_ENABLED=true make up
```

수천 줄 나오면 켜진 것이다.

```bash
docker compose logs app-no-warmup 2>&1 | grep -c '\[class,load\]'
```

## 2단계 — JVM uptime 앵커 잡기

Spring Boot 시작 완료 로그의 `process running for Y`에서 Y를 기록한다. Y는 JVM uptime(초)이라 `-Xlog:class+load`의 `[t.XXXs]`와 같은 시계다. 이 값이 boot/post-boot 경계다.

```bash
docker compose logs app-no-warmup 2>&1 | grep 'Started JvmWarmupApplication'
```

출력 예:

```text
Started JvmWarmupApplication in 5.432 seconds (process running for 5.789)
```

`5.789`가 경계다. `[t.XXXs]`에서 `t < 5.789`면 부팅 중, `t >= 5.789`면 그 이후다. with-warmup도 같은 방법으로 자기 Y를 따로 잡는다.

## 3단계 — burst 한 번 때리고 원본 로그 저장

no-warmup 먼저 burst를 걸고 class loading 로그를 저장한다.

```bash
make restart-no-warmup
# 헬스체크 통과 대기 (~30초)
make load-no-warmup
# burst 완료 후 10~15초 여유
docker compose logs app-no-warmup 2>&1 | grep '\[class,load\]' > /tmp/cl-no.log
```

with-warmup도 동일하게 진행한다.

```bash
make restart-with-warmup
make load-with-warmup
docker compose logs app-with-warmup 2>&1 | grep '\[class,load\]' > /tmp/cl-with.log
```

`/tmp/` 파일은 host 로컬이다. 레포에 커밋하지 않는다.

## 4단계 — 노이즈 걷어내기

JDK 내부와 CDS를 먼저 빼고, lazy-load 대상만 남긴다.

```bash
cat /tmp/cl-no.log \
  | grep -v 'source: shared objects file' \
  | grep -v 'source: jrt:/java\.' \
  | grep -v 'source: jrt:/jdk\.' \
  | grep -E 'sqm|criteria|QueryPlan|BeanSerializer|ObjectMapper|JsonSerializer|ConstraintValidator|HibernateConstraintValidator|\$\$SpringCGLIB\$\$|SqlAstTranslator|JdbcValuesMapping|HikariPool\$|com\.example\.jvmwarmup' \
  > /tmp/cl-no.filtered.log
```

제외 항목:

- `shared objects file` — CDS pre-load, 실제 로드 아님
- `jrt:/java.`, `jrt:/jdk.` — JDK 모듈 기본 클래스

포함 항목:

- `sqm|criteria|QueryPlan|SqlAstTranslator|JdbcValuesMapping` — Hibernate 첫 쿼리 컴파일
- `BeanSerializer|ObjectMapper|JsonSerializer` — Jackson 첫 직렬화
- `ConstraintValidator` — 첫 `@Valid`
- `$$SpringCGLIB$$` — 첫 `@Transactional`/AOP 프록시 호출
- `HikariPool$` — 커넥션 pool 내부 lambda
- `com.example.jvmwarmup` — 우리 코드

16k 줄이 수백 줄로 줄어든다. with-warmup도 같은 파이프라인으로 `/tmp/cl-with.filtered.log`를 만든다.

## 5단계 — boot / post-boot 쪼개기

2단계에서 잡은 Y값을 기준으로 post-boot 구간만 남긴다. Y 자리에 실제 값을 넣는다.

```bash
awk -v t=5.789 'match($0,/\[([0-9.]+)s\]/,a){if(a[1]+0 >= t+0.1) print}' \
  /tmp/cl-no.filtered.log > /tmp/cl-no.post.log
```

with-warmup은 자기 Y로 동일하게 실행해 `/tmp/cl-with.post.log`를 만든다.

## 6단계 — cold / warm diff

post-boot 구간의 클래스 이름을 비교한다. with-warmup에서 사라진 항목이 WarmupRunner의 self-HTTP 8번이 미리 끌어온 클래스다.

```bash
diff \
  <(awk '{print $3}' /tmp/cl-no.post.log   | sort -u) \
  <(awk '{print $3}' /tmp/cl-with.post.log | sort -u)
```

no-warmup 전용으로 나올 예상 후보:

- `org.hibernate.query.sqm.internal.QuerySqmImpl`
- `com.example.jvmwarmup.service.ProductService$$SpringCGLIB$$0`
- `com.example.jvmwarmup.controller.ProductController$$SpringCGLIB$$0`
- `com.fasterxml.jackson.databind.ser.BeanSerializerFactory`
- `org.hibernate.validator.constraintvalidation.HibernateConstraintValidatorContext`

## 7단계 — Grafana usage와 겹쳐 보기

`docs/hands-on.md`에서 본 `HikariCP - Connection Usage Time`의 첫 spike 시점과, 위 post-boot 클래스 로드 시점(`[t.XXXs]` + 컨테이너 부팅 wall-clock)을 시각으로 맞춰본다. 두 지점이 겹치면, **첫 요청 usage spike는 JPA/Jackson/Validator lazy-load와 같은 구간에서 발생한다**.
