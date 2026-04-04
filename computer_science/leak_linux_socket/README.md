# database_connection

소켓 누수가 OS의 FD(파일 디스크립터)를 고갈시키고 연관 서비스 장애로 확산되는 과정을 재현하는 공간이다. 재현 수단으로 MariaDB JDBC 커넥터의 소켓 누수 버그(CONJ-863)를 사용한다.

## 문서

| 문서 | 설명 |
|------|------|
| [이론: 소켓 누수와 FD 고갈](./docs/mariadb-socket-leak.md) | 소켓 누수 원리, CONJ-863 버그, SocketTimeoutException, HikariCP 메커니즘, CPU 영향 |
| [핸즈온: 소켓 누수 재현](./docs/hands-on.md) | Docker 환경에서 소켓 누수 재현, ss 디버깅, k6 부하 + Grafana 모니터링 |
