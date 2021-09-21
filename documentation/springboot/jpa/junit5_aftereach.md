# 개요
* junit5에서 테스트 종료시마다 데이터베이스 초기화 하는방법

<br>

# 상세내용
* junit5에서는 @aftereach을 설정한 함수는 매번 테스트가 끝날때마다 자동호출된다.
* @aftereach에 설정한 함수에 JPA deleteall()를 사용하면 데이터베이스 테이블이 초기화된다.

* 예제
```java
@SpringBootTest
class ClassroomServiceTest {
    @Autowired
    ClassroomRepository classroomRepository;

    @Autowired
    SchoolRepository schoolRepository;

    @AfterEach
    public void AfterEach(){
        classroomRepository.deleteAllInBatch();
        schoolRepository.deleteAllInBatch();
    }

    @Test
    @DisplayName("junit 설정이 잘 완료되었는지 확인")
    public void Dummy(){

    }
}
```

* 예제 로그
```sql
Hibernate:
    delete
    from
        classroom
Hibernate:
    delete
    from
        school
```
