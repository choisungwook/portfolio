# 시나리오 7. 이번에 하지 않은 것과 다음 과제

이번 핸즈온은 "Sandbox 경계가 실제로 생기는가"까지 확인했습니다. 그 경계 위에서 secret을 안전하게 건네는 부분(attestation)과 ECS는 실행하지 않았습니다. 아래는 다음에 해 볼 순서입니다. 위에 있을수록 이번 실습 결과에 바로 이어집니다.

## 다음 과제 목록

| 순서 | 과제 | 이번 실습과의 연결 | 필요한 것 |
|---|---|---|---|
| 1 | EC2 confidential Sandbox attestation으로 KMS secret 받기 | 시나리오 3에서 `/dev/nsm`이 있는 것까지만 확인 | 부모 instance profile, KMS key policy의 PCR 조건, debug mode 끄기, `eif_build`로 미리 만든 image |
| 2 | EKS confidential pod | 시나리오 5는 isolated pod만 실행 | `eks-nitro-sandbox-genpolicy --profile confidential`, `sandbox.amazonaws.com/policy` annotation |
| 3 | confidential pod에서 KMS PCR17 조건으로 secret 받기 | 과제 2의 policy가 PCR17로 측정됨 | KMS key policy에 `kms:RecipientAttestation:PCR17`과 `kms:RecipientAttestation:PCR8:ServiceName = eks.amazonaws.com` |
| 4 | ECS isolated, confidential task | 실행하지 않음 | ECS Managed Instances 등 공식 문서의 지원 조건 확인 |
| 5 | 암호화 이미지와 AWS Signer 서명 검증 | 실행하지 않음 | OCI image encryption, Signer signing profile, Pod Identity |
| 6 | 자원 제한 annotation | 시나리오 5에서 문서로만 확인 | `sandbox.amazonaws.com/conntrack-limit`, `dns-packets-per-second` 부하 테스트 |
| 7 | 밀도 측정 | 실행하지 않음 | 한 노드에 몇 개의 isolated pod이 뜨는지, vCPU 5배 한도와 memory pool이 어느 쪽에서 먼저 막히는지 |
| 8 | Container Insights에서 빠진 sandbox pod 메트릭 | 시나리오 6에서 sandbox pod이 performance log group에 없음 | add-on 새 버전, Container Insights with OpenTelemetry, HPA가 resource metric으로 동작하는지 |
| 9 | 코드 실행 pod 최소 권한 | 시나리오 6에서 sandbox 안의 SA 토큰으로 API 호출 성공 | `automountServiceAccountToken: false` 후 같은 agent 재실행 |
| 10 | 관리형 노드그룹 + 커스텀 AMI | Auto Mode만 사용 | Nitro Sandbox runtime이 들어간 AMI 빌드, launch template의 `EnclaveOptions.Enabled=true` |

## 과제 1과 3에서 확인할 질문

- debug mode를 끄면 PCR0이 실제 값이 되는지, 같은 image를 다시 빌드하면 PCR0이 같은지(dracut `--reproducible`).
- 부모 instance profile role ARN이 attestation 문서에 들어가므로, 다른 role의 부모에서 같은 image를 띄우면 KMS가 거절하는지.
- debug mode Sandbox는 image 측정값이 0이라 부모 측정값만으로 key policy를 쓰면 debug Sandbox도 통과합니다. 이것을 실제로 재현해 PCR0 조건이 왜 필수인지 보기.
- EKS confidential pod에서 pod spec을 한 글자 바꾸면 PCR17이 바뀌어 KMS가 거절하는지. CI가 policy를 다시 만들어야 하는 이유를 숫자로 확인.

## 과제 4에서 먼저 볼 것

ECS 문서는 이번에 읽지 않았습니다. launch type 지원 범위, task definition에서 바뀌는 필드, Fargate 지원 여부는 확인 필요입니다.

## 참고 문서

1. [Attest a Nitro Sandbox (EC2)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/nitro-sandboxes-attestation.html)
2. [Run a pod in confidential mode (EKS)](https://docs.aws.amazon.com/eks/latest/userguide/sandboxing-confidential-setup.html)
3. [Isolated and confidential tasks (ECS)](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/isolated-confidential-tasks.html)
4. [Sandboxing blueprints](https://aws-samples.github.io/sample-eks-nitro-sandbox)
