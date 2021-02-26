# badcase
* 도커라이징에 스프링 프로파일을 하드코딩

# goodcase
* 컨테이너 실행 시 스프링 프로파일을 환경변수로 오버로딩

```
docker run --env JAVA_OPTS="-Dspring.profiles.active=dev"
```