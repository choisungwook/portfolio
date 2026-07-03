package server

import (
	"context"
	"testing"

	echov1 "github.com/choisungwook/portfolio/language/go/grpc_server_client/gen/echo/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestSayHello(t *testing.T) {
	service := NewEchoService()

	reply, err := service.SayHello(context.Background(), &echov1.HelloRequest{Name: "grpc"})
	if err != nil {
		t.Fatalf("SayHello returned error: %v", err)
	}

	if reply.GetMessage() != "hello, grpc" {
		t.Fatalf("message = %q, want %q", reply.GetMessage(), "hello, grpc")
	}
}

func TestSayHelloRejectsEmptyName(t *testing.T) {
	service := NewEchoService()

	_, err := service.SayHello(context.Background(), &echov1.HelloRequest{Name: " "})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("status.Code(err) = %v, want %v", status.Code(err), codes.InvalidArgument)
	}
}
