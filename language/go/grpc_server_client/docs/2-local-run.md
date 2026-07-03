# gRPC 서버와 클라이언트는 어떻게 통신할까

proto 계약을 만들었다면 다음 질문은 실행 흐름입니다. 서버와 클라이언트가 같은 Go 타입을 쓰더라도 실제 네트워크 호출은 어떻게 확인할 수 있을까요?

## 서버는 어떤 역할을 하나

서버는 생성된 `EchoServiceServer` 인터페이스를 구현하고 `:50051` 포트에서 gRPC 요청을 받습니다. 이 예제는 `name` 값이 비어 있으면 `InvalidArgument` 오류를 반환하고, 값이 있으면 인사 메시지를 응답합니다.

로컬에서 서버를 실행합니다.

```bash
make server
```

서버 주소를 바꾸고 싶으면 `GRPC_ADDR` 환경 변수를 사용합니다.

```bash
GRPC_ADDR=:50052 make server
```

## 클라이언트는 무엇을 확인하나

클라이언트는 생성된 `EchoServiceClient`를 만들고 `SayHello`를 호출합니다. 이때 클라이언트는 proto에서 생성된 요청 타입을 사용하므로 서버와 같은 계약을 기준으로 호출합니다.

다른 터미널에서 클라이언트를 실행합니다.

```bash
make client
```

직접 이름을 넘기려면 Go 명령을 실행합니다.

```bash
go run ./cmd/client -addr localhost:50051 -name grpc
```

정상 실행되면 아래처럼 응답 메시지가 출력됩니다.

```text
hello, grpc
```

## Docker Compose로 실행하면 무엇이 달라질까

로컬 Go 환경이 없어도 Docker Compose로 서버와 클라이언트를 같은 네트워크에서 실행할 수 있습니다. 장점은 실행 환경을 맞추기 쉽다는 점입니다. 단점은 이미지를 빌드해야 하므로 단순한 로컬 `go run`보다 느립니다.

서버 컨테이너를 실행합니다.

```bash
make up
```

다른 터미널에서 클라이언트 컨테이너를 실행합니다.

```bash
make compose-client
```

실습이 끝나면 컨테이너를 정리합니다.

```bash
make down
```

## grpcurl은 언제 쓰면 좋을까

`grpcurl`을 쓰면 별도 클라이언트 코드 없이 gRPC 메서드를 호출할 수 있습니다. 장점은 디버깅이 빠르다는 점입니다. 단점은 로컬에 `grpcurl`이 필요하고, reflection을 켜지 않은 서버는 호출 준비가 더 필요하다는 점입니다.

이 핸즈온은 Go 클라이언트로 호출 흐름을 확인하는 데 집중합니다. `grpcurl` 기반 확인은 환경 의존성이 있어 별도 확장 주제로 남깁니다. 확인 필요.

정리하면, gRPC 통신은 서버와 클라이언트가 같은 proto 생성 코드를 기준으로 요청과 응답을 주고받는 흐름입니다. 로컬 `go run`은 빠른 확인에 좋고, Docker Compose는 실행 환경을 맞춰 재현하는 데 좋습니다.

## 참고자료

- gRPC Go Basics: <https://grpc.io/docs/languages/go/basics/>
- Docker Compose documentation: <https://docs.docker.com/compose/>
