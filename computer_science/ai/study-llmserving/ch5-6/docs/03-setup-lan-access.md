# 같은 Wi-Fi에서 LLM serving endpoint 접속

## Up

### 노출 endpoint

Compose는 기본적으로 모든 host interface인 `0.0.0.0`에 port를 publish함.

| 서비스 | URL | 용도 |
| --- | --- | --- |
| Grafana | `http://<Ubuntu-IP>:3000` | dashboard 확인 |
| vLLM | `http://<Ubuntu-IP>:8000/v1` | OpenAI 호환 API 호출 |
| Prometheus | `http://<Ubuntu-IP>:9090` | target·metric query |
| DCGM Exporter | `http://<Ubuntu-IP>:9400/metrics` | GPU metric 확인 |

- 외부 인증과 TLS 없음
- 신뢰할 수 있는 LAN에서만 사용
- router의 port forwarding 설정 금지
- Grafana 최초 로그인 후 기본 비밀번호 변경

### 1. Ubuntu IP 확인

기본 route에 사용하는 interface와 IPv4 주소를 확인함.

```bash
LAN_INTERFACE="$(ip -4 route get 1.1.1.1 | awk '{for (i=1; i<=NF; i++) if ($i == "dev") print $(i+1)}')"
LAN_IP="$(ip -4 route get 1.1.1.1 | awk '{for (i=1; i<=NF; i++) if ($i == "src") print $(i+1)}')"
echo "$LAN_INTERFACE $LAN_IP"
```

- Wi-Fi interface와 사설 IPv4 주소인지 확인
- 사설 IPv4 예시: `192.168.0.10`, `10.0.0.10`
- DHCP로 주소가 바뀌면 새 주소로 접속

### 2. 모든 host interface에 service bind

`LAN_BIND_ADDRESS`를 지정하지 않고 관측 stack을 기동함.

```bash
make observability-up
docker compose ps
```

필요한 vLLM server 하나를 기동함.

```bash
make vllm-bf16
```

- 기본값 `0.0.0.0`: LAN IP와 `127.0.0.1`에서 모두 접속 가능
- 기존 handson 문서와 script의 `127.0.0.1` 호출 유지
- 로컬 전용 실행: `export LAN_BIND_ADDRESS=127.0.0.1`
- 특정 interface 실행: `export LAN_BIND_ADDRESS="$LAN_IP"`
- 특정 interface 실행 시 host의 health check도 `127.0.0.1` 대신 `$LAN_IP` 사용

### 3. Ubuntu에서 확인

모든 endpoint가 응답하는지 확인함.

```bash
curl --fail "http://$LAN_IP:3000/api/health"
curl --fail "http://$LAN_IP:8000/health"
curl --fail "http://$LAN_IP:9090/-/healthy"
curl --fail "http://$LAN_IP:9400/metrics"
```

### 4. 같은 Wi-Fi 기기에서 확인

Ubuntu와 같은 Wi-Fi에 연결된 기기에서 접속함.

```bash
curl --fail "http://<Ubuntu-IP>:8000/v1/models"
curl --fail "http://<Ubuntu-IP>:9090/-/healthy"
curl --fail "http://<Ubuntu-IP>:9400/metrics"
```

browser에서 Grafana에 접속함.

```text
http://<Ubuntu-IP>:3000
```

- 기본 계정: `admin` / `admin`
- dashboard: `LLM serving / LLM Serving Chapter 5-6`

### 접속 실패 확인

- `docker compose ps`: published address와 container 상태 확인
- `ip -4 addr show "$LAN_INTERFACE"`: Ubuntu IP 유지 여부 확인
- client와 Ubuntu의 Wi-Fi SSID가 같은지 확인
- guest Wi-Fi의 client isolation 활성 여부 확인
- Ubuntu firewall에서 TCP `3000`, `8000`, `9090`, `9400` 허용 여부 확인
- Docker published port는 UFW 규칙을 우회할 수 있으므로 UFW만으로 외부 접근 차단을 보장하지 않음

## Down

container와 network만 종료함.

```bash
make down
```
