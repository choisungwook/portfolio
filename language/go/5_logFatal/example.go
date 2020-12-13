package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
)

func main() {
	fmt.Println("입력을 받습니다")
	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')

	// 에러 발생 시 로그 출력 후 프로그램 종료
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(input)
}
