// usecase2: 애플리케이션 설정 파일의 민감한 값을 KMS로 암호화/복호화하는 시나리오
//
// DB 접속 정보, API 키 등 민감한 설정값을 평문으로 저장하면
// 설정 파일이 유출될 때 모든 시스템이 위험해집니다.
// KMS를 사용하면 설정값을 암호화하여 안전하게 관리할 수 있습니다.
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

// AppConfig는 애플리케이션 설정 구조체
type AppConfig struct {
	DBHost     string `json:"db_host"`
	DBPort     string `json:"db_port"`
	DBUser     string `json:"db_user"`
	DBPassword string `json:"db_password"`
	APIKey     string `json:"api_key"`
	JWTSecret  string `json:"jwt_secret"`
}

// EncryptedConfig는 암호화된 설정 구조체
type EncryptedConfig struct {
	DBHost     string `json:"db_host"`
	DBPort     string `json:"db_port"`
	DBUser     string `json:"db_user"`
	DBPassword string `json:"db_password"`
	APIKey     string `json:"api_key"`
	JWTSecret  string `json:"jwt_secret"`
}

func main() {
	fmt.Println("=== Use Case 2: 애플리케이션 설정 암호화 ===")
	fmt.Println()

	// Step 1: KMS에 설정 암호화용 키 생성
	fmt.Println("[Step 1] KMS에 설정 암호화용 키 생성")
	createKey("config-key")

	// Step 2: 평문 설정 (이렇게 저장하면 위험!)
	plainConfig := AppConfig{
		DBHost:     "db.internal.example.com",
		DBPort:     "5432",
		DBUser:     "admin",
		DBPassword: "super-secret-db-password",
		APIKey:     "sk-1234567890abcdef",
		JWTSecret:  "my-jwt-signing-secret",
	}

	fmt.Println("[Step 2] 평문 설정 (이렇게 저장하면 위험합니다)")
	printJSON(plainConfig)

	// Step 3: 민감한 값만 KMS로 암호화
	fmt.Println("[Step 3] 민감한 값을 KMS로 암호화")
	encryptedConfig := EncryptedConfig{
		DBHost:     plainConfig.DBHost,
		DBPort:     plainConfig.DBPort,
		DBUser:     plainConfig.DBUser,
		DBPassword: encrypt("config-key", plainConfig.DBPassword),
		APIKey:     encrypt("config-key", plainConfig.APIKey),
		JWTSecret:  encrypt("config-key", plainConfig.JWTSecret),
	}

	fmt.Println("  암호화된 설정 파일:")
	printJSON(encryptedConfig)

	// Step 4: 애플리케이션 시작 시 복호화
	fmt.Println("[Step 4] 애플리케이션 시작 시 설정값 복호화")
	restoredConfig := AppConfig{
		DBHost:     encryptedConfig.DBHost,
		DBPort:     encryptedConfig.DBPort,
		DBUser:     encryptedConfig.DBUser,
		DBPassword: decrypt("config-key", encryptedConfig.DBPassword),
		APIKey:     decrypt("config-key", encryptedConfig.APIKey),
		JWTSecret:  decrypt("config-key", encryptedConfig.JWTSecret),
	}

	fmt.Println("  복호화된 설정:")
	printJSON(restoredConfig)

	// Step 5: 원본과 비교
	fmt.Println("[Step 5] 원본 설정과 복호화된 설정 비교")
	if plainConfig.DBPassword == restoredConfig.DBPassword &&
		plainConfig.APIKey == restoredConfig.APIKey &&
		plainConfig.JWTSecret == restoredConfig.JWTSecret {
		fmt.Println("  결과: 모든 민감한 값이 정상적으로 복호화되었습니다!")
	} else {
		fmt.Println("  결과: 복호화 결과가 원본과 다릅니다 (오류)")
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

func printJSON(v any) {
	data, _ := json.MarshalIndent(v, "  ", "  ")
	fmt.Printf("  %s\n\n", string(data))
}
