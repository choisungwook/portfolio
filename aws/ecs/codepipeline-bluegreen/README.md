# ECS blue/green with CodePipeline and CodeBuild

ECS 서비스 자체의 blue/green 배포 전략과 lifecycle hook을 써서 배포 파이프라인을 만드는 핸즈온이에요.

- 배포 이력은 CodePipeline이, 배포 실행은 CodeBuild 안의 AWS CLI가 맡아요. CodeDeploy는 쓰지 않아요.
- 파이프라인은 두 개예요. ECR push로 이미지를 바꾸는 것, S3 업로드로 환경변수만 바꾸는 것.
- 실습 환경은 [terraform/](./terraform/)으로 만들고, 조작은 [Makefile](./Makefile)로 해요.
- 절차는 [docs/](./docs/)를 순서대로 읽어요 (1-problem → setup → 2-handson → 3-cleanup).
