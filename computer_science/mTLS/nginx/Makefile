# 인증서 및 키 파일 목록
CERTS_DIR = certs
CERTS = $(CERTS_DIR)/ca.key $(CERTS_DIR)/ca.crt $(CERTS_DIR)/ca.srl \
        $(CERTS_DIR)/server.key $(CERTS_DIR)/server.csr $(CERTS_DIR)/server.crt \
        $(CERTS_DIR)/client1.key $(CERTS_DIR)/client1.csr $(CERTS_DIR)/client1.crt \
        $(CERTS_DIR)/client2.key $(CERTS_DIR)/client2.csr $(CERTS_DIR)/client2.crt

.PHONY: all ca server client1 client2 clean

# 디렉터리 생성
$(CERTS_DIR):
	mkdir -p $(CERTS_DIR)

# 🔹 1️⃣ CA 인증서 생성
ca: $(CERTS_DIR)
	@echo "🔹 CA 인증서 생성 중..."
	@openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 3650 \
	    -keyout $(CERTS_DIR)/ca.key -out $(CERTS_DIR)/ca.crt \
	    -subj "/C=KR/ST=Seoul/L=Gangnam/O=MyCompany/OU=IT/CN=My CA" -quiet
	@echo "✅ CA 인증서 생성 완료!"

# 🔹 서버 인증서 생성 (선택 사항)
server: $(CERTS_DIR) ca
	@echo "🔹 서버 인증서 생성 중..."
	@openssl req -newkey rsa:4096 -nodes -keyout $(CERTS_DIR)/server.key -out $(CERTS_DIR)/server.csr \
	    -subj "/C=KR/ST=Seoul/L=Gangnam/O=MyCompany/OU=IT/CN=myserver.com" -quiet
	@openssl x509 -req -in $(CERTS_DIR)/server.csr -CA $(CERTS_DIR)/ca.crt -CAkey $(CERTS_DIR)/ca.key -CAcreateserial \
	    -out $(CERTS_DIR)/server.crt -days 3650 -sha256
	@echo "✅ 서버 인증서 생성 완료!"

# 🔹 2️⃣ 클라이언트1 인증서 생성 (인증 허용)
client1: $(CERTS_DIR) ca
	@echo "🔹 클라이언트1 인증서 생성 중 (인증 허용)..."
	@openssl req -newkey rsa:4096 -nodes -keyout $(CERTS_DIR)/client1.key -out $(CERTS_DIR)/client1.csr \
	    -subj "/C=KR/ST=Seoul/L=Gangnam/O=YourCompany/OU=allowed/CN=client1" -quiet
	@openssl x509 -req -in $(CERTS_DIR)/client1.csr -CA $(CERTS_DIR)/ca.crt -CAkey $(CERTS_DIR)/ca.key -CAcreateserial \
	    -out $(CERTS_DIR)/client1.crt -days 3650 -sha256
	@echo "✅ 클라이언트1 인증서 생성 완료!"

# 🔹 3️⃣ 클라이언트2 인증서 생성 (인증 거부)
client2: $(CERTS_DIR) ca
	@echo "🔹 클라이언트2 인증서 생성 중 (인증 거부)..."
	@openssl req -newkey rsa:4096 -nodes -keyout $(CERTS_DIR)/client2.key -out $(CERTS_DIR)/client2.csr \
	    -subj "/C=KR/ST=Seoul/L=Gangnam/O=YourCompany/OU=denied/CN=client2" -quiet
	@openssl x509 -req -in $(CERTS_DIR)/client2.csr -CA $(CERTS_DIR)/ca.crt -CAkey $(CERTS_DIR)/ca.key -CAcreateserial \
	    -out $(CERTS_DIR)/client2.crt -days 3650 -sha256
	@echo "✅ 클라이언트2 인증서 생성 완료!"

up:
	docker compose up -d

down:
	docker compose down

# 전체 인증서 생성
create-certs: ca server client1 client2

tests:
	@echo "Running all tests and collecting HTTP responses (status code only)..."
	@RESULT1="$$(curl -s -o /dev/null -w "%{http_code}" --resolve 'myserver.com:8880:127.0.0.1' https://myserver.com:8880 --cacert $(CERTS_DIR)/ca.crt || echo 'ERROR')"; \
	RESULT2="$$(curl -s -o /dev/null -w "%{http_code}" --cert $(CERTS_DIR)/client1.crt --key $(CERTS_DIR)/client1.key --cacert $(CERTS_DIR)/ca.crt --resolve 'myserver.com:8881:127.0.0.1' https://myserver.com:8881 || echo 'ERROR')"; \
	RESULT3="$$(curl -s -o /dev/null -w "%{http_code}" --cert $(CERTS_DIR)/client2.crt --key $(CERTS_DIR)/client2.key --cacert $(CERTS_DIR)/ca.crt --resolve 'myserver.com:8881:127.0.0.1' https://myserver.com:8881 || echo 'ERROR')"; \
	RESULT4="$$(curl -s -o /dev/null -w "%{http_code}" --cert $(CERTS_DIR)/client1.crt --key $(CERTS_DIR)/client1.key --cacert $(CERTS_DIR)/ca.crt --resolve 'myserver.com:8882:127.0.0.1' https://myserver.com:8882 || echo 'ERROR')"; \
	RESULT5="$$(curl -s -o /dev/null -w "%{http_code}" --cert $(CERTS_DIR)/client2.crt --key $(CERTS_DIR)/client2.key --cacert $(CERTS_DIR)/ca.crt --resolve 'myserver.com:8882:127.0.0.1' https://myserver.com:8882 || echo 'ERROR')"; \
	\
	echo "\n================== Test Results =================="; \
	printf "| %-50s | %-10s |\n" "Test Name" "HTTP Code"; \
	echo "----------------------------------------------------------------------------"; \
	printf "| %-50s | %-10s |\n" "TLS (port 8880)" "$$RESULT1"; \
	printf "| %-50s | %-10s |\n" "mTLS (port 8881) with client1 certificate" "$$RESULT2"; \
	printf "| %-50s | %-10s |\n" "mTLS (port 8881) with client2 certificate" "$$RESULT3"; \
	printf "| %-50s | %-10s |\n" "mTLS (port 8882) with client1 certificate" "$$RESULT4"; \
	printf "| %-50s | %-10s |\n" "mTLS (port 8882) with client2 certificate" "$$RESULT5"; \
	echo "============================================================================="; \
	echo "\nAll tests completed."

# 🔹 4️⃣ 인증서 정리 (삭제 후 디렉터리 삭제)
clean:
	@echo "🔹 인증서 파일 정리 중..."
	@rm -rf $(CERTS_DIR)
	@echo "✅ 인증서 및 certs 디렉터리 삭제 완료!"
