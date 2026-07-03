# yum/dnf lock 로컬 재현 핸즈온

yum/dnf 패키지 작업이 동시에 실행될 때 왜 lock이 필요한지 로컬 컨테이너에서 확인하는 핸즈온입니다. lock 파일, 점유 프로세스, 경쟁 프로세스의 실패 흐름을 직접 관찰하는 것이 목적입니다.

## 문서

- [1. yum/dnf lock은 왜 필요할까](./docs/1-lock-structure.md)
- [2. Docker Compose로 lock 경합 재현하기](./docs/2-run-local-reproduction.md)
- [3. lock 점유 프로세스 확인과 정리](./docs/3-observe-and-cleanup.md)
