# Docker Compose로 OOM 재현하기

Metaspace OOM은 말로만 보면 heap OOM과 잘 구분되지 않습니다. 로컬에서 직접 재현하면 로그, dump 파일, JVM 옵션의 역할을 분리해서 볼 수 있습니다.

어떤 최소 환경이면 Metaspace OOM을 재현할 수 있을까요?

## 실습은 무엇을 실행할까

이 실습의 Java 프로그램은 JDK compiler API로 새로운 Java source를 계속 생성합니다. 생성한 source를 class 파일로 컴파일하고, 새 `URLClassLoader`로 로드합니다. 로드한 클래스와 클래스 로더는 static list에 보관합니다.

이 구조는 일부러 메모리를 놓지 않는 구조입니다. 운영 코드에서 이렇게 작성하라는 의미가 아닙니다. Metaspace가 어떤 조건에서 증가하는지 관찰하기 위한 재현 장치입니다.

## 사전 준비

Docker와 Docker Compose가 필요합니다. 실습 디렉터리로 이동합니다.

```bash
cd computer_science/jvm_metaspace_oom
```

이전 실행에서 남은 dump 파일이 있으면 먼저 정리합니다. 같은 이름의 hprof가 이미 있으면 JVM이 새 dump를 만들지 못할 수 있습니다.

```bash
make clean-dumps
```

## 환경 실행

Docker 이미지를 빌드하고 컨테이너를 실행합니다.

```bash
make up
```

직접 Docker Compose 명령을 사용해도 됩니다.

```bash
docker compose up --build
```

컨테이너가 실행되면 아래와 비슷한 로그가 반복됩니다.

```text
loaded_classes=200 retained_class_loaders=1 java_opts="-XX:MaxMetaspaceSize=32m ..."
loaded_classes=400 retained_class_loaders=2 java_opts="-XX:MaxMetaspaceSize=32m ..."
loaded_classes=600 retained_class_loaders=3 java_opts="-XX:MaxMetaspaceSize=32m ..."
```

`loaded_classes`가 늘어나다가 Metaspace 제한에 도달하면 JVM이 `OutOfMemoryError: Metaspace`를 남기고 종료합니다.

## JVM 옵션은 무엇을 의미할까

핵심 옵션은 `docker-compose.yml`의 `JAVA_OPTS`에 있습니다.

```yaml
JAVA_OPTS: >-
  -XX:MaxMetaspaceSize=32m
  -XX:+HeapDumpOnOutOfMemoryError
  -XX:HeapDumpPath=/dumps/metaspace-oom.hprof
  -XX:ErrorFile=/dumps/hs_err_pid%p.log
  -Xlog:gc*,metaspace=info:file=/dumps/jvm-metaspace.log:time,level,tags
```

`-XX:MaxMetaspaceSize=32m`는 Metaspace 상한을 작게 잡아 OOM을 빠르게 만듭니다. `-XX:+HeapDumpOnOutOfMemoryError`와 `-XX:HeapDumpPath`는 OOM 시점에 hprof를 남깁니다. `-Xlog:gc*,metaspace=info`는 GC와 Metaspace 관련 로그를 파일로 남깁니다.

`-XX:ErrorFile`은 JVM fatal error 로그 경로입니다. 일반적인 Java `OutOfMemoryError`에서는 hs_err 파일이 항상 생성되는 것은 아닙니다. 이 파일이 없다고 해서 실습이 실패한 것은 아닙니다.

## 재현 강도를 어떻게 조정할까

재현 속도는 환경 변수로 조정합니다.

```yaml
CLASS_BATCH_SIZE: "200"
CLASS_METHOD_COUNT: "20"
PAUSE_MILLIS: "0"
```

`CLASS_BATCH_SIZE`를 키우면 한 번에 더 많은 클래스를 생성합니다. 장점은 OOM까지 걸리는 시간이 짧아진다는 점입니다. 단점은 로그를 천천히 관찰하기 어렵고, 컴파일 작업도 한 번에 커진다는 점입니다.

`CLASS_METHOD_COUNT`를 키우면 각 클래스의 메서드 수가 늘어납니다. 장점은 클래스 하나가 차지하는 메타데이터가 커져 더 빨리 OOM에 도달할 수 있다는 점입니다. 단점은 실제 서비스 클래스의 형태와 멀어질 수 있다는 점입니다.

`PAUSE_MILLIS`를 키우면 batch 사이에 쉬는 시간이 생깁니다. 장점은 로그와 dump 생성 시점을 관찰하기 쉽다는 점입니다. 단점은 재현 시간이 길어집니다.

## 정리

정리하면, 이 실습은 "클래스를 계속 만들고, 로드하고, 참조를 유지하면 Metaspace가 찬다"는 질문에 답하기 위한 최소 Docker Compose 환경입니다. 운영 설정을 흉내 내기보다 원인을 잘라서 보는 것이 목적입니다.

## 참고자료

- [Oracle Java SE Tools Reference - java command](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)
- [Oracle Java SE Tools Reference - javac command](https://docs.oracle.com/en/java/javase/21/docs/specs/man/javac.html)
