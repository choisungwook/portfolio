# go파일 실해방법
go run {파일이름}.go로 실행할 수 있습니다.
| go파일에는 main 패키지, main함수가 있어야 합니다.
```sh
go run main.go
```

여러개 파일을 실행하려면 아스타(*)를 사용합니다.
```sh
go run *.go
```

# main함수
main package의 main함수가 go언어 시작(entrypoint)입니다.
```go
package main

import "fmt"

func main() {
	fmt.Print("hello world")
}
```

# args
go main함수가 호출될 때 arguments를 파싱

```go
// 실행방법: go run main.go https://jsonplaceholder.typicode.com/todos/1
package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
)

func main() {
	args := os.Args

	if len(args) < 2 {
		fmt.Printf("Useage ./main.go <url>\n")
		os.Exit(1)
	}

	if _, err := url.ParseRequestURI(args[1]); err != nil {
		fmt.Printf("URL is invalid format: %s\n", err)
		os.Exit(1)
	}

	response, err := http.Get(args[1])
	if err != nil {
		log.Fatal(err)
	}

	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Http Status Code: %d\nBody: %s", response.StatusCode, body)
}
```

# json데이터를 구조체로 파싱
구조체 메타데이터와 json.Unmarshal함수로 json데이터를 쉽게 구조체로 파싱할 수 있습니다. 단점은 파싱과정에서 구조체(스키마)와 일치하지 않은 데이터가 있을 경우 오류가 발생합니다.
```go
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
)

type Todos struct {
	UserId    int    `json:"userId"`
	Id        int    `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
}

func main() {
	args := os.Args

	if len(args) < 2 {
		fmt.Printf("Useage ./main.go <url>\n")
		os.Exit(1)
	}

	if _, err := url.ParseRequestURI(args[1]); err != nil {
		fmt.Printf("URL is invalid format: %s\n", err)
		os.Exit(1)
	}

	response, err := http.Get(args[1])
	if err != nil {
		log.Fatal(err)
	}

	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		log.Fatal(err)
	}

	if response.StatusCode != 200 {
		fmt.Printf("Invalid http status code %d", response.StatusCode)
		os.Exit(1)
	}

	var todos Todos
	err = json.Unmarshal(body, &todos)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("JSON Parse\ntodos: %v", todos)
}
```

# 참고자료
* https://go.dev/tour/