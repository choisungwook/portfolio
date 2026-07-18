# 1. 실습 준비

Docker만 있으면 됩니다. Java는 로컬에 설치하지 않고 eclipse-temurin:21-jdk 기반 이미지 안에서 실행합니다.

## 디렉터리 구성

| 경로 | 역할 |
| --- | --- |
| `app/LeakApp.java` | static 컬렉션에 1MiB씩 쌓아 메모리 누수를 재현하는 앱 |
| `Dockerfile` | LeakApp을 컴파일해 담은 실습 이미지. 기본 실행 명령이 OOM 재현 모드다 |
| `.dockerignore` | build context 제외 목록. 특히 GB 단위 `dumps/`가 context로 딸려 가지 않게 한다 |
| `Makefile` | 이미지 관리 명령 (`build`, `build-push`, `clean`) |
| `dumps/` | heap dump가 쌓이는 디렉터리. 컨테이너의 `/dumps`로 mount된다 |

Makefile은 이미지 빌드와 정리만 담당합니다. 컨테이너 실행은 각 문서의 `docker run` 명령을 직접 실행합니다. 어떤 JVM 옵션이 어떤 동작을 만드는지 명령 단위로 눈에 보이게 하는 것이 실습의 목적이기 때문입니다.

## 이미지 빌드

실습 이미지를 빌드합니다.

```bash
make build
```

Dockerfile이 하는 일은 두 가지입니다. LeakApp.java를 컴파일해 이미지에 넣고, 기본 실행 명령(CMD)에 OOM 재현용 JVM 옵션을 넣어 둡니다. 실험별로 다른 옵션이 필요하면 `docker run` 뒤에 java 명령을 붙여 CMD를 덮어씁니다.

registry에 올려 다른 장비에서도 쓰고 싶으면 멀티플랫폼(amd64, arm64) 빌드로 push합니다. 최초 1회 `make create-builder`로 buildx builder를 만들어 둡니다.

```bash
make create-builder
make build-push
```

## 실험을 다시 처음부터 하고 싶을 때

dump 파일과 남은 컨테이너를 지웁니다.

```bash
make clean
```

다음: [2. OOM은 재현되지 않는다](./2-why-heapdump-on-oom.md)
