# AI agent sandbox 로컬 권한 제한 실험

AI agent가 로컬 명령을 실행할 때 파일 시스템, 네트워크, Git 명령, 승인 흐름이 어디서 허용되고 어디서 멈추는지 직접 확인하기 위한 핸즈온이다.

## 빠른 시작

실험 스크립트 실행:

```bash
make check
```

테스트 실행:

```bash
make test
```

실험 파일 정리:

```bash
make clean
```

## 학습 순서

1. [sandbox 경계는 무엇을 막고 무엇을 남길까](docs/01-sandbox-boundary.md)
2. [Codex CLI에서 권한 경계를 어떻게 관찰할까](docs/02-codex-cli-experiment.md)
3. [Codex App과 Claude Code에서는 무엇을 수동 확인해야 할까](docs/03-codex-app-and-claude-checklist.md)
4. [auto approve는 sandbox를 넓히는 설정일까](docs/04-auto-approve.md)

## 디렉터리 구조

```text
.
├── Makefile
├── README.md
├── docs/
│   ├── 01-sandbox-boundary.md
│   ├── 02-codex-cli-experiment.md
│   ├── 03-codex-app-and-claude-checklist.md
│   └── 04-auto-approve.md
├── pyproject.toml
├── scripts/
│   └── sandbox_probe.py
└── tests/
    └── test_sandbox_probe.py
```
