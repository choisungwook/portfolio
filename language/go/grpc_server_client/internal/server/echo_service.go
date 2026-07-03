package server

import (
	"context"
	"fmt"
	"strings"

	echov1 "github.com/choisungwook/portfolio/language/go/grpc_server_client/gen/echo/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type EchoService struct {
	echov1.UnimplementedEchoServiceServer
}

func NewEchoService() *EchoService {
	return &EchoService{}
}

func (s *EchoService) SayHello(ctx context.Context, req *echov1.HelloRequest) (*echov1.HelloReply, error) {
	name := strings.TrimSpace(req.GetName())
	if name == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}

	return &echov1.HelloReply{Message: fmt.Sprintf("hello, %s", name)}, nil
}
