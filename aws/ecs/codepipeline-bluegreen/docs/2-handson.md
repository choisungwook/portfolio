# Hands-on

[setup.md](./setup.md)의 Up이 끝난 상태에서 시작해요. 모든 명령은 workspace 루트에서 실행합니다. 배포 한 번에 5분 정도 걸리니, 기다리는 동안 콘솔의 ECS 서비스 Deployments 탭을 같이 열어 두면 좋아요.

## 1. 첫 배포를 지켜보기

Up의 마지막 명령이 v1 이미지를 push했어요. ECR의 latest tag push 이벤트가 EventBridge를 거쳐 image 파이프라인을 깨웠을 거예요. 파이프라인이 시작됐는지 먼저 확인해요.

```bash
make history
```

image 파이프라인에 InProgress 실행이 하나 보이면 정상이에요. 이제 ECS 쪽에서 배포가 어느 단계인지 봐요. 15초마다 status와 lifecycle stage를 찍어요.

```bash
make watch
```

stage가 대략 이렇게 흘러요.

| stage | 무슨 일이 일어나는가 |
| --- | --- |
| SCALE_UP | green task 두 개가 뜨고 green target group에 등록돼요. production은 아직 blue예요 |
| TEST_TRAFFIC_SHIFT | test listener(8080)의 rule이 green target group을 가리키게 돼요 |
| POST_TEST_TRAFFIC_SHIFT | 여기서 Lambda hook이 호출돼요. hook이 8080/health를 부르고 SUCCEEDED를 돌려줘요 |
| PRODUCTION_TRAFFIC_SHIFT | production listener(80)의 rule이 green을 가리키게 돼요 |
| BAKE_TIME | 3분 동안 blue task를 살려둬요. 이 사이에 실패하면 blue로 바로 돌아가요 |
| CLEAN_UP | blue task를 지워요. 다음 배포에서는 지금의 green이 blue 역할이에요 |

TEST_TRAFFIC_SHIFT를 지난 뒤 BAKE_TIME 전에, 두 URL을 비교해 보세요.

```bash
make url
curl -s $(terraform -chdir=terraform output -raw production_url)
curl -s $(terraform -chdir=terraform output -raw test_url)
```

production은 public nginx의 Welcome 페이지, test는 version v1 페이지가 나와요. 같은 ALB인데 포트에 따라 다른 버전을 보는 것, 이게 blue/green이 test listener를 두는 이유예요.

## 2. hook이 무엇을 봤는지 확인하기

hook Lambda는 CloudWatch Logs에 ECS가 보낸 이벤트와 /health 응답을 남겨요.

```bash
aws logs tail /aws/lambda/ecs-bluegreen-hook --since 30m
```

이벤트에 lifecycleStage와 executionDetails(serviceArn, targetServiceRevisionArn)가 들어 있어요. hook은 이 정보와 자기 환경변수 TEST_URL만 가지고 판단해요. 첫 배포(create-service)는 비교할 blue가 없어서 무조건 통과시키도록 해 뒀는데, 그 판단도 로그에 남아요.

## 3. 이미지를 바꿔서 두 번째 배포하기

이번엔 body를 직접 바꿔 봐요. app/index.html의 문장을 수정하고 v2로 push해요.

```bash
make push TAG=v2
```

Makefile은 v2와 latest 두 tag를 함께 밀어요. 파이프라인을 깨우는 건 latest push 이벤트지만, CodeBuild는 imageDetail.json의 ImageTags에서 latest가 아닌 tag(v2)를 골라 task definition에 넣어요. task definition을 열어 보면 image가 v2로 박혀 있어요.

```bash
aws ecs describe-task-definition --task-definition ecs-bluegreen-web --query 'taskDefinition.[revision, containerDefinitions[0].image, containerDefinitions[0].environment]'
```

CodeBuild가 실제로 무엇을 했는지는 빌드 로그가 가장 정직해요. 콘솔의 CodeBuild 프로젝트 ecs-bluegreen-deploy에서 최근 빌드를 열면 register한 revision, update-service 결과, 15초 간격의 stage 변화가 그대로 있어요.

배포가 끝나면 콘솔의 EC2 > Load Balancers > listener rule에서 forward 대상이 blue와 green 사이를 오간 것도 확인해 보세요. 이건 ECS가 바꾼 거라 terraform은 모르는 상태예요. 그래서 terraform 코드에서 listener rule의 action과 서비스의 load_balancer를 ignore_changes로 뒀어요.

## 4. 이미지는 그대로 두고 설정만 배포하기

pipeline/config/env.json의 APP_MESSAGE를 바꾸고 올려요.

```bash
make config
```

S3에 config.zip이 새 버전으로 올라가면 config 파이프라인이 시작돼요. CodeBuild는 현재 task definition의 environment만 env.json 내용으로 바꾸고 image는 손대지 않아요. 배포가 끝난 뒤 /env를 보면 바뀐 메시지가, task definition을 보면 image는 여전히 v2인 게 보여요.

```bash
curl -s $(terraform -chdir=terraform output -raw production_url)/env
```

설정 변경도 이미지 변경과 똑같이 blue/green 전 과정을 타요. 환경변수 하나 바꾸는 데 5분이 걸리는 건 비용이지만, 그 대신 잘못된 설정이 production에 닿기 전에 hook이 한 번 막아줘요. 그걸 다음 단계에서 확인해요.

## 5. hook을 실패시켜 롤백 보기

env.json의 APP_HEALTH_STATUS를 503으로 바꾸고 다시 올려요.

```bash
make config
make watch
```

green task는 정상적으로 떠요. ALB health check는 /를 보는데 /는 200이거든요. 그런데 hook이 보는 /health는 503이에요. POST_TEST_TRAFFIC_SHIFT에서 hook이 FAILED를 돌려주고, status가 ROLLBACK_IN_PROGRESS를 지나 ROLLBACK_SUCCESSFUL로 끝나요. production은 한 번도 green을 가리키지 않았어요.

```bash
curl -s $(terraform -chdir=terraform output -raw production_url)/health
```

여전히 200이에요. CodeBuild는 ROLLBACK_SUCCESSFUL을 보고 exit 1로 끝나고, 파이프라인의 Deploy 단계가 Failed가 돼요. "배포 실패"가 파이프라인 이력에 그대로 남는 것, 이게 CodeBuild가 배포 완료까지 기다리는 이유예요.

확인했으면 APP_HEALTH_STATUS를 200으로 되돌려 다시 올려 두세요.

## 6. 이력을 한 곳에서 읽기

지금까지 배포가 다섯 번쯤 있었어요. 어디에 무엇이 남았는지 정리해 봐요.

```bash
make history
```

- ECS service deployments: 배포마다 status, 대상 revision, 롤백 여부. 어떤 revision이 언제 살아 있었는지의 진실이에요.
- CodePipeline executions: 무엇이 트리거했고(ECR push인지 S3 업로드인지) 성공했는지. 사람이 "그때 뭘 배포했지"를 찾는 입구예요.
- S3 object 버전과 ECR tag: 각 배포의 입력 원본이에요.

세 곳이 서로 가리키고 있어서, 파이프라인 실행 하나를 잡으면 revision과 입력까지 내려갈 수 있어요. 실습이 끝났으면 [3-cleanup.md](./3-cleanup.md)로 정리해요.
