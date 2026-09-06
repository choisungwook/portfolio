# S02 환경 준비와 정리

- 대상: 애플리케이션 네트워크 쪽 forward proxy(Squid)·hosts 변경 없음·STS.
- AWS 쪽은 [S01](../s01/1-setup.md)과 완전히 같아요. NLB·endpoint·Role을 새로 만들지 않아요.
- 프록시는 로컬 Docker 컨테이너로 띄워요. 컨테이너의 `/etc/hosts`만 AWS 이름을 EIP로 고정하고, 내 컴퓨터의 hosts는 그대로예요.
- 도구: Docker, jq, openssl, curl.

## Up

- [S01 준비](../../2-setup.md#up)의 배포·`runtime/config.json`·`runtime/hosts.entries` 생성까지 끝낸 상태여야 해요. 이전 S01 hosts 블록이 남아 있으면 [원복](../../6-hosts-setup.md#down)해요. 이 시나리오는 로컬 DNS가 바뀌어 있으면 시작 단계에서 중단해요.
- 프록시 설정: [proxy/squid.conf](../../../proxy/squid.conf). 두 AWS 이름의 443 CONNECT만 허용하고 나머지는 거부해요. ssl_bump가 없으니 TLS는 열지 않아요.

`runtime/hosts.entries`의 두 줄을 `--add-host`로 넘겨 Squid 컨테이너를 띄워요.

```bash
docker rm -f aws-forward-proxy 2>/dev/null
docker run -d --name aws-forward-proxy -p 127.0.0.1:3128:3128 \
  $(awk '{printf "--add-host %s:%s ", $2, $1}' runtime/hosts.entries) \
  -v "$PWD/proxy/squid.conf:/etc/squid/squid.conf:ro" \
  ubuntu/squid:latest
```

프록시가 이름을 EIP로 풀고, 내 컴퓨터는 여전히 공인 IP를 받는지 확인해요.

```bash
docker exec aws-forward-proxy getent hosts sts.ap-northeast-2.amazonaws.com bedrock-agentcore.ap-northeast-2.amazonaws.com
dscacheutil -q host -a name sts.ap-northeast-2.amazonaws.com   # macOS. Linux: getent hosts ...
```

프록시를 지나도 AWS 인증서가 그대로 오는지(터널), 허용 목록 밖은 막히는지 확인해요.

```bash
echo | openssl s_client -proxy 127.0.0.1:3128 -connect sts.ap-northeast-2.amazonaws.com:443 \
  -servername sts.ap-northeast-2.amazonaws.com 2>/dev/null | openssl x509 -noout -issuer -subject
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -x http://127.0.0.1:3128 https://s3.ap-northeast-2.amazonaws.com/
```

- 기대: issuer가 Amazon, subject가 `sts.ap-northeast-2.amazonaws.com`. S3는 curl이 프록시 거부(HTTP 000, exit 56)로 끝나요.
- 방화벽 허용 목적지: Squid 호스트 → STS·Memory NLB EIP, TCP 443. 앱 서버 자체는 인터넷이 막혀 있어도 돼요.

## Down

```bash
docker rm -f aws-forward-proxy
unset LAB_PROXY_URL
```

- AWS 리소스는 [S01 정리](../../2-setup.md#down)로 삭제해요.
