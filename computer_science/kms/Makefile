.PHONY: help server-build server-run server-test client-usecase1 client-usecase2 client-usecase3 vault-up vault-down vault-setup vault-client clean

help: ## 도움말
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# === KMS 서버 (Go) ===
server-build: ## KMS 서버 빌드
	cd kms-server && go build -o kms-server .

server-run: ## KMS 서버 실행 (localhost:8080)
	cd kms-server && go run .

server-test: ## KMS 서버 테스트
	cd kms-server && go test -v ./...

server-fix: ## KMS 서버 go fix 실행
	cd kms-server && go fix ./...

# === KMS 클라이언트 Use Case (KMS 서버가 먼저 실행되어야 함) ===
client-usecase1: ## Use Case 1: 비밀번호 암호화 (KMS 서버 필요)
	cd kms-client/usecase1_password_encrypt && go run .

client-usecase2: ## Use Case 2: 설정 파일 암호화 (KMS 서버 필요)
	cd kms-client/usecase2_config_encrypt && go run .

client-usecase3: ## Use Case 3: Envelope Encryption (KMS 서버 필요)
	cd kms-client/usecase3_envelope_encrypt && go run .

# === Vault (오픈소스 KMS) ===
vault-up: ## Vault 컨테이너 시작
	cd vault && docker compose up -d

vault-down: ## Vault 컨테이너 중지
	cd vault && docker compose down

vault-setup: ## Vault Transit 엔진 설정 (vault-up 이후 실행)
	cd vault && bash setup.sh

vault-client: ## Vault 클라이언트 실행 (Vault 필요)
	cd vault/vault-client && go run .

# === 정리 ===
clean: ## 빌드 결과물 삭제
	rm -f kms-server/kms-server
