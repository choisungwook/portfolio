# 시나리오 5. 운영 중인 서비스에 Network Firewall을 넣는 순서

트래픽이 흐르는 VPC에 firewall을 넣을 때 위험한 순간은 두 번 옵니다. route를 firewall endpoint로 바꾸는 순간과 default action을 drop으로 바꾸는 순간입니다. 이 문서는 두 순간을 따로 떼어, 각각 되돌릴 수 있는 단계로 나누는 순서를 정리합니다. 아래 순서는 시나리오 2~4에서 실습한 순서와 같습니다.

정답이 하나인 절차는 아닙니다. 서비스가 짧은 HTTP 요청 위주인지, DB 복제처럼 오래 열린 연결이 많은지에 따라 단계를 합치거나 늘립니다.

## 1단계: 경로 변경 없이 firewall 선배포

firewall을 만들기만 하면 트래픽은 그대로 NAT로 갑니다. 이 단계에서 서비스 영향은 없습니다.

- firewall subnet을 AZ마다 하나씩 만들고, route table은 `0.0.0.0/0 → NAT`로 둡니다. 서비스가 있는 AZ마다 endpoint가 있어야 합니다.
- rule order는 생성 후 변경할 수 없으므로 policy는 처음부터 strict order로 생성합니다.
- stateful default action은 alert만 고릅니다(`aws:alert_established`). 아무것도 막지 않고 모든 흐름을 alert 로그로 남깁니다.
- stream exception policy는 **Reject**로 둡니다. 2단계에서 중간부터 도착하는 패킷에 RST를 보내 클라이언트가 바로 재연결하게 합니다. 기본값 Drop이면 오래 열린 연결이 timeout까지 멈춥니다.
- 3단계의 판단 근거가 로그이므로 이 시점에 로깅(alert, flow)을 활성화합니다.
- Delete protection, Subnet change protection, Firewall policy change protection을 모두 켭니다. subnet 하나가 빠지면 그 AZ의 endpoint가 사라져 route가 blackhole이 되므로, 변경이 필요할 때만 해당 옵션을 잠시 끄는 절차로 운영합니다.
- rule group capacity는 예상 규칙 수보다 넉넉하게 잡습니다. 늘릴 수 없어서, 모자라면 새 rule group을 만들어 바꿔 끼워야 합니다.

## 2단계: AZ 단위 순차 route 전환

route 변경은 route table 단위로 즉시 적용되고, 원래 target으로 되돌리면 바로 원복됩니다. 그래서 AZ 하나를 먼저 바꾸고 지표를 본 다음 다음 AZ로 넘어갑니다.

1. 돌아오는 경로를 먼저 넣습니다. public route table에 `app subnet CIDR → 같은 AZ의 endpoint`를 추가합니다.
2. 나가는 경로를 바꿉니다. app subnet route table의 `0.0.0.0/0` target을 NAT에서 endpoint로 바꿉니다.
3. 서비스 지표, NAT gateway의 `ErrorPortAllocation`, firewall의 `StreamExceptionPolicyPackets`, `DroppedPackets`를 모니터링합니다.
   - 비대칭 구간의 실패는 실측에서 firewall metric(`ReceivedPackets`, `RejectedPackets`, `StreamExceptionPolicyPackets`)에 나타나지 않았습니다. 전환 중의 실패는 서비스 지표나 synthetic probe로 감지합니다.
4. 이상이 없으면 다음 AZ에서 1~3단계를 반복합니다.

1번을 먼저 넣는 이유는 2번을 넣는 순간부터 나가는 길과 돌아오는 길이 모두 firewall을 지나게 하려는 것입니다. 1번만 넣은 동안에는 NAT로 바로 나간 연결의 응답만 endpoint를 지나는 비대칭 상태가 되고, 이 구간의 새 연결은 실패합니다. 실측에서 1번과 2번 사이가 9초인 AZ는 probe 1줄이 실패했고, 두 AZ의 1번을 먼저 넣어 55초 동안 비대칭으로 둔 AZ는 그동안 모든 probe가 실패했습니다. 그래서 1번과 2번은 AZ마다 연달아 실행하고, 다른 AZ의 1번을 미리 넣어 두지 않습니다. 2번을 먼저 하면 1번을 넣기 전까지 응답이 firewall을 우회하고 stateful 엔진이 흐름을 끝까지 보지 못합니다.

되돌릴 때는 반대 순서로 2번 → 1번을 원복합니다.

### route 전환 시점의 기존 연결 단절 가능성

