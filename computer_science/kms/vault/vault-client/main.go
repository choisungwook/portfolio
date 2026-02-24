// Vault Transit 엔진을 KMS로 사용하는 예제
//
// 6번에서 직접 구현한 KMS 서버를 HashiCorp Vault로 교체한 버전입니다.
// Vault의 Transit secret engine은 KMS 기능을 제공합니다.
// 핵심 차이: 암호화 키가 Vault 내부에서 관리되고, 외부로 노출되지 않습니다.
package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

const (
	vaultAddr  = "http://127.0.0.1:8200"
	vaultToken = "root-token"
	keyName    = "my-app-key"
)

// VaultEncryptRequest는 Vault Transit 암호화 요청
type VaultEncryptRequest struct {
	Plaintext string `json:"plaintext"`
}

// VaultDecryptRequest는 Vault Transit 복호화 요청
type VaultDecryptRequest struct {
	Ciphertext string `json:"ciphertext"`
}

// VaultResponse는 Vault API 응답
type VaultResponse struct {
	Data struct {
		Ciphertext string `json:"ciphertext"`
		Plaintext  string `json:"plaintext"`
	} `json:"data"`
}

func main() {
	fmt.Println("=== Vault Transit Engine으로 KMS 교체 ===")
	fmt.Println()

	// 직접 구현한 KMS 서버 대신 Vault를 사용
	// 변경점: KMS 서버 URL → Vault Transit API
	// 나머지 로직은 동일합니다

	// Step 1: 비밀번호 암호화
	fmt.Println("[Step 1] 비밀번호를 Vault Transit으로 암호화")
	passwords := map[string]string{
		"alice": "alice-secret-123",
		"bob":   "bob-password-456",
	}

	encryptedDB := map[string]string{}
	for user, password := range passwords {
		encrypted := vaultEncrypt(password)
		encryptedDB[user] = encrypted
		fmt.Printf("  - %s: 평문(%s) → 암호문(%s...)\n", user, password, truncate(encrypted, 40))
	}
	fmt.Println()

	// Step 2: 복호화
	fmt.Println("[Step 2] Vault Transit으로 복호화")
	for user, encrypted := range encryptedDB {
		decrypted := vaultDecrypt(encrypted)
		fmt.Printf("  - %s: 복호화 결과 = %s\n", user, decrypted)
	}
	fmt.Println()

	// Step 3: 설정 파일 암호화
	fmt.Println("[Step 3] 설정 파일 민감 값 암호화")
	dbPassword := "super-secret-db-password"
	apiKey := "sk-1234567890abcdef"

	encDBPass := vaultEncrypt(dbPassword)
	encAPIKey := vaultEncrypt(apiKey)

	fmt.Printf("  DB Password: %s → %s...\n", dbPassword, truncate(encDBPass, 40))
	fmt.Printf("  API Key: %s → %s...\n\n", apiKey, truncate(encAPIKey, 40))

	// Step 4: 설정 파일 복호화
	fmt.Println("[Step 4] 설정 파일 복호화")
	fmt.Printf("  DB Password: %s\n", vaultDecrypt(encDBPass))
	fmt.Printf("  API Key: %s\n\n", vaultDecrypt(encAPIKey))

	fmt.Println("=== 교체 완료 ===")
	fmt.Println("직접 구현한 KMS 서버 → Vault Transit으로 교체 성공!")
	fmt.Println("핵심: 클라이언트 코드의 encrypt/decrypt 함수만 교체하면 됩니다.")
}

// vaultEncrypt는 Vault Transit으로 암호화
func vaultEncrypt(plaintext string) string {
	// Vault Transit은 base64 인코딩된 평문을 받습니다
	encoded := base64.StdEncoding.EncodeToString([]byte(plaintext))

	reqBody, _ := json.Marshal(VaultEncryptRequest{Plaintext: encoded})
	req, _ := http.NewRequest("POST", vaultAddr+"/v1/transit/encrypt/"+keyName, bytes.NewBuffer(reqBody))
	req.Header.Set("X-Vault-Token", vaultToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatalf("Vault 연결 실패: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var vaultResp VaultResponse
	if err := json.Unmarshal(body, &vaultResp); err != nil {
		log.Fatalf("응답 파싱 실패: %v (body: %s)", err, string(body))
	}

	return vaultResp.Data.Ciphertext
}

// vaultDecrypt는 Vault Transit으로 복호화
func vaultDecrypt(ciphertext string) string {
	reqBody, _ := json.Marshal(VaultDecryptRequest{Ciphertext: ciphertext})
	req, _ := http.NewRequest("POST", vaultAddr+"/v1/transit/decrypt/"+keyName, bytes.NewBuffer(reqBody))
	req.Header.Set("X-Vault-Token", vaultToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatalf("Vault 연결 실패: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var vaultResp VaultResponse
	if err := json.Unmarshal(body, &vaultResp); err != nil {
		log.Fatalf("응답 파싱 실패: %v (body: %s)", err, string(body))
	}

	// Vault Transit은 base64 인코딩된 평문을 반환합니다
	decoded, err := base64.StdEncoding.DecodeString(vaultResp.Data.Plaintext)
	if err != nil {
		log.Fatalf("base64 디코딩 실패: %v", err)
	}

	return string(decoded)
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen]
	}
	return s
}
