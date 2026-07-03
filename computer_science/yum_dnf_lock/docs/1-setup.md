# 실습 준비

실습은 같은 Docker image를 기준으로 진행합니다.

yum/dnf lock을 다루는 문서마다 준비 명령을 반복하면 흐름이 끊깁니다. 이 문서는 image build와 기본 확인만 모읍니다. 이후 문서는 여기서 만든 `yum-dnf-lock-lab` image가 있다고 가정합니다.

## 이미지 빌드

실습에 필요한 명령과 스크립트를 담은 image를 만듭니다.

```bash
docker build -t yum-dnf-lock-lab .
```

## 실행 확인

먼저 스크립트가 image 안에 들어갔는지 봅니다.

```bash
docker run --rm yum-dnf-lock-lab ls -l /lab/scripts
```

파일 lock 실습에 필요한 `flock`과 fallback용 `python` 명령도 확인합니다.

```bash
docker run --rm yum-dnf-lock-lab sh -c 'command -v flock'
docker run --rm yum-dnf-lock-lab sh -c 'command -v python'
```

## 정리

이름을 붙여 띄운 실행 대상이 남아 있으면 지웁니다.

```bash
docker rm -f yum-dnf-lock-debug-lab yum-dnf-lock-command-lab
```

해당 이름이 없다는 오류는 이미 정리됐다는 뜻입니다.

## 다음 문서

준비가 끝났다면 원리부터 읽고 실습으로 넘어갑니다.

- [2. yum/dnf lock은 왜 필요할까](./2-why-package-lock.md)
- [3. docker 명령어로 lock 경합 재현하기](./3-reproduce-lock-contention.md)
- [4. lock 점유 프로세스 확인하기](./4-debug-lock-owner.md)
- [5. Linux 명령어로 lock 파일 잡고 풀기](./5-lock-file-with-linux-command.md)
