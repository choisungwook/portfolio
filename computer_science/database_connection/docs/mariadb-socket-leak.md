# MariaDB 커넥션 실패 시 소켓이 안 닫히는 버그

## 공부 배경

Spring Boot + MariaDB 조합에서 "커넥션이 실패하면 TCP 소켓이 안 닫힌다"는 이야기를 들었다. 정확히 무슨 뜻인지 몰라서 직접 재현해보기로 했다.

결론부터 말하면, 이건 MariaDB JDBC 드라이버(mariadb-java-client)의 **소켓 누수 버그**다. 애플리케이션 코드가 잘못된 게 아니라, 드라이버 내부에서 예외 발생 시 TCP 소켓을 닫지 않는 것이 원인이다.

## 소켓 누수가 뭔가?

정상적인 DB 커넥션 흐름은 이렇다.

```
App ──TCP 연결──▶ MariaDB      (소켓 생성)
App ◀──쿼리 결과── MariaDB
App ──FIN──────▶ MariaDB      (소켓 닫기) ← 이게 핵심
```

소켓 누수가 발생하면 이렇게 된다.

```
App ──TCP 연결──▶ MariaDB      (소켓 생성)
App ──쿼리 전송──▶ MariaDB
... 3초 후 소켓 타임아웃 ...
App: SocketTimeoutException 발생!
App: 소켓을 안 닫음 ← 버그!
MariaDB: 쿼리 계속 실행 중     ← 좀비 커넥션
```

이게 왜 문제인가?

- 좀비 커넥션이 `max_connections` 슬롯을 차지해서, 새 커넥션이 거부된다
- 클라이언트의 파일 디스크립터가 고갈된다 (Too many open files)
- 좀비 커넥션이 트랜잭션 락을 잡고 있으면 다른 쿼리가 블락된다

## 리눅스 FD(파일 디스크립터)와 소켓

소켓 누수를 이해하려면 먼저 FD가 뭔지 알아야 한다.

리눅스에서 모든 I/O 리소스는 **FD(파일 디스크립터)** 라는 정수 번호로 관리한다. 파일을 열면 FD가 생기고, 소켓을 만들면 FD가 생기고, 파이프를 만들면 FD가 생긴다. 커널 입장에서 파일과 소켓은 다 같은 FD다.

```
# 프로세스의 열린 FD 목록 확인
ls /proc/<pid>/fd

# 결과 예시 (각 항목이 하나의 FD)
0 -> /dev/pts/0      # stdin
1 -> /dev/pts/0      # stdout
2 -> /dev/pts/0      # stderr
3 -> socket:[12345]  # TCP 소켓
4 -> /tmp/app.log    # 파일
```

TCP 연결(`connect()`)을 맺으면 커널이 소켓 FD를 하나 할당한다. 연결을 닫으면(`close()`) FD가 반환된다. 소켓 누수 = 이 FD가 반환되지 않는 상황이다.

프로세스당 열 수 있는 FD 최대치는 `ulimit -n`으로 확인한다. 기본값은 보통 1024 또는 65536이다. FD가 고갈되면 새 연결을 못 맺고 `EMFILE: Too many open files` 에러가 발생한다.

## 어떤 버그인가? (CONJ-863)