route를 바꾸기 전에 맺어진 TCP 연결은 firewall이 handshake를 본 적이 없습니다. 이 연결의 다음 패킷은 stream exception policy를 따릅니다. 짧은 HTTP 요청은 다음 요청부터 새 연결로 firewall을 지나므로 영향이 거의 없습니다. connection pool, DB 복제, WebSocket처럼 오래 열린 연결은 재연결이 일어나므로, 이런 연결이 있는 서비스는 재연결이 안전한 시간대에 route를 바꿉니다.

[시나리오 2의 7단계](./2-traffic-inspection.md#7-route-전환을-통한-firewall-endpoint-경유-구성-약-5분)에서는 열려 있던 다운로드가 끊기지 않았고 `StreamExceptionPolicyPackets`도 0이었습니다. 그래도 문서가 설명하는 동작은 stream exception policy이므로, 실측 한 번을 근거로 무중단을 가정하지 않습니다.

## 3단계: alert 로그 기반 허용 목록 도출

alert 모드로 며칠에서 몇 주를 돌리면서 실제로 나가는 도메인을 모읍니다.

```text
filter event.event_type = "alert"
| fields coalesce(event.tls.sni, event.http.hostname) as domain
| stats count(*) as hits by domain
| sort hits desc
```

- 이 쿼리는 CloudWatch Logs Insights에서 alert log group에 실행합니다.
- `domain`이 비어 있는 흐름은 TLS, HTTP가 아닌 트래픽입니다. 포트와 목적지를 보고 5-tuple 규칙으로 따로 허용할지 정합니다.
- AWS API, 패키지 저장소, SSM endpoint(`ssm`, `ssmmessages`, `ec2messages`)를 빠뜨리기 쉽습니다. SSM을 막으면 서버에 접속할 길도 같이 막힙니다.
- firewall의 traffic analysis mode를 켜 두면 콘솔이 관측된 도메인으로 domain list를 만들어 줍니다. AWS는 허용 목록을 만들기 약 30일 전에 켜라고 권장합니다.

## 4단계: 허용 목록 적용과 default action drop 전환

이 단계에서 처음으로 트래픽이 막힙니다.

1. 허용 domain list rule group을 policy에 추가합니다. strict order에서는 Allow 목록이 암묵적 deny를 만들지 않으므로 이때까지는 아무것도 막히지 않습니다.
2. alert 로그에서 허용 목록에 맞은 흐름과 맞지 않은 흐름을 비교합니다. 맞지 않은 흐름이 다음 3번에서 막힐 트래픽입니다.
3. stateful default action에 drop을 추가합니다. domain list는 handshake 뒤에 판단하므로 Application drop established(server-directed only)를 고르고, alert도 같은 계열로 맞춥니다.
4. `DroppedPackets`와 alert 로그의 `blocked` 기록을 모니터링합니다. 막히면 안 되는 도메인이 보이면 허용 목록에 추가합니다.

policy 변경은 몇 분 안에 모든 endpoint에 반영됩니다. 되돌릴 때는 default action에서 drop만 빼면 됩니다. rule 변경은 이미 허용된 흐름에 적용되지 않으므로, 새로 막은 도메인에 대한 기존 연결까지 끊으려면 flow flush를 실행합니다.

## 5단계: 핵심 지표 알람 구성

| metric | 의미 |
| --- | --- |
| `DroppedPackets` | 허용 목록에서 빠진 도메인, 새 외부 의존성 |
| `StreamExceptionPolicyPackets` | 상태 없는 패킷. route 변경, flow flush, 비대칭 라우팅 |
| `OtherDroppedPackets` | 급증으로 endpoint가 확장되는 동안 버린 패킷 |
| `RejectedPackets` | reject 규칙이나 Reject stream exception policy가 보낸 RST |

`StreamExceptionPolicyPackets`가 route 변경 직후가 아닌데 계속 나오면 어딘가에서 한쪽 방향만 firewall을 지나고 있다는 신호입니다. 대시보드는 [4-monitoring.md](./4-monitoring.md)에 있습니다.

## Citations

1. AWS Security Services Best Practices: Network Firewall, <https://aws.github.io/aws-security-services-best-practices/guides/network-firewall/>
2. Stream exception policy, <https://docs.aws.amazon.com/network-firewall/latest/developerguide/stream-exception-policy.html>
3. Flow management with AWS Network Firewall, <https://aws.amazon.com/blogs/security/enhanced-network-security-control-flow-management-with-aws-network-firewall/>
