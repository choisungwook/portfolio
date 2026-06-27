# LiteLLM Proxy hands-on

LiteLLM Proxy를 로컬 Docker Compose로 실행하고, 같은 설정 흐름을 AWS ECS로 옮길 때 무엇을 확인해야 하는지 실습합니다.

## 문서

- [1. 로컬 Docker Compose 실습](./docs/1-local-docker-compose.md)
- [2. Bedrock 연동 설정](./docs/2-bedrock-config.md)
- [3. ECS Terraform 예시](./docs/3-ecs-terraform.md)
- [4. 운영 확인 항목](./docs/4-monitoring.md)

## 파일

- [docker-compose.yml](./docker-compose.yml)
- [litellm_config.yaml](./litellm_config.yaml)
- [mock-openai](./mock-openai/)
- [ecs-image](./ecs-image/)
- [terraform](./terraform/)
