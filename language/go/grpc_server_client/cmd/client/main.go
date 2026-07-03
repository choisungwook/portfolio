package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	echov1 "github.com/choisungwook/portfolio/language/go/grpc_server_client/gen/echo/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	addr := flag.String("addr", "localhost:50051", "gRPC server address")
	name := flag.String("name", "akbun", "name sent to the server")
	flag.Parse()

	conn, err := grpc.NewClient(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	client := echov1.NewEchoServiceClient(conn)
	reply, err := client.SayHello(ctx, &echov1.HelloRequest{Name: *name})
	if err != nil {
		log.Fatalf("say hello: %v", err)
	}

	fmt.Println(reply.GetMessage())
}
