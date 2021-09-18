- [1. 인메모리 사용자](#1-인메모리-사용자)
- [2. 구현방법](#2-구현방법)
  - [2.1 AuthenticationManagerBuilder 이용](#21-authenticationmanagerbuilder-이용)
  - [2.2 UserDetailsService 이용](#22-userdetailsservice-이용)
    - [2.2.1 스프링시큐리티 설정](#221-스프링시큐리티-설정)
    - [2.2.2 인메모리 사용자 설정 클래스](#222-인메모리-사용자-설정-클래스)
- [3. 참고자료](#3-참고자료)

<br>

# 1. 인메모리 사용자
* 스프링시큐리티 설정에 따라 임시 사용자를 생성하는 방법입니다.
* 데이터베이스 등에 저장하지 않으므로 애플리케이션이 실행 중인 동안만 사용자를 사용할 수 있습니다.
* 주로 테스트 목적으로 사용합니다.

<br>

# 2. 구현방법
* 구현방법이 여러 방법이 있습니다. 상황에 맞게 선택해서 사용하시면 됩니다.


## 2.1 AuthenticationManagerBuilder 이용
* 스프링시큐리티를 설정할 때, AuthenticationMangaerBuilder를 이용하는 방법입니다.
* 간단히 테스트목적으로 사용하기에 좋습니다.
* 이 방법의 장점은 PasswordEncoder를 Bean으로 등록안하고 사용할 수 있습니다. 아래 예제는 암호화 알고리즘을 사용하지 않고 password를 그대로 평문으로 저장하는 방법입니다.

```java
@Configuration
@EnableWebSecurity
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
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
                    .permitAll();
    }

    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth.inMemoryAuthentication().withUser("aaa").password("{noop}password").roles("ADMIN");
        auth.inMemoryAuthentication().withUser("bbb").password("{noop}password").roles("ADMIN");
        auth.inMemoryAuthentication().withUser("ccc").password("{noop}password").roles("ADMIN");
    }
}
```

<br>

## 2.2 UserDetailsService 이용
* 스프링 시큐리티가 관리하는 사용자관리 서비스(UserDetailService)를 이용해서 사용자를 생성하는 방법입니다.

### 2.2.1 스프링시큐리티 설정
```java
@Configuration
@EnableWebSecurity
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
                // "/a"api 요청은 모두 허용하고 나머지는 인증요구
                .authorizeRequests()
                    .anyRequest().authenticated()
                    .and()
                // 로그인 페이지는 모두 허용
                .formLogin()
                    .permitAll()
                    .and()
                //  로그아웃 페이지는 모두 허용
                .logout()
                    .permitAll();
    }

    @Bean
    PasswordEncoder passwordEncoder(){
        return new BCryptPasswordEncoder();
    }
}
```

### 2.2.2 인메모리 사용자 설정 클래스
```java
@Component
public class InMemoryDemoUser {
    @Autowired
    private PasswordEncoder passwordEncoder;

    @Bean
    UserDetailsService users() {
        UserDetails admin_user = User.builder()
                .username("admin_user")
                .password(passwordEncoder.encode("password"))
                .roles("ADMIN")
                .build();

        UserDetails normal_user = User.builder()
                .username("normal_user")
                .password(passwordEncoder.encode("password"))
                .roles("USER")
                .build();

        return new InMemoryUserDetailsManager(admin_user, normal_user);
    }
}

```

<br>

# 3. 참고자료
* https://docs.spring.io/spring-security/site/docs/4.1.3.RELEASE/reference/htmlsingle/#jc-authentication-inmememory