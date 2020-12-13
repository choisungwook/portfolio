package main

import (
	"fmt"
)

func main() {
	var length float64 = 1.2
	var width int = 2

	// 에러 발생: 타입 불일치
	fmt.Println(length * width)

	// 에러 발생하지 않음
	fmt.Println(2 * 3.12)
}
