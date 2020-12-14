package main

import (
	"bufio"
	"fmt"
	"log"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"time"
)

func generateRandInt() int {
	seconds := time.Now().Unix()
	rand.Seed(seconds)

	return rand.Intn(10) + 1
}

func main() {
	fmt.Println("게임을 시작합니다")
	goal := generateRandInt()

	reader := bufio.NewReader(os.Stdin)
	success := false

	for i := 0; i < 3; i++ {

		fmt.Println("숫자를 입력하세요")
		input, err := reader.ReadString('\n')

		if err != nil {
			log.Fatal("입력 에러")
		}

		input = strings.TrimSpace(input)

		// string to int
		guess, err := strconv.Atoi(input)

		if err != nil {
			log.Fatal("숫자 변환 오류")
		}

		if guess < goal {
			fmt.Println("맞추려는 숫자가 더 큽니다.")
		} else if guess > goal {
			fmt.Println("맞추려는 숫자가 더 작습니다")
		} else {
			fmt.Println("정답입니다")
			success = true
			break
		}
		fmt.Println("다시 시도하세요")
	}

	if success {
		fmt.Println("축하합니다 당신이 이겼습니다")
	} else {
		fmt.Println("당신은 졌습니다")
		// 포맷팅
		fmt.Printf("정답 %v", goal)
	}
}
