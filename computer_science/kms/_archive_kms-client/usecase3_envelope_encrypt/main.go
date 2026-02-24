// usecase3: Envelope Encryption(봉투 암호화) 시나리오
//
// 대용량 데이터를 직접 KMS로 암호화하면 네트워크 부하가 큽니다.
// Envelope Encryption은 데이터를 로컬에서 DEK(Data Encryption Key)로 암호화하고,
// DEK만 KMS의 KEK(Key Encryption Key)로 암호화하는 기법입니다.
// AWS KMS도 이 방식을 사용합니다.
package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
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

// EnvelopeEncryptedData는 봉투 암호화된 데이터 구조체
type EnvelopeEncryptedData struct {
	EncryptedDEK  string `json:"encrypted_dek"`
	EncryptedData string `json:"encrypted_data"`
	KEKKeyID      string `json:"kek_key_id"`
}

func main() {
	fmt.Println("=== Use Case 3: Envelope Encryption (봉투 암호화) ===")
	fmt.Println()

	// Step 1: KMS에 KEK(Key Encryption Key) 생성
	fmt.Println("[Step 1] KMS에 KEK(Key Encryption Key) 생성")
	createKey("kek-master")

	// Step 2: 대용량 데이터 준비
	largeData := "이것은 대용량 파일의 내용입니다. " +
		"실제로는 수 MB ~ 수 GB의 파일이 될 수 있습니다. " +
		"이 데이터를 직접 KMS로 보내면 네트워크 부하가 매우 큽니다. " +
		"따라서 Envelope Encryption을 사용합니다."

	fmt.Println("[Step 2] 암호화할 대용량 데이터 준비")
	fmt.Printf("  데이터 크기: %d bytes\n", len(largeData))
	fmt.Printf("  데이터 내용: %s...\n\n", largeData[:50])

	// Step 3: Envelope Encryption 수행
	fmt.Println("[Step 3] Envelope Encryption 수행")
	fmt.Println("  3-1. 로컬에서 DEK(Data Encryption Key) 생성")
	dek := generateDEK()
	fmt.Printf("  DEK 생성 완료: %s...\n", hex.EncodeToString(dek)[:20])

	fmt.Println("  3-2. DEK로 데이터를 로컬에서 암호화 (네트워크 사용 안함)")
	encryptedData := localEncrypt(dek, []byte(largeData))
	fmt.Printf("  암호화된 데이터: %s...\n", hex.EncodeToString(encryptedData)[:40])

	fmt.Println("  3-3. DEK를 KMS의 KEK로 암호화 (작은 데이터만 네트워크 전송)")
	encryptedDEK := encrypt("kek-master", hex.EncodeToString(dek))
	fmt.Printf("  암호화된 DEK: %s...\n\n", encryptedDEK[:40])

	// Step 4: 봉투 암호화된 데이터 구조
	envelope := EnvelopeEncryptedData{
		EncryptedDEK:  encryptedDEK,
		EncryptedData: hex.EncodeToString(encryptedData),
		KEKKeyID:      "kek-master",
	}

	fmt.Println("[Step 4] 저장되는 봉투 암호화 데이터 구조")
	data, _ := json.MarshalIndent(envelope, "  ", "  ")
	fmt.Printf("  %s\n\n", string(data))

	// Step 5: Envelope Decryption (복호화)
	fmt.Println("[Step 5] Envelope Decryption (복호화)")
	fmt.Println("  5-1. KMS에서 DEK 복호화")
	decryptedDEKHex := decrypt(envelope.KEKKeyID, envelope.EncryptedDEK)
	decryptedDEK, _ := hex.DecodeString(decryptedDEKHex)
	fmt.Printf("  복호화된 DEK: %s...\n", hex.EncodeToString(decryptedDEK)[:20])

	fmt.Println("  5-2. 복호화된 DEK로 데이터 로컬 복호화")
	encData, _ := hex.DecodeString(envelope.EncryptedData)
	decryptedData := localDecrypt(decryptedDEK, encData)
	fmt.Printf("  복호화된 데이터: %s\n\n", string(decryptedData))

	// Step 6: 검증
	fmt.Println("[Step 6] 원본 데이터와 비교")
	if string(decryptedData) == largeData {
		fmt.Println("  결과: Envelope Encryption/Decryption 성공!")
	} else {
		fmt.Println("  결과: 데이터 불일치 (오류)")
	}
}

// generateDEK는 로컬에서 AES-256 DEK를 생성
func generateDEK() []byte {
	dek := make([]byte, 32)
	if _, err := rand.Read(dek); err != nil {
		log.Fatalf("DEK 생성 실패: %v", err)
	}
	return dek
}

// localEncrypt는 로컬에서 AES-GCM으로 암호화
func localEncrypt(key, plaintext []byte) []byte {
	block, err := aes.NewCipher(key)
	if err != nil {
		log.Fatalf("cipher 생성 실패: %v", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		log.Fatalf("GCM 생성 실패: %v", err)
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		log.Fatalf("nonce 생성 실패: %v", err)
	}

	return aesGCM.Seal(nonce, nonce, plaintext, nil)
}

// localDecrypt는 로컬에서 AES-GCM으로 복호화
func localDecrypt(key, ciphertext []byte) []byte {
	block, err := aes.NewCipher(key)
	if err != nil {
		log.Fatalf("cipher 생성 실패: %v", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		log.Fatalf("GCM 생성 실패: %v", err)
	}

	nonceSize := aesGCM.NonceSize()
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]

	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		log.Fatalf("복호화 실패: %v", err)
	}

	return plaintext
}

func createKey(keyID string) {
	reqBody, _ := json.Marshal(CreateKeyRequest{KeyID: keyID})
	resp, err := http.Post(kmsServerURL+"/keys", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Fatalf("KMS 서버 연결 실패: %v", err)
	}
	defer resp.Body.Close()
	fmt.Printf("  KEK 생성 완료: %s (status: %d)\n\n", keyID, resp.StatusCode)
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
