## 개요

* springboot 액츄레이터의 빌트인 readiness, liveness 설정

## Docker image 목록
* hoisunguk/springboot-readiness:1.0-nogroups: management.endpoint.health.group.readiness.include에 아무것도 지정하지 않음.
* hoisunguk/springboot-readiness:1.0-db: management.endpoint.health.group.readiness.include에 db지정
* hoisunguk/springboot-readiness:1.0-readinessState: management.endpoint.health.group.readiness.include에 readinessState 지정
* hoisunguk/springboot-readiness:1.0-liveness: liveness에 db설정
* hoisunguk/springboot-readiness:1.0-all: management.endpoint.health.group.readiness.include에 db,readinessState 지정

## readiness, liveness 설정

* springboot actuator 라이버리 추가

```gradle
dependencies {
	implementation 'org.springframework.boot:spring-boot-starter-actuator'
}
```

* [application.yaml 설정](./src/main/resources/application.yaml)

```sh
management:
  # 액츄레이터(Actuator) 엔드포인트를 외부로 노출할지 설정
  endpoints:
    web:
      exposure:
        include: health, readiness, liveness

  # livenessProbe, readinessProbe 전용 health 경로
  endpoint:
    health:
      show-details: always
      # group.readiness.include: db 설정이 없으면 readiness에 db상태를 포함하지 않음
      group:
        readiness:
          include: readinessState,db
      probes:
        enabled: true

  # 쿠버네티스 환경이 아닌 경우 명시적 true 설정
  # 쿠버네티스 환경인 경우 자동으로 true 설정됨
  health:
    readinessstate:
      enabled: true
    livenessstate:
      enabled: true
```

## 호출 테스트

* liveness

```sh
$ curl http://localhost:8080/actuator/health/liveness;echo
{"status":"UP"}
```

* readiness

```sh
$ curl http://localhost:8080/actuator/health/readiness;echo
{
  "status": "UP",
  "components": {
    "db": {
      "status": "UP",
      "details": {
        "database": "MySQL",
        "validationQuery": "isValid()"
      }
    },
    "readinessState": {
      "status": "UP"
    }
  }
}
```

## 참고자료

* https://docs.spring.io/spring-boot/reference/actuator/endpoints.html#actuator.endpoints.health.auto-configured-health-indicators
* https://semtul79.tistory.com/15
* https://cprayer.github.io/posts/about-availability-probes-auto-configuration/
* https://toss.tech/article/how-to-work-health-check-in-spring-boot-actuator
