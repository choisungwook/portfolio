package main

import (
	"log"
	"net"
	"os"

	echov1 "github.com/choisungwook/portfolio/language/go/grpc_server_client/gen/echo/v1"
	"github.com/choisungwook/portfolio/language/go/grpc_server_client/internal/server"
	"google.golang.org/grpc"
)

func main() {
	addr := os.Getenv("GRPC_ADDR")
	if addr == "" {
		addr = ":50051"
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	echov1.RegisterEchoServiceServer(grpcServer, server.NewEchoService())

	log.Printf("grpc server listening on %s", addr)
	if err := grpcServer.Serve(listener); err != nil {
		log.Fatalf("serve: %v", err)
	}
}
