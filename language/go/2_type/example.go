package main

import (
	"fmt"
	"reflect"
)

func main() {
	// 문자
	fmt.Println(reflect.TypeOf(42))
	// 실수
	fmt.Println(reflect.TypeOf(3.14))
	// boolean
	fmt.Println(reflect.TypeOf(true))
	// String
	fmt.Println(reflect.TypeOf("hello World"))
}
