# gRPC는 왜 proto 계약부터 봐야 할까

HTTP API를 만들 때는 요청 경로와 JSON 모양을 코드와 문서에서 따로 맞추는 일이 많습니다. 그런데 gRPC는 서버와 클라이언트가 먼저 같은 `proto` 파일을 공유합니다. 왜 gRPC에서는 구현보다 계약을 먼저 보는 편이 좋을까요?

## proto 파일은 무엇을 고정하나

`proto` 파일은 서비스 이름, RPC 메서드, 요청 메시지, 응답 메시지를 한곳에 정의합니다. 이 핸즈온에서는 `EchoService`가 `SayHello` 요청을 받고 `HelloReply`를 돌려줍니다.

서비스 계약은 아래 파일에 있습니다.

```proto
syntax = "proto3";

package echo.v1;

option go_package = "github.com/choisungwook/portfolio/language/go/grpc_server_client/gen/echo/v1;echov1";

service EchoService {
  rpc SayHello(HelloRequest) returns (HelloReply);
}
```

이 정의가 있으면 서버는 `SayHello`를 구현해야 하고, 클라이언트는 같은 메서드 이름과 메시지 타입으로 호출합니다. **즉 proto는 서버와 클라이언트가 따로 해석하지 않도록 통신 계약을 고정합니다.**

## 코드를 왜 직접 쓰지 않고 생성할까

gRPC는 네트워크 호출을 일반 함수 호출처럼 다루도록 도와줍니다. 하지만 실제로는 메시지 직렬화, 메서드 경로, 클라이언트 stub, 서버 인터페이스가 필요합니다.

이 파일들을 사람이 직접 쓰면 빠르게 어긋납니다. proto에서 Go 코드를 생성하면 서버와 클라이언트가 같은 타입을 import합니다. 장점은 계약 불일치를 컴파일 단계에서 더 빨리 발견할 수 있다는 점입니다. 단점은 `protoc`, `protoc-gen-go`, `protoc-gen-go-grpc` 같은 생성 도구가 필요하다는 점입니다.

proto 코드를 다시 생성하려면 아래 명령을 실행합니다.

```bash
make proto
```

이 명령은 `.tools/bin` 아래에 Go protoc plugin을 설치하고 `gen/echo/v1` 아래에 생성 코드를 만듭니다.

## proto를 바꾸면 무엇을 확인해야 할까

메시지 필드를 추가하거나 RPC 메서드를 바꾸면 생성 코드를 다시 만들고 서버와 클라이언트를 함께 빌드해야 합니다. 서버만 바꾸거나 클라이언트만 바꾸면 통신이 성공하더라도 의도한 계약과 다를 수 있습니다.

장점은 변경 지점이 `proto/echo/v1/echo.proto`로 모인다는 점입니다. 단점은 생성 코드를 함께 관리해야 하므로 변경 리뷰에서 사람이 읽을 파일과 기계가 만든 파일을 구분해야 한다는 점입니다.

정리하면, gRPC에서 proto를 먼저 보는 이유는 구현보다 통신 계약이 먼저 흔들리기 때문입니다. proto를 기준으로 코드를 생성하고, 서버와 클라이언트가 같은 타입을 쓰는지 확인하면 로컬 실습에서도 gRPC의 핵심 흐름이 보입니다.

## 참고자료

- gRPC Go Quick start: <https://grpc.io/docs/languages/go/quickstart/>
- Protocol Buffers Go generated code guide: <https://protobuf.dev/reference/go/go-generated/>
