## 개요

* springboot 간단한 웹 애플리케이션
* GET /hello API와 JVM metrics을 수집할 수 있는 엑추레이터 메트릭 엔드포인트 기능 제공
* [소스코드 링크](../../../../backend/spring-helloworld-with-prometheus/)

```sh
# hello API
curl http://localhost:30080/hello
```

```sh
# 메트릭 엔드포인트
curl http://localhost:30080/actuator/prometheus
```
