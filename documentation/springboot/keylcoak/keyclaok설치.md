# 개요
* docker을 이용한 keyclaok 설치

<br>

# 준비
* mariadb 설치 필요
> mariadb 설치 참고: https://malwareanalysis.tistory.com/140
* mariadb 데이터베이스 생성과 계정 권한 설정
> 설정 참고: https://malwareanalysis.tistory.com/161

<br>

# 설치
* DB_ADDR을 자기 IP로 수정
```sh
docker run --name keycloak -d \
-p 13050:8080 \
-e KEYCLOAK_USER=admin \
-e KEYCLOAK_PASSWORD=password \
-e DB_VENDOR=mariadb \
-e DB_ADDR=192.168.25.59 \
-e DB_SCHEMA=Mariadb \
-e DB_USER=test \
-e DB_PASSWORD=password \
-e DB_DATABASE=keycloak \
-e DB_PORT=13306 \
jboss/keycloak:15.0.0
```

<br>

# 참고자료
* https://hub.docker.com/r/jboss/keycloak/