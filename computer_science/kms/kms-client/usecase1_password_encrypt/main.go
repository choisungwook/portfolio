// usecase1: 비밀번호를 KMS로 암호화하여 DB에 저장하는 시나리오
//
// KMS 없이 비밀번호를 평문으로 저장하면 DB가 유출될 때 모든 비밀번호가 노출됩니다.
// KMS를 사용하면 암호화 키를 안전하게 관리하고, 비밀번호를 암호화하여 저장할 수 있습니다.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

const kmsServerURL = "http://localhost:8080"

type EncryptRequest struct {
	KeyID     string `json:"key_id"`
	Plaintext string `json:"plaintext"`
}

type EncryptResponse struct {
	KeyID      string `json:"key_id"`
	Ciphertext string `json:"ciphertext"`
}

type DecryptRequest struct {
	KeyID      string `json:"key_id"`
	Ciphertext string `json:"ciphertext"`
}

type DecryptResponse struct {
	KeyID     string `json:"key_id"`
	Plaintext string `json:"plaintext"`
}

type CreateKeyRequest struct {
	KeyID string `json:"key_id"`
}

// simulatedDB는 메모리 기반 DB 시뮬레이션
var simulatedDB = map[string]string{}

func main() {
	fmt.Println("=== Use Case 1: 비밀번호 암호화 저장 ===")
	fmt.Println()

	// Step 1: KMS에 암호화 키 생성
	fmt.Println("[Step 1] KMS에 암호화 키 생성")
	createKey("password-key")

	// Step 2: 사용자 비밀번호를 KMS로 암호화
	users := map[string]string{
		"alice": "alice-secret-123",
		"bob":   "bob-password-456",
		"carol": "carol-pass-789",
	}

	fmt.Println("[Step 2] 사용자 비밀번호를 KMS로 암호화하여 DB에 저장")
	for username, password := range users {
		encrypted := encrypt("password-key", password)
		simulatedDB[username] = encrypted
		fmt.Printf("  - %s: 평문(%s) → 암호문(%s...)\n", username, password, truncate(encrypted, 30))
	}
	fmt.Println()

	// Step 3: DB에 저장된 데이터 확인 (암호화된 상태)
	fmt.Println("[Step 3] DB에 저장된 데이터 (암호화 상태)")
	for username, encrypted := range simulatedDB {
		fmt.Printf("  - %s: %s...\n", username, truncate(encrypted, 50))
	}
	fmt.Println()

	// Step 4: 로그인 시 비밀번호 검증 (복호화 후 비교)
	fmt.Println("[Step 4] 로그인 시뮬레이션 - alice가 올바른 비밀번호로 로그인")
	loginAttempt("alice", "alice-secret-123")

	fmt.Println("[Step 4] 로그인 시뮬레이션 - alice가 잘못된 비밀번호로 로그인")
	loginAttempt("alice", "wrong-password")
}

func loginAttempt(username, inputPassword string) {
	encrypted, exists := simulatedDB[username]
	if !exists {
		fmt.Printf("  결과: %s 사용자를 찾을 수 없음\n\n", username)
		return
	}

	decrypted := decrypt("password-key", encrypted)
	if decrypted == inputPassword {
		fmt.Printf("  결과: %s 로그인 성공!\n\n", username)
	} else {
		fmt.Printf("  결과: %s 로그인 실패 (비밀번호 불일치)\n\n", username)
	}
}

func createKey(keyID string) {
	reqBody, _ := json.Marshal(CreateKeyRequest{KeyID: keyID})
	resp, err := http.Post(kmsServerURL+"/keys", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Fatalf("KMS 서버 연결 실패: %v", err)
	}
	defer resp.Body.Close()
	fmt.Printf("  키 생성 완료: %s (status: %d)\n\n", keyID, resp.StatusCode)
}

func encrypt(keyID, plaintext string) string {
	reqBody, _ := json.Marshal(EncryptRequest{KeyID: keyID, Plaintext: plaintext})
	resp, err := http.Post(kmsServerURL+"/encrypt", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Fatalf("암호화 실패: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var encResp EncryptResponse
	json.Unmarshal(body, &encResp)
	return encResp.Ciphertext
}

func decrypt(keyID, ciphertext string) string {
	reqBody, _ := json.Marshal(DecryptRequest{KeyID: keyID, Ciphertext: ciphertext})
	resp, err := http.Post(kmsServerURL+"/decrypt", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Fatalf("복호화 실패: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var decResp DecryptResponse
	json.Unmarshal(body, &decResp)
	return decResp.Plaintext
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen]
	}
	return s
}
