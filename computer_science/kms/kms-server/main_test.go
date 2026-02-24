package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateAndListKeys(t *testing.T) {
	store := NewKeyStore()

	// 키 생성 테스트
	key, err := store.CreateKey("test-key-1")
	if err != nil {
		t.Fatalf("failed to create key: %v", err)
	}

	if key.ID != "test-key-1" {
		t.Errorf("expected key ID 'test-key-1', got '%s'", key.ID)
	}

	if key.Algorithm != "AES-256-GCM" {
		t.Errorf("expected algorithm 'AES-256-GCM', got '%s'", key.Algorithm)
	}

	// 중복 키 생성 시 에러
	_, err = store.CreateKey("test-key-1")
	if err == nil {
		t.Error("expected error for duplicate key, got nil")
	}

	// 키 목록 조회
	keys := store.ListKeys()
	if len(keys) != 1 {
		t.Errorf("expected 1 key, got %d", len(keys))
	}
}

func TestEncryptDecrypt(t *testing.T) {
	store := NewKeyStore()

	_, err := store.CreateKey("encrypt-key")
	if err != nil {
		t.Fatalf("failed to create key: %v", err)
	}

	plaintext := "hello, KMS!"
	ciphertext, err := store.Encrypt("encrypt-key", []byte(plaintext))
	if err != nil {
		t.Fatalf("failed to encrypt: %v", err)
	}

	// 암호문은 평문과 달라야 함
	if string(ciphertext) == plaintext {
		t.Error("ciphertext should not equal plaintext")
	}

	// 복호화
	decrypted, err := store.Decrypt("encrypt-key", ciphertext)
	if err != nil {
		t.Fatalf("failed to decrypt: %v", err)
	}

	if string(decrypted) != plaintext {
		t.Errorf("expected '%s', got '%s'", plaintext, string(decrypted))
	}
}

func TestEncryptWithInvalidKey(t *testing.T) {
	store := NewKeyStore()

	_, err := store.Encrypt("nonexistent-key", []byte("hello"))
	if err == nil {
		t.Error("expected error for nonexistent key, got nil")
	}
}

func TestDeleteKey(t *testing.T) {
	store := NewKeyStore()

	_, err := store.CreateKey("delete-me")
	if err != nil {
		t.Fatalf("failed to create key: %v", err)
	}

	err = store.DeleteKey("delete-me")
	if err != nil {
		t.Fatalf("failed to delete key: %v", err)
	}

	// 삭제된 키 조회 시 에러
	_, err = store.GetKey("delete-me")
	if err == nil {
		t.Error("expected error for deleted key, got nil")
	}
}

func TestHTTPCreateKey(t *testing.T) {
	store := NewKeyStore()
	mux := http.NewServeMux()

	mux.HandleFunc("POST /keys", func(w http.ResponseWriter, r *http.Request) {
		var req CreateKeyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "invalid request body"})
			return
		}
		key, err := store.CreateKey(req.KeyID)
		if err != nil {
			writeJSON(w, http.StatusConflict, ErrorResponse{Error: err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, key)
	})

	body := `{"key_id": "http-test-key"}`
	req := httptest.NewRequest("POST", "/keys", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d", rec.Code)
	}

	var key Key
	if err := json.NewDecoder(rec.Body).Decode(&key); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if key.ID != "http-test-key" {
		t.Errorf("expected key ID 'http-test-key', got '%s'", key.ID)
	}
}
