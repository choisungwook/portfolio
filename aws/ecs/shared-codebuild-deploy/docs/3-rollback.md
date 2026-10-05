# 롤백

- 준비: [이미지 배포와 설정 변경](2-deploy.md).
- 수동 롤백: 이전 이미지 태그로 다시 배포. 설정까지 되돌리면 Git JSON도 revert.
- 자동 롤백: ECS circuit breaker가 직전 성공 배포로 되돌림. 스크립트는 실패로 판정.

## 1. 이미지 수동 롤백

hello-beta를 v1로 되돌리기:

```bash
bash scripts/start-pipeline.sh ecs-shared-build-hello-beta v1
```

- 이전 revision을 재사용하지 않고 새 revision 등록. revision 번호와 이미지 버전은 별개.

## 2. 설정 수동 롤백

설정 변경 commit을 되돌린 뒤 현재 태그로 다시 배포:

```bash
git revert --no-edit <설정 변경 commit>
git push
bash scripts/start-pipeline.sh ecs-shared-build-hello-alpha v1
```

## 3. circuit breaker 자동 롤백

1. alpha JSON의 healthCheck command를 아래 값으로 바꾸고 commit·push.
2. alpha Pipeline을 v2로 실행.
3. ECS 이벤트에서 circuit breaker 롤백 확인. CodeBuild는 `배포 실패: PRIMARY=<이전 revision>`으로 실패.
4. 2번 방법으로 JSON을 revert.

항상 실패하는 healthCheck command:

```json
["CMD", "python", "-c", "raise SystemExit(1)"]
```

- 롤백 후 ECS는 이전 revision으로 돌아가지만 Git JSON은 그대로. Git을 맞추는 일은 사람이 함.
- 실패 판정까지 수 분 소요.
