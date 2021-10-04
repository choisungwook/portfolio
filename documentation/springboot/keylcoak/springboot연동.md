
# 프로젝트 생성
* spring web, springsecurity 라이브러리 추가

[create_project](imgs/springinitalizr.png)

<br>

# dependency 설정
* pom.xml(maven)에 keycloak 라이브러리 추가
```xml
<!-- https://mvnrepository.com/artifact/org.keycloak/keycloak-spring-boot-starter -->
<dependency>
    <groupId>org.keycloak</groupId>
    <artifactId>keycloak-spring-boot-starter</artifactId>
    <version>15.0.1</version>
</dependency>
```

<br>

# token 생성
```sh
curl -X POST 'http://127.0.0.1:13050/auth/realms/springboot-demo/protocol/openid-connect/token' \
 --header 'Content-Type: application/x-www-form-urlencoded' \
 --data-urlencode 'grant_type=password' \
 --data-urlencode 'client_id=demo' \
 --data-urlencode 'client_secret=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx' \
 --data-urlencode 'username=testuser_1' \
 --data-urlencode 'password=password'
```

# 참고자료
* 공식문서: https://www.keycloak.org/docs/latest/securing_apps/#_spring_security_adapter
* https://medium.com/devops-dudes/securing-spring-boot-rest-apis-with-keycloak-1d760b2004e
* https://developers.redhat.com/devnation/tech-talks/secure-vuejs-keycloak