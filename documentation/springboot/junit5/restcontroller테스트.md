# 개요
* juni5를 사용하여 restcontroller 테스트
* 테스트 방법이 정말 다양하다.
* 이 문서는 mockito를 사용하여 test하는 방법을 소개한다.

<br>

# 설정
## Test class설정 (선택1)
* junit5에서 springboot를 사용하기 위해 @Extendwith와 @WebMvcTest를 사용한다.
> @WebMvcTest는 일부 bean만 사용하므로 테스트에 주의

```java
@ExtendWith(SpringExtension.class)
@WebMvcTest(DemoController.class)
class DemoControllerTest {

}
```

## Test class설정 (선택2)

```java
@SpringBootTest
@AutoConfigureMockMvc
class DemoControllerTest {

}
```

## Mock설정
* mvc를 @Autowired한다.
* 사용할 spring 컴퍼넌트에게 @MockBean을 설정한다.
>

```java
@SpringBootTest
@AutoConfigureMockMvc
class DemoControllerTest {
    @Autowired
    MockMvc mockmvc;
}
```

<br>

# 테스트 실행
## get
* perform에 테스트할 api를 설정한다.
* 테스트를 출력하기 위해 andDo()에 print()를 설정한다.
* 기대하는 결과를andExpect를 설정한다.
  * http 상태코드
  * 리턴 값
  * ...

```java
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class DemoControllerTest throws Exception {
    @Autowired
    MockMvc mockmvc;

    @Test
    public void helloworld(){
        this.mockmvc.perform(get("/helloworld"))
                    .andDo(print())
                    .andExpect(status().isOk())
                    .andExpect(content().string(containsString("helloworld")))
    }
}
```

## post
* perform에 테스트할 api를 설정한다.
* contentType(body 타입)은 json으로 설정한다.
* 전달할 request_body를 content로 전달한다.
  * request_body를 objectmapper를 이용해서 string으로 변환한다.
* 기대하는 결과를andExpect를 설정한다.
  * http 상태코드
  * 리턴 값
  * ...
* 테스트를 출력하기 위해 andDo()에 print()를 설정한다.

```java
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class DemoControllerTest throws Exception {
    @Autowired
    MockMvc mockmvc;

    @Test
    public void helloworld(){
        String classroom_name = "classroom1";
        RequestCreateClassroomDTO requestCreateClassroomDTO = new RequestCreateClassroomDTO();
        requestCreateClassroomDTO.setClassroom_name(classroom_name);

        ObjectMapper objectMapper = new ObjectMapper();

        mockMvc.perform(post("/helloworld")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(requestCreateClassroomDTO)))
                .andExpect(status().isOk())
                .andDo(print());
    }
}
```

<br>

# 참고자료
* https://effectivesquid.tistory.com/entry/Spring-Boot-starter-test-%EC%99%80-Junit5%EB%A5%BC-%EC%9D%B4%EC%9A%A9%ED%95%9C-%ED%85%8C%EC%8A%A4%ED%8A%B8
* https://frozenpond.tistory.com/82
* https://frontbackend.com/spring-boot/spring-boot-2-junit-5-mockito
* https://www.javachinna.com/spring-boot-rest-controller-junit-tests-mockito/