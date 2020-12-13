package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	fmt.Println("입력을 받습니다")
	reader := bufio.NewReader(os.Stdin)
	// 엔터가 입력되기 전까지 입력
	input, _ := reader.ReadString('\n')

	fmt.Println(input)
}
