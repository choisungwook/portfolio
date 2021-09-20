# 개요
* h2 인메모리 설정

<br>

# 설정
* application.yaml파일에 설정
```yaml
server:
  port: 10021

spring:
  datasource:
    url: jdbc:h2:mem:testdb
    driverClassName: org.h2.Driver
    username: sa
    password:
  jpa:
    database-platform: org.hibernate.dialect.H2Dialect
  h2:
    console:
      enabled: true
```