MariaDB JIRA에 등록된 버그 [CONJ-863](https://jira.mariadb.org/browse/CONJ-863)이다.

| 항목 | 내용 |
|------|------|
| 영향 버전 | mariadb-java-client 2.7.2 이하 |
| 수정 버전 | mariadb-java-client 2.7.4 |
| 원인 | `handleIoException()`에서 `SocketTimeoutException` 발생 시 `destroySocket()`을 호출하지 않음 |

쿼리 실행 중에 `socketTimeout`이 발생하면, 드라이버 내부의 `handleIoException()` 메서드가 호출된다. 이 메서드는 커넥션 상태를 "에러"로 표시하지만, TCP 소켓 자체를 닫는 `destroySocket()`은 호출하지 않는다.

그래서 `try-with-resources`로 `conn.close()`를 제대로 호출해도, 내부에서 이미 "에러 상태"로 표시된 커넥션의 소켓 정리를 건너뛴다. **애플리케이션 코드에서는 해결할 수 없는 드라이버 버그**다.

## 재현 환경

### 구성

| 컴포넌트 | 설명 |
|----------|------|
| MariaDB 10.11 | Docker 컨테이너, ARM64 지원, ss/lsof 포함 |
| Spring Boot 3.2 | REST API로 소켓 누수를 재현, Actuator + Micrometer |
| mariadb-java-client 2.7.2 | 소켓 누수 버그가 있는 버전 |
| Prometheus | JVM 메트릭 + 커스텀 좀비 커넥션 메트릭 수집 |
| Grafana | 소켓 누수 모니터링 대시보드 |

### 재현 원리

1. 앱이 `socketTimeout=3000`(3초)으로 MariaDB에 연결한다
2. `SELECT SLEEP(30)` 쿼리를 실행한다 (30초 동안 대기하는 쿼리)
3. 3초 후 `SocketTimeoutException`이 발생한다
4. 드라이버 버그로 TCP 소켓이 닫히지 않는다
5. MariaDB에서는 `SELECT SLEEP(30)`이 계속 실행된다 (좀비 커넥션)

### 프로젝트 구조

```
database_connection/
├── docker-compose.yaml          # MariaDB + 앱 + Prometheus + Grafana
├── prometheus.yml               # Prometheus scrape 설정
├── mariadb/
│   └── Dockerfile               # MariaDB + 디버깅 도구(ss, lsof)
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/prometheus.yml
│   │   └── dashboards/dashboard.yml
│   └── dashboards/
│       └── socket-leak-dashboard.json
├── app/
│   ├── Dockerfile               # 멀티스테이지 빌드 + lsof 포함
│   ├── build.gradle             # mariadb-java-client 2.7.2 + actuator
│   └── src/main/java/.../
│       ├── SocketLeakApplication.java
│       ├── LeakController.java       # /reproduce, /check, /info
│       └── ZombieConnectionMetrics.java  # Gauge, Counter 메트릭
```

## 핸즈온: 소켓 누수 재현

### 사전 준비

- Docker Desktop이 실행 중이어야 한다 (ARM Mac 지원)
- curl 또는 브라우저

### Step 1: 환경 실행

`docker compose up`으로 MariaDB와 Spring Boot 앱을 실행한다.

```bash
cd computer_science/database_connection
docker compose up -d --build
```

첫 빌드는 Gradle 의존성 다운로드 때문에 2~3분 정도 걸린다. `docker compose logs -f app` 명령으로 앱이 완전히 뜰 때까지 기다린다.

앱 로그에 `Started SocketLeakApplication`이 보이면 준비 완료다.

### Step 2: 드라이버 버전 확인

현재 사용 중인 MariaDB JDBC 드라이버 버전을 확인한다.

```bash
curl localhost:8080/info | python3 -m json.tool
```

`majorVersion: 2`, `minorVersion: 7`이면 2.7.x 버전이다.

### Step 3: 정상 상태 확인

소켓 누수를 만들기 전에, 현재 MariaDB의 커넥션 상태를 확인한다.

```bash
curl localhost:8080/check | python3 -m json.tool
```

`zombieConnections: 0`이면 정상이다. `totalConnections`에는 이 `/check` 요청 자체의 커넥션만 보인다.

### Step 4: 소켓 누수 재현

이 엔드포인트를 호출하면 소켓 누수가 발생한다. 각 요청은 약 3초 후 타임아웃이 발생한다.

```bash
curl localhost:8080/reproduce
```

3초 후 응답이 온다. `status: SOCKET_LEAKED`가 보이면 소켓 누수가 발생한 것이다.

3번 더 호출해서 누수를 누적시킨다.

```bash
curl localhost:8080/reproduce
curl localhost:8080/reproduce
curl localhost:8080/reproduce
```

### Step 5: 좀비 커넥션 확인 - SHOW PROCESSLIST

MariaDB에서 좀비 커넥션을 확인한다.

앱의 `/check` 엔드포인트로 확인하는 방법:

```bash
curl localhost:8080/check | python3 -m json.tool
```

또는 MariaDB에 직접 접속해서 확인하는 방법:

```bash
docker exec mariadb mysql -u root -ppassword -e "SHOW PROCESSLIST"
```

기대 결과 예시:

```
+----+------+-----------+--------+---------+------+------------+------------------+
| Id | User | Host      | db     | Command | Time | State      | Info             |
+----+------+-----------+--------+---------+------+------------+------------------+
|  1 | root | ...       | testdb | Query   |   15 | User sleep | SELECT SLEEP(30) |
|  2 | root | ...       | testdb | Query   |   12 | User sleep | SELECT SLEEP(30) |
|  3 | root | ...       | testdb | Query   |    9 | User sleep | SELECT SLEEP(30) |
|  4 | root | ...       | testdb | Query   |    6 | User sleep | SELECT SLEEP(30) |
|  5 | root | ...       | NULL   | Query   |    0 | init       | SHOW PROCESSLIST |
+----+------+-----------+--------+---------+------+------------+------------------+
```

**핵심 포인트**: 앱에서는 이미 예외가 발생했는데, MariaDB에서는 `SELECT SLEEP(30)` 쿼리가 아직 실행 중이다. 소켓이 닫히지 않았기 때문이다.

### Step 6: TCP 소켓 상태 확인 - ss

앱 컨테이너에서 MariaDB(3306포트)로 연결된 TCP 소켓 상태를 확인한다.

```bash
docker exec socket-leak-app ss -tnp | grep 3306
```

기대 결과 예시:

```
ESTAB  0  0  172.18.0.3:48210  172.18.0.2:3306
ESTAB  0  0  172.18.0.3:48212  172.18.0.2:3306
ESTAB  0  0  172.18.0.3:48214  172.18.0.2:3306
ESTAB  0  0  172.18.0.3:48216  172.18.0.2:3306
```

**핵심 포인트**: ESTABLISHED 상태의 소켓이 좀비 커넥션 수만큼 남아 있다. 앱에서 `conn.close()`를 호출했는데도 소켓이 열려 있다.

### Step 7: 수정된 버전으로 비교

`app/build.gradle`에서 드라이버 버전을 수정한다.

```groovy
// 수정 전 (버그 있음)
// implementation 'org.mariadb.jdbc:mariadb-java-client:2.7.2'

// 수정 후 (버그 수정됨)
implementation 'org.mariadb.jdbc:mariadb-java-client:2.7.4'
```

앱을 다시 빌드하고 같은 테스트를 반복한다.

```bash
docker compose down
docker compose up -d --build
```

앱이 뜨면 같은 순서로 테스트한다.

```bash
curl localhost:8080/reproduce
curl localhost:8080/reproduce
curl localhost:8080/reproduce
curl localhost:8080/reproduce

# 좀비 커넥션 확인
docker exec mariadb mysql -u root -ppassword -e "SHOW PROCESSLIST"

# TCP 소켓 상태 확인
docker exec socket-leak-app ss -tnp | grep 3306
```

2.7.4에서는 `SELECT SLEEP(30)` 쿼리가 즉시 종료되고, TCP 소켓도 남아있지 않아야 한다. `destroySocket()`이 제대로 호출되기 때문이다.

### Step 8: 정리

```bash
docker compose down
```

## 앱 FD vs MariaDB FD 구분하기

TCP 소켓은 양방향이다. 앱이 `connect()`를 호출하면 **앱 측에도 FD가 생기고, MariaDB 측에도 FD가 생긴다.** 소켓 누수가 발생하면 양쪽 다 FD를 잡고 있다.

소켓 누수가 의심될 때 어느 쪽 문제인지 구분하는 방법은 다음과 같다.

### 앱(클라이언트) 측 확인

앱 컨테이너의 FD 총 개수를 확인한다. `/reproduce`를 호출할 때마다 증가하면 소켓 FD가 누수되고 있는 것이다.

```bash
docker exec socket-leak-app ls /proc/1/fd | wc -l
```

MariaDB(3306)로 열려 있는 TCP 소켓을 확인한다. ESTABLISHED 상태 소켓이 남아있으면 닫히지 않은 소켓이다.

```bash
docker exec socket-leak-app ss -tnp | grep 3306
```

lsof로 TCP FD를 상세히 확인한다.

```bash
docker exec socket-leak-app lsof -p 1 -i TCP
```

### MariaDB(서버) 측 확인

MariaDB 컨테이너의 FD 총 개수를 확인한다. 클라이언트 커넥션마다 FD를 하나씩 차지한다.

```bash
docker exec mariadb ls /proc/1/fd | wc -l
```

MariaDB가 유지 중인 TCP 소켓 목록을 확인한다.

```bash
docker exec mariadb ss -tnp
```

SHOW PROCESSLIST로 좀비 커넥션을 확인한다. `SELECT SLEEP`이 실행 중인 커넥션은 클라이언트에서 소켓을 닫지 않아서 남아있는 좀비다.

```bash
docker exec mariadb mysql -u root -ppassword -e "SHOW PROCESSLIST"
```

### 구분 요약

| 관점 | 명령어 | 누수 시 보이는 것 |
|------|--------|-----------------|
| 앱 FD 수 | `ls /proc/1/fd \| wc -l` | /reproduce 호출마다 증가 |
| 앱 TCP 소켓 | `ss -tnp \| grep 3306` | ESTABLISHED 소켓 잔존 |
| MariaDB FD 수 | `ls /proc/1/fd \| wc -l` | 커넥션마다 1씩 증가 |
| MariaDB 프로세스 | `SHOW PROCESSLIST` | SLEEP 실행 중인 좀비 |

핵심: **이 버그에서는 양쪽 다 FD가 누수된다.** 앱은 소켓을 안 닫아서, MariaDB는 클라이언트가 끊은 줄 몰라서 둘 다 FD를 잡고 있다.

## 핸즈온: Prometheus/Grafana로 소켓 누수 모니터링

FD 누수를 명령어로 확인하는 건 일회성이다. 실제 운영 환경에서는 메트릭으로 지속 추적해야 한다. Spring Boot Actuator + Micrometer + Prometheus + Grafana로 소켓 누수를 시각화할 수 있다.

### 핵심 메트릭

앱에서 노출되는 메트릭과 의미는 다음과 같다.

| 메트릭 | 타입 | 의미 |
|--------|------|------|
| `process_open_fds` | Gauge (자동) | JVM 프로세스의 열린 FD 수. 소켓 누수 시 증가 |
| `process_max_fds` | Gauge (자동) | 프로세스의 FD 최대치 |
| `mariadb_zombie_connections` | Gauge (커스텀) | MariaDB SHOW PROCESSLIST에서 확인한 좀비 수 |
| `mariadb_socket_leak_total` | Counter (커스텀) | `/reproduce` 호출 누적 횟수 |

`process_open_fds`는 Spring Boot Actuator가 자동으로 수집한다. 나머지 둘은 `ZombieConnectionMetrics.java`에서 등록한 커스텀 메트릭이다.

### Step 1: 환경 실행

모든 서비스를 한번에 올린다.

```bash
cd computer_science/database_connection
docker compose up -d --build
```

4개 서비스가 올라온다: `mariadb`, `app`, `prometheus`, `grafana`

### Step 2: Prometheus scrape 확인

Prometheus가 앱 메트릭을 정상 수집하는지 확인한다.

브라우저에서 `http://localhost:9090/targets`를 열어 `socket-leak-app` 상태가 **UP**인지 확인한다.

### Step 3: 메트릭 직접 확인

actuator가 노출하는 raw 메트릭을 확인한다.

```bash
curl -s localhost:8080/actuator/prometheus | grep -E "process_open_fds|mariadb"
```

`process_open_fds`, `mariadb_zombie_connections`, `mariadb_socket_leak_total`이 보이면 정상이다.

### Step 4: 소켓 누수 재현 + 메트릭 변화 관찰

소켓 누수를 5번 발생시킨다.

```bash
for i in {1..5}; do curl -s localhost:8080/reproduce | python3 -m json.tool; sleep 1; done
```

### Step 5: Grafana 대시보드로 확인

브라우저에서 `http://localhost:3000`을 열고 `admin` / `admin`으로 로그인한다.

왼쪽 메뉴 → **Dashboards** → **socket-leak** 폴더 → **MariaDB Socket Leak Monitoring** 대시보드를 연다.

대시보드에서 확인할 내용:

- **Process Open FDs 그래프**: `/reproduce` 호출마다 계단식으로 증가하는지 확인
- **Zombie Connections**: MariaDB 서버에 남아있는 좀비 커넥션 수
- **Socket Leak Total**: 총 누수 발생 횟수
- **FD 소진율**: 현재 FD 사용이 최대치의 몇 %인지

### Step 6: 수정 버전으로 비교

`app/build.gradle`에서 드라이버 버전을 2.7.4로 바꾸고 같은 테스트를 반복한다.

```groovy
implementation 'org.mariadb.jdbc:mariadb-java-client:2.7.4'
```

다시 빌드하고 테스트한다.

```bash
docker compose down
docker compose up -d --build
for i in {1..5}; do curl -s localhost:8080/reproduce; sleep 1; done
```

2.7.4에서는 `process_open_fds`가 증가하지 않고, Zombie Connections도 0으로 유지되어야 한다.

## 코드 설명

### LeakController.java의 핵심 부분

`/reproduce` 엔드포인트는 try-with-resources를 사용한다.

```java
try (Connection conn = DriverManager.getConnection(url, dbUser, dbPassword);
     Statement stmt = conn.createStatement()) {

    stmt.executeQuery("SELECT SLEEP(" + sleepSeconds + ")");

} catch (SQLException e) {
    // conn.close()가 자동 호출되지만,
    // 2.7.2에서는 내부적으로 소켓을 안 닫는다!
}
```

이 코드는 자원 관리 측면에서 **올바른 코드**다. `try-with-resources`로 `Connection`과 `Statement`를 자동 해제한다. 그런데도 소켓이 누수된다. 드라이버 버그이기 때문이다.

### socketTimeout 파라미터

JDBC URL에 `socketTimeout=3000`을 추가하면, 소켓 읽기 시 3초 제한이 걸린다.

```
jdbc:mariadb://mariadb:3306/testdb?socketTimeout=3000
```

이 설정은 내부적으로 `java.net.Socket.setSoTimeout(3000)`을 호출한다. 3초 안에 응답이 오지 않으면 `SocketTimeoutException`이 발생한다.

## 관련 버그 목록

MariaDB JDBC Connector에는 비슷한 소켓 누수 버그가 여러 개 있었다.

| JIRA | 시나리오 | 수정 버전 |
|------|----------|----------|
| [CONJ-382](https://jira.mariadb.org/browse/CONJ-382) | max_connections 초과 시 소켓 미해제 | 1.5.5 |
| [CONJ-863](https://jira.mariadb.org/browse/CONJ-863) | SocketTimeout 발생 시 소켓 미해제 | 2.7.4 |
| [CONJ-884](https://jira.mariadb.org/browse/CONJ-884) | 서버 재시작 시 풀 커넥션 누수 | 2.7.4 |
| [CONJ-1007](https://jira.mariadb.org/browse/CONJ-1007) | Unix 소켓 파일 디스크립터 누수 | 2.7.7 |

공통 원인은 동일하다. 예외 처리 경로에서 `destroySocket()`을 호출하지 않은 것.

## 정리

- 이 버그는 **JDBC 드라이버 내부**의 문제다. 애플리케이션 코드에서 아무리 잘 짜도 소켓이 누수된다
- `try-with-resources`를 쓰든 `finally`에서 `close()`를 호출하든, 드라이버가 소켓을 안 닫으면 의미가 없다
- mariadb-java-client를 쓴다면 최소 **2.7.4** 이상을 사용해야 한다 (3.x 권장)
- 프로덕션에서 의심 증상: `CLOSE_WAIT` 소켓 누적, `Too many open files` 에러, 커넥션 풀 고갈

## 참고 자료

- [CONJ-863: Ensure socket state when SocketTimeout occurs](https://jira.mariadb.org/browse/CONJ-863)
- [CONJ-382: Leaked Sockets when server reach maximum connections](https://jira.mariadb.org/browse/CONJ-382)
- [Spring Boot #32423: Leaking file descriptor](https://github.com/spring-projects/spring-boot/issues/32423)
