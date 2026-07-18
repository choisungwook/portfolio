# Java heap dump 핸즈온 — OOM이 다시 오기 전에 증거 남기기

OutOfMemoryError(OOM)가 났을 때 JVM이 heap dump를 자동으로 남기게 만들고, 그 dump에서 원인 객체를 찾는 과정을 재현하는 공간이다. 10~20분 quickstart 분량이다.

## 문서

| 문서 | 설명 |
| --- | --- |
| [1. 실습 준비](./docs/1-setup.md) | Docker 이미지를 빌드해 실습 환경을 준비한다 |
| [2. OOM은 재현되지 않는다](./docs/2-why-heapdump-on-oom.md) | heap dump가 왜 필요한지, JVM 옵션이 어떻게 동작하는지 정리한다 |
| [3. OOM 순간의 dump 재현하기](./docs/3-reproduce-oom-dump.md) | 자동 dump, 파일 충돌, 수동 dump를 실험한다 |
| [4. dump에서 범인 찾기](./docs/4-analyze-heapdump.md) | hprof 파일의 정체, 오픈소스 분석 도구, Eclipse MAT로 누수 객체를 찾는다 |
| [5. 운영 적용 체크리스트](./docs/5-production-checklist.md) | disk full, STW, 컨테이너, 민감정보 주의사항을 정리한다 |

## 빠른 실행

Makefile은 이미지 build/push/정리만 담당하고, 실험용 docker run 명령은 각 문서에서 직접 실행한다.

실습 이미지를 빌드한다.

```bash
make build
```

OOM을 재현하고 dump를 남긴다.

```bash
mkdir -p dumps
docker run --rm -v "$PWD/dumps:/dumps" choisunguk/java-heapdump:1.0
```

정리한다.

```bash
make clean
```
