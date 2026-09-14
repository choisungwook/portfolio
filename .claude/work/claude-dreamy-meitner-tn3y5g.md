# ECS 네이티브 blue/green + CodePipeline/CodeBuild(AWS CLI) 배포 파이프라인 핸즈온

- Issue: 미생성
- Branch: claude/dreamy-meitner-tn3y5g

## 실행 계획

- [x] 1. workspace 골격 생성 (aws/ecs/codepipeline-bluegreen, knowledge 템플릿 복사)
- [x] 2. app/ (nginx 이미지: index.html body + /health, /env 템플릿) 와 compose.yaml
- [x] 3. hook/handler.py (POST_TEST_TRAFFIC_SHIFT에서 test listener /health 검증)
- [x] 4. pipeline/buildspec.yml (image 모드, config 모드) 와 pipeline/config/env.json
- [x] 5. terraform/ (ECR, ALB 2 listener + 2 TG, ECS 서비스 BLUE_GREEN, Lambda hook, S3, CodeBuild, CodePipeline 2개, EventBridge, IAM)
- [x] 6. Makefile (push, config, watch, url)
- [x] 7. docs/ (setup, 1-problem, 2-handson, 3-cleanup), README.md, AGENTS.md
- [x] 8. knowledge decisions 기록 + index/log 갱신
- [x] 9. 검증 (terraform fmt/validate 통과, buildspec jq 로직 mock 검증, hook py_compile. docker 없어서 이미지 빌드는 미검증)

## 다음 세션이 알아야 할 것

- 문서/레지스트리 사이트는 egress 차단. GitHub raw, releases.hashicorp.com만 열림
- provider 버전: aws 6.64.0, archive 2.8.1, terraform 1.16.2 (2026-09 기준)
- ECS 서비스 생성 시에도 lifecycle hook이 호출되므로 hook은 첫 배포를 건너뜀
- 배포 후 ECS가 listener rule의 target group을 바꾸므로 rule과 service load_balancer는 ignore_changes
