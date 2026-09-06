# S01 코드 설명

- 대상: [scenarios/s01_public_dns_sts.py](../scenarios/s01_public_dns_sts.py). 한 파일에 설정 읽기, DNS·TLS 검사, STS, Memory 호출이 다 있어요.
- 한 줄 요약: **코드는 IP를 바꾸지 않아요.** OS가 `/etc/hosts`로 바꾼 결과를 확인만 하고, AWS 이름과 URL은 끝까지 그대로 써요.

## 수도코드

`main()`의 흐름이에요.

```text
config = runtime/config.json 읽기, --az로 AZ 하나 선택
  → hosts = { sts.ap-northeast-2.amazonaws.com: EIP_A,
              bedrock-agentcore.ap-northeast-2.amazonaws.com: EIP_B }

for (이름, 기대 EIP) in hosts:
  verify_dns(이름, EIP)   # OS 리졸버가 이 이름을 그 EIP 하나로만 푸는가
  verify_tls(이름, EIP)   # 그 EIP에 붙었을 때 AWS 인증서가 이 이름으로 검증되는가

source  = boto3.Session(profile_name=AWS_PROFILE)          # 시작 신분
sts     = source.client("sts", endpoint_url="https://sts.ap-northeast-2.amazonaws.com")
creds   = sts.assume_role(role_arn, 900초)                  # → ASSUME_ROLE_OK
session = boto3.Session(creds)                              # client Role 신분

session.client("sts").get_caller_identity()                 # → CALLER_IDENTITY_OK
memory  = session.client("bedrock-agentcore",
                         endpoint_url="https://bedrock-agentcore.ap-northeast-2.amazonaws.com")
event   = memory.create_event(...)                          # → CREATE_EVENT_OK
memory.get_event(event) 내용이 같은지 비교                    # → GET_EVENT_OK
finally: memory.delete_event(event)                          # → DELETE_EVENT_OK
print PASS
```

- 앞의 DNS·TLS 검사에서 하나라도 실패하면 AWS 자격증명을 쓰기 전에 멈춰요.
- Memory 이벤트는 읽기에 실패해도 `finally`에서 지워요.

## 코드가 리졸버를 어떻게 IP에 매핑했나

매핑은 코드 밖, `/etc/hosts`에서 일어나요. 코드는 세 곳에서 OS 리졸버에 물어보고 결과를 검사해요.

`verify_dns`는 `socket.getaddrinfo`로 OS 리졸버에 이름을 묻고, 답이 정확히 EIP 하나인지 봐요.

```python
addresses = {str(r[4][0]) for r in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)}
if addresses != {expected_ip}:
  raise RuntimeError(...)
```

- `getaddrinfo`는 macOS·Linux의 시스템 리졸버 호출이에요. 리졸버는 `/etc/hosts`를 먼저 읽고 없으면 DNS 서버로 가요. 그래서 hosts에 적은 EIP가 나와요.
- `nslookup`·`dig`는 이 경로를 쓰지 않고 DNS 서버에 직접 묻기 때문에 hosts를 못 봐요.
- 집합 비교라서 IPv6나 공인 IP가 섞여 오면 실패해요. "hosts가 안 먹었는데 우연히 성공"을 막는 장치예요.

`verify_tls`는 이름으로 접속하되, 실제로 붙은 상대 IP가 EIP인지와 인증서가 AWS 이름으로 검증되는지를 봐요.

```python
with socket.create_connection((hostname, 443)) as connection, \
     ssl.create_default_context().wrap_socket(connection, server_hostname=hostname) as secure:
  peer_ip = secure.getpeername()[0]      # 실제 연결된 IP → EIP여야 함
  ...                                     # wrap_socket이 인증서를 hostname으로 검증
```

- `create_connection(hostname)`도 내부에서 `getaddrinfo`를 써요. 즉 hosts를 따라가요.
- `server_hostname=hostname`이 SNI예요. NLB를 지나 AWS가 받는 SNI는 여전히 AWS 이름이라 AWS가 자기 인증서를 내주고, 그 인증서의 SAN에 이 이름이 있어 검증이 통과해요.
- `getpeername()`이 EIP가 아니면 "hosts 없이 AWS로 직접 나갔다"는 뜻이라 실패시켜요.

boto3도 같은 리졸버를 써요. boto3 → urllib3 → `socket.getaddrinfo` 순서라 별도 설정 없이 hosts를 따라가요. 그래서 위 두 검사가 통과하면 뒤의 STS·Memory 호출도 같은 EIP로 나가요.

## endpoint는 AWS 것을 그대로 쓰나

네. NLB 이름이나 VPCE 이름을 어디에도 넣지 않아요.

```python
session.client(
  service,
  region_name=region,
  endpoint_url=f"https://{service}.{region}.amazonaws.com",   # sts.ap-northeast-2.amazonaws.com
  config=BotoConfig(signature_version="v4", proxies={}, ...),
)
```

- `endpoint_url`은 서비스별 서울 regional 이름이에요. STS는 `sts.ap-northeast-2.amazonaws.com`, Memory는 `bedrock-agentcore.ap-northeast-2.amazonaws.com`.
- 이 이름 하나가 네 곳에 동시에 쓰여요. DNS 질의 이름, TLS SNI, HTTP `Host` 헤더, SigV4 서명에 들어가는 host. 넷이 같아야 인증서 검증과 서명 검증이 모두 통과해요.
- NLB DNS 이름을 `endpoint_url`에 넣으면 SNI·Host가 NLB 이름이 되고, AWS 인증서에는 그 이름이 없어 TLS에서 실패해요. 그게 S05예요.
- `region_name`을 명시해 STS가 global `sts.amazonaws.com`으로 가지 않게 해요. global 이름은 hosts에 없어 차단 환경에서 timeout이 나요.
- `proxies={}`는 셸에 남은 `HTTPS_PROXY`를 무시해요. 프록시가 끼면 hosts 매핑이 아니라 프록시가 목적지를 정하게 돼요.
- `endpoint_url`은 접속 주소만 정하고, 실제 패킷은 hosts가 준 EIP로 가요. "이름은 AWS, IP는 우리 NLB"가 이 시나리오의 전부예요.
