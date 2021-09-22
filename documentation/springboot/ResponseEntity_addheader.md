# 개요
* ResponseEntity에서 header추가

<br>

# 상세내용
* HttpHeader 객체를 생성하고 add로 추가하고자 하는 값을 설정

```java
@RestControlle
@Slf4j
public class HelloworldController {

    @GetMapping("/")
    public ResponseEntity<Object> helloworld(){
        String message = "helloworld";
        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Type", "application/json;charset=UTF-8");

        return new ResponseEntity<>(new DemoResponse(message), headers, HttpStatus.OK);
    }

    private static class DemoResponse{
        private String message;

        public DemoResponse(String message){
            this.message = message;
        }
    }
}
```