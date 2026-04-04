# 핸즈온: MariaDB 소켓 누수 재현 실습

이 실습에서는 자바 애플리케이션에서 예외 발생 시 `Connection.close()` 호출을 누락했을 때 TCP 소켓이 어떻게 영구적으로 누수되는지 직접 확인합니다.

이론적 배경은 [소켓 누수와 FD 고갈](./mariadb-socket-leak.md) 문서를 참고하세요.

## API 엔드포인트

| 엔드포인트 | 역할 |
|-----------|------|
| `GET /reproduce` | DB 타임아웃을 유발한 뒤 의도적으로 `conn.close()`를 누락하여 소켓을 방치함 |
| `GET /check` | MariaDB 내부의 좀비 커넥션(`SLEEP` 쿼리 진행 상황) 확인 |
| `GET /info` | 사용 중인 MariaDB JDBC 드라이버 버전 확인 |

## 재현 환경

- MariaDB 10.11 컨테이너
- Spring Boot 2.7.18 앱 컨테이너 (커넥션 풀 없이 Raw JDBC 직접 사용)
- mariadb-java-client 2.7.2 (예외 시 스스로 소켓을 닫아주지 않는 드라이버)
- `socketTimeout=3000` (3초 제한)

## 핵심 코드

`app/src/main/java/.../LeakController.java` 내부의 코드는 다음과 같이 작성되어 있습니다.

```java
Connection conn = DriverManager.getConnection("jdbc:mariadb://.../?socketTimeout=3000");
Statement stmt = conn.createStatement();
try {
    stmt.executeQuery("SELECT SLEEP(30)"); // 3초 후 SocketTimeoutException 발생!

    // 아래의 자원 정리 코드는 예외 발생으로 인해 영원히 도달하지 못함
    stmt.close();
    conn.close();
} catch (SQLException e) {
    // catch 블록에서 명시적으로 conn.close()를 챙겨주지 않고 방치함!
    // 결과적으로 소켓은 영원히 닫히지 않고 ESTABLISHED 상태로 굳어짐.
}
```

## 실습: 소켓 누수 관찰하기

### 1. 환경 실행

터미널을 열고 컨테이너를 구동합니다.

```bash
docker compose up -d --build
```

### 2. 소켓 누수 발생 (타임아웃 유발)

`/reproduce` 엔드포인트를 3번 호출하여 타임아웃을 3번 발생시킵니다.

```bash
curl -s localhost:8080/reproduce | jq
curl -s localhost:8080/reproduce | jq
curl -s localhost:8080/reproduce | jq
```

### 3. 상태 확인 (ESTABLISHED 소켓 관찰)

앱 컨테이너 내부의 네트워크 상태를 확인합니다.

```bash
# 앱 관점에서 닫히지 않고 살아있는 소켓 3개가 ESTABLISHED 상태로 방치되어 있음 (누수)
docker exec socket-leak-app ss -tnp | grep 3306
```

MariaDB 컨테이너 내부의 쿼리 상태를 확인합니다.

```bash
# 앱은 3초 만에 에러를 뱉었지만, DB 관점에서는 소켓이 살아있으므로 여전히 30초 동안 쿼리 진행 중 (좀비)
docker exec mariadb mysql -uroot -ppassword -e "SHOW PROCESSLIST"
```

앱의 파일 디스크립터(FD) 개수가 점점 늘어나는 것을 볼 수 있습니다.

```bash
docker exec socket-leak-app ls /proc/1/fd | wc -l
```

### 4. 실습 종료 및 정리

```bash
docker compose down
```

> **💡 안전한 해결책**
> 실무에서는 `try-with-resources` 블록을 사용하면 예외가 터지더라도 알아서 `conn.close()`가 호출되어 정상적으로 `FIN` 패킷이 발송되고 소켓이 깔끔하게 정리됩니다.
