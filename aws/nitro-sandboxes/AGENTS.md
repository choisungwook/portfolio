# AWS Nitro Sandboxes 핸즈온

EC2 부모 인스턴스에서 Firecracker로 Nitro Sandbox를 직접 띄워 confidential과 direct 모드를 비교하고, EKS Auto Mode에서 isolated pod을 일반 pod과 비교하고, Gemma 2B가 만든 코드를 sandbox에 가두는 workspace입니다. 문서만 고치는 작업은 for-writing-ai.md를 먼저 읽는다.

글로벌 규칙은 @../../AGENTS.md를 따른다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.

## 수정할 때

- EKS는 us-west-2, EC2는 ap-northeast-2다. EKS sandboxing이 US 리전만 지원하기 때문이다. 이유는 `knowledge/decisions/`에 있다
- `guest/sandbox-init`을 고치면 시나리오 3의 dracut `--install` 목록도 같이 고친다. init이 부르는 프로그램이 initrd에 없으면 guest가 부팅 직후 멈춘다
- `agent/agent.py`를 고치면 `manifests/ai-agent/agent-configmap.yaml`의 data도 같은 내용으로 고친다. 둘이 다르면 클러스터에서는 ConfigMap 쪽이 실행된다
- 문서의 출력은 2026-11-11 실측값이다. 다시 실행해 값이 바뀌면 문서와 계산(546MiB, 514MiB)을 같이 고친다
