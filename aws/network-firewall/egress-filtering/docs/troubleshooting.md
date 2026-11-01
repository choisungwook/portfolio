# Troubleshooting

이 핸즈온을 만들고 검증하며 겪은 문제입니다.

## terraform plan이 private NAT gateway route에서 실패한다

증상: `terraform-aws-modules/vpc` 6.x에서 `intra_subnets`와 `single_nat_gateway`를 함께 쓰면 plan이 `cannot use element function with an empty list`로 실패합니다.

해결방법: 모듈 입력에 `create_private_nat_gateway_route = false`를 넣습니다. 이 실습은 private subnet을 모듈로 만들지 않아 private route table이 비어 있습니다. `terraform/vpc.tf`에 반영되어 있습니다.

## egress-probe 출력이 HTTP 코드 대신 `%{http_code}` 문자열이다

증상: `user_data = file("egress-probe.sh")`로 넣은 스크립트에 `%%{http_code}`를 쓰면 그대로 `%%`가 남아 curl 형식이 깨집니다.

해결방법: `file()`은 템플릿 치환을 하지 않으므로 `%`를 한 번만 씁니다. `%%` 이스케이프는 `templatefile()`에서만 필요합니다.

## Grafana metric 패널이 비어 있다

증상: firewall 이름을 textbox 변수로 받는 대시보드에서 metric 패널이 비었습니다. 같은 쿼리를 Grafana API로 이름을 직접 넣어 보내면 값이 나왔습니다.

해결방법: 변수를 빼고 `FirewallName`을 `nfw-lab`으로 고정했습니다. 세 dimension(`FirewallName`, `AvailabilityZone`, `Engine`)을 모두 지정했는지도 확인합니다. 하나라도 빠지면 값이 나오지 않습니다.

## update-logging-configuration이 Alert와 Flow를 한 번에 받지 않는다

증상: 로깅이 꺼진 firewall에 `ALERT`와 `FLOW`를 한 번에 넣으면 CLI가 거부합니다.

해결방법: 호출 한 번에 로그 타입 하나만 바꿀 수 있습니다. `ALERT`만 넣고, 다음 호출에서 `ALERT`와 `FLOW`를 함께 넣습니다. 명령은 [시나리오 2의 5단계](./2-traffic-inspection.md#5-alert-및-flow-로깅과-monitoring-dashboard-활성화-약-2분)에 있습니다.

## rule group 삭제가 `still in use`로 실패한다

증상: policy를 지운 직후 rule group을 지우면 `still in use` 오류가 납니다.

해결방법: policy 삭제가 아직 완료되지 않은 상태이므로 1분쯤 뒤 다시 삭제합니다.

## 실습 중 route가 NAT로 돌아갔다

증상: 시나리오 2에서 app route table을 endpoint로 바꾼 뒤 `terraform apply`를 다시 실행하면 `0.0.0.0/0`이 NAT로 돌아갑니다.

해결방법: Terraform이 `aws_route.app_default`를 NAT로 관리하기 때문입니다. 실습이 끝날 때까지 apply하지 않거나, 다시 apply했다면 시나리오 2의 7단계를 반복합니다.

## Linux Docker에서 Grafana가 CloudWatch를 읽지 못한다

증상: macOS Docker Desktop에서는 되는데 Linux에서 data source가 자격 증명 오류를 냅니다.

해결방법: Grafana 이미지는 uid 472로 돌아서 권한이 600인 `~/.aws` 파일을 읽지 못할 수 있습니다. `compose.yaml`에 `user:`로 호스트 uid를 지정합니다. 실측은 macOS에서만 했습니다.
