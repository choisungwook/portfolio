package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
)

// Key는 KMS에 저장되는 암호화 키 정보
type Key struct {
	ID        string `json:"id"`
	Algorithm string `json:"algorithm"`
	KeyData   []byte `json:"-"`
	CreatedAt string `json:"created_at"`
}

// KeyStore는 메모리 기반 키 저장소
type KeyStore struct {
	mu   sync.RWMutex
	keys map[string]*Key
}

// EncryptRequest는 암호화 요청 구조체
type EncryptRequest struct {
	KeyID     string `json:"key_id"`
	Plaintext string `json:"plaintext"`
}

// EncryptResponse는 암호화 응답 구조체
type EncryptResponse struct {
	KeyID      string `json:"key_id"`
	Ciphertext string `json:"ciphertext"`
}

// DecryptRequest는 복호화 요청 구조체
type DecryptRequest struct {
	KeyID      string `json:"key_id"`
	Ciphertext string `json:"ciphertext"`
}

// DecryptResponse는 복호화 응답 구조체
type DecryptResponse struct {
	KeyID     string `json:"key_id"`
	Plaintext string `json:"plaintext"`
}

// CreateKeyRequest는 키 생성 요청 구조체
type CreateKeyRequest struct {
	KeyID     string `json:"key_id"`
	Algorithm string `json:"algorithm"`
}

// ErrorResponse는 에러 응답 구조체
type ErrorResponse struct {
	Error string `json:"error"`
}

// NewKeyStore는 새로운 키 저장소를 생성
func NewKeyStore() *KeyStore {
	return &KeyStore{
		keys: make(map[string]*Key),
	}
}

// CreateKey는 새로운 AES-256 키를 생성
func (ks *KeyStore) CreateKey(id string) (*Key, error) {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	if _, exists := ks.keys[id]; exists {
		return nil, fmt.Errorf("key already exists: %s", id)
	}

	// AES-256 키 생성 (32 bytes)
	keyData := make([]byte, 32)
	if _, err := rand.Read(keyData); err != nil {
		return nil, fmt.Errorf("failed to generate key: %w", err)
	}

	key := &Key{
		ID:        id,
		Algorithm: "AES-256-GCM",
		KeyData:   keyData,
	}
	ks.keys[id] = key
	return key, nil
}

// GetKey는 키 ID로 키를 조회
func (ks *KeyStore) GetKey(id string) (*Key, error) {
	ks.mu.RLock()
	defer ks.mu.RUnlock()

	key, exists := ks.keys[id]
	if !exists {
		return nil, fmt.Errorf("key not found: %s", id)
	}
	return key, nil
}

// ListKeys는 모든 키 목록을 반환
func (ks *KeyStore) ListKeys() []*Key {
	ks.mu.RLock()
	defer ks.mu.RUnlock()

	keys := make([]*Key, 0, len(ks.keys))
	for _, key := range ks.keys {
		keys = append(keys, key)
	}
	return keys
}

// DeleteKey는 키를 삭제
func (ks *KeyStore) DeleteKey(id string) error {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	if _, exists := ks.keys[id]; !exists {
		return fmt.Errorf("key not found: %s", id)
	}
	delete(ks.keys, id)
	return nil
}

// Encrypt는 AES-256-GCM으로 평문을 암호화
func (ks *KeyStore) Encrypt(keyID string, plaintext []byte) ([]byte, error) {
	key, err := ks.GetKey(keyID)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key.KeyData)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := aesGCM.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// Decrypt는 AES-256-GCM으로 암호문을 복호화
func (ks *KeyStore) Decrypt(keyID string, ciphertext []byte) ([]byte, error) {
	key, err := ks.GetKey(keyID)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key.KeyData)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	return plaintext, nil
}

func main() {
	store := NewKeyStore()
	mux := http.NewServeMux()

	// 키 생성 API
	mux.HandleFunc("POST /keys", func(w http.ResponseWriter, r *http.Request) {
		var req CreateKeyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "invalid request body"})
			return
		}

		if req.KeyID == "" {
			writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "key_id is required"})
			return
		}

		key, err := store.CreateKey(req.KeyID)
		if err != nil {
			writeJSON(w, http.StatusConflict, ErrorResponse{Error: err.Error()})
			return
		}

		log.Printf("[CREATE] key created: %s (algorithm: %s)", key.ID, key.Algorithm)
		writeJSON(w, http.StatusCreated, key)
	})

	// 키 목록 조회 API
	mux.HandleFunc("GET /keys", func(w http.ResponseWriter, r *http.Request) {
		keys := store.ListKeys()
		log.Printf("[LIST] returning %d keys", len(keys))
		writeJSON(w, http.StatusOK, keys)
	})

	// 키 삭제 API
	mux.HandleFunc("DELETE /keys/{keyID}", func(w http.ResponseWriter, r *http.Request) {
		keyID := r.PathValue("keyID")
		if err := store.DeleteKey(keyID); err != nil {
			writeJSON(w, http.StatusNotFound, ErrorResponse{Error: err.Error()})
			return
		}

		log.Printf("[DELETE] key deleted: %s", keyID)
		writeJSON(w, http.StatusOK, map[string]string{"message": "key deleted"})
	})

	// 암호화 API
	mux.HandleFunc("POST /encrypt", func(w http.ResponseWriter, r *http.Request) {
		var req EncryptRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "invalid request body"})
			return
		}

		ciphertext, err := store.Encrypt(req.KeyID, []byte(req.Plaintext))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: err.Error()})
			return
		}

		log.Printf("[ENCRYPT] data encrypted with key: %s", req.KeyID)
		writeJSON(w, http.StatusOK, EncryptResponse{
			KeyID:      req.KeyID,
			Ciphertext: hex.EncodeToString(ciphertext),
		})
	})

	// 복호화 API
	mux.HandleFunc("POST /decrypt", func(w http.ResponseWriter, r *http.Request) {
		var req DecryptRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "invalid request body"})
			return
		}

		ciphertext, err := hex.DecodeString(req.Ciphertext)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "invalid ciphertext encoding"})
			return
		}

		plaintext, err := store.Decrypt(req.KeyID, ciphertext)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: err.Error()})
			return
		}

		log.Printf("[DECRYPT] data decrypted with key: %s", req.KeyID)
		writeJSON(w, http.StatusOK, DecryptResponse{
			KeyID:     req.KeyID,
			Plaintext: string(plaintext),
		})
	})

	// 헬스체크 API
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	addr := ":8080"
	log.Printf("KMS server starting on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
