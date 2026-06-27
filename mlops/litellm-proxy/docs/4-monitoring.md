# 운영 확인 항목

## TL;DR

- LiteLLM Proxy는 provider 앞단이므로 proxy와 provider 양쪽 지표를 같이 봐야 합니다.
- 먼저 요청 수, 오류율, latency, Bedrock throttling, task restart를 확인합니다.
- 비용과 quota는 기술 지표만으로 충분하지 않습니다. 모델별 사용량과 계정 quota를 같이 봐야 합니다.

## LiteLLM Proxy에서 볼 것

프록시는 client 요청을 받아 provider로 넘깁니다. 그래서 장애를 볼 때 "프록시 문제인지, provider 문제인지"를 나눠야 합니다.

먼저 다음 항목을 봅니다.

- 요청 수
- 4xx, 5xx 응답 수
- provider별 latency
- provider별 error
- streaming 요청 실패
- virtual key별 사용량

장점: proxy 기준으로 보면 client가 실제로 경험한 성공과 실패를 볼 수 있습니다.

단점: provider 내부 quota, model access 문제는 proxy 지표만으로 원인을 확정하기 어렵습니다.

## ECS에서 볼 것

ECS에서는 task 생명주기와 컨테이너 로그를 먼저 봅니다.

```shell
aws ecs describe-services \
  --cluster litellm-proxy-hands-on \
  --services litellm-proxy-hands-on
```

CloudWatch Logs를 tail합니다.

```shell
aws logs tail /ecs/litellm-proxy-hands-on --follow
```

확인할 항목은 다음과 같습니다.

- task restart 반복 여부
- target group health check 실패 여부
- container memory 부족 여부
- image pull 실패 여부
- secret 읽기 실패 여부

## Bedrock에서 볼 것

Bedrock 호출은 계정, 리전, 모델별 quota 영향을 받습니다.

확인할 항목은 다음과 같습니다.

- 모델 access 승인 상태
- 리전별 지원 모델
- throttling 발생 여부
- invocation latency
- streaming 호출 사용 여부
- 비용 추적 기준

확인 필요: Bedrock의 CloudWatch metric 이름과 차원은 사용하는 모델, inference profile, 호출 방식에 따라 실제 계정에서 다시 확인합니다.

## 알람 후보

처음에는 단순한 알람부터 둡니다.

- ALB target 5xx 증가
- ECS service running task count 감소
- ECS task restart 반복
- Bedrock throttling 증가
- 요청 latency p95 증가

장점: 운영 초기에 가장 눈에 띄는 실패를 빨리 잡을 수 있습니다.

단점: 비용 급증이나 특정 사용자 남용은 별도 사용량 집계가 없으면 늦게 발견할 수 있습니다.

## 다음에 보강할 것

- HTTPS listener와 인증 경로
- RDS 연결과 database pool 설정
- LiteLLM virtual key별 budget
- provider fallback과 retry 기준
- dashboard와 runbook
