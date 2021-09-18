# jwtfilter 구현과정
* 단순히 Jwt로직만 추가하는 것이 아니라 인증을 커스터마이징하고 jwt로직을 넣어야합니다.

1. 사용자를 관리하기 위한 엔티티와 서비스를 생성해야 합니다.
  * User Entity 생성
2. 스프링시큐리티가 우리가 만든 사용자 엔티티를 인식하기위한 설정이 필요합니다.
  * UserDetail 설정
  * UserDetailService 설정
3. 스프링시큐리티가 우리가 만든 사용자 엔티티와 사용자 서비스를 이용해서 인증을 할 수 있도록 설정이 필요합니다.
  * Provider 설정
4. JWT토큰을 생성하는 객체가 필요합니다.
  * JWT 클래스 생성
5. 스프링시큐리티가 인증을 성공하면 JWT토큰을 발급하는 과정이 필요합니다.
  * 필터 생성
  * Success, Failer 핸들러 설정

<br>

# JWTFileter 추가
1. username과 password로인증하는 필터를 상속하여 JWTfilter를 구현합니다.
2. 상속 후에 attempAuthentication함수를 override하시면 됩니다. 함수이름 그대로 로그인 요청이 오면 attempAuthentication함수가 호출됩니다.
```java
public class JwtFilter extends UsernamePasswordAuthenticationFilter {

    /***
     * 로그인을 시도하면 attempAuthentication함수가 호출된다.
     * @param request
     * @param response
     * @return
     * @throws AuthenticationException
     */
    @Override
    public Authentication attemptAuthentication(HttpServletRequest request, HttpServletResponse response) throws AuthenticationException {
        return super.attemptAuthentication(request, response);
    }
}

```

3. JWTfilter를 스프링시큐리티 filterchain에 등록해줍니다.
```java
@Configuration
@EnableWebSecurity
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {
    ...

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        JwtFilter jwtFilter = new JwtFilter();
        http
                .authorizeRequests()
                    .anyRequest().authenticated()
                    .and()
                // 로그인 페이지는 모두 허용
                .formLogin()
                    .permitAll()
                    .and()
                //  로그아웃 페이지는 모두 허용
                .logout()
                    .permitAll()
                    .and()
                .csrf().disable()
                .addFilter(jwtFilter);
    }
}
```

4. 로그인을 시도하면 jwtfilter의 attemptAuthentication함수가 호출되는지 확인합니다.
> 인증정보 토큰을 넘겨주지 않아 에러가 발생합니다. 현재 단계에서 에러는 정상적인 상황입니다.
* 간단히 로거를 사용해서 확인할 수 있습니다.
* 또는 spring(boot)를 디버깅모드로 실행해서 확인해도 됩니다.
```java
@Slf4j
public class JwtFilter extends UsernamePasswordAuthenticationFilter {

    /***
     * 로그인을 시도하면 attempAuthentication함수가 호출된다.
     * @param request
     * @param response
     * @return
     * @throws AuthenticationException
     */
    @Override
    public Authentication attemptAuthentication(HttpServletRequest request, HttpServletResponse response) throws AuthenticationException {
        logger.debug("attemptAuthentication is called");
        return super.attemptAuthentication(request, response);
    }
}
```

5. (todo) 인증 로직 추가
6. jwt dependency 추가
> 참고자료: https://mvnrepository.com/artifact/com.auth0/java-jwt
```xml
<dependency>
  <groupId>com.auth0</groupId>
  <artifactId>java-jwt</artifactId>
  <version>3.18.1</version>
</dependency>
```

7. jwt helper 클래스 생성


# 참고자료
* [1] https://youtu.be/w8wY2x5ezyU
* [2] spring-security-usernamepasswordauthenticationfilter%EC%9D%98-%EB%8D%94-%EA%B9%8A%EC%9D%80-%EC%9D%B4%ED%95%B4-8b5927dbc037
* [3] https://youtu.be/VVn9OG9nfH0