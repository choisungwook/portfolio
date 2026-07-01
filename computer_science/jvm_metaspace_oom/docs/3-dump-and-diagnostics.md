# 덤프와 로그는 어떻게 확인할까

OOM을 재현하는 것만으로는 부족합니다. 장애 대응에서는 "발생했다"와 "무엇을 남겼다"를 구분해야 합니다. 이 실습은 hprof, JVM 로그, 운영 수집 체크리스트를 따로 확인합니다.

Metaspace OOM 이후에는 어떤 파일을 먼저 봐야 할까요?

## 생성 파일 확인

컨테이너가 OOM으로 종료된 뒤 dump 디렉터리를 확인합니다.

```bash
make dumps
```

직접 확인하려면 아래 명령을 사용합니다.

```bash
ls -lh dumps
```

성공하면 아래 파일이 생깁니다.

```text
metaspace-oom.hprof
jvm-metaspace.log
```

`hs_err_pid*.log`는 없을 수 있습니다. Java level의 `OutOfMemoryError`가 발생했다고 해서 항상 fatal error 파일이 만들어지는 것은 아닙니다.

## hprof는 무엇을 보여줄까

`metaspace-oom.hprof`는 heap dump입니다. 이름 때문에 Metaspace 자체를 그대로 떠 준다고 생각하기 쉽지만, hprof는 heap에 남아 있는 객체와 참조 관계를 보는 자료입니다.

그럼 Metaspace OOM에서 hprof가 왜 필요할까요? 클래스 로더를 누가 붙잡고 있는지 볼 수 있기 때문입니다. 이 실습에서는 `MetaspaceOomLab.RETAINED_LOADERS`와 `MetaspaceOomLab.RETAINED_CLASSES`가 클래스 로더와 클래스를 계속 참조합니다.

MAT, VisualVM, IntelliJ profiler 같은 도구로 hprof를 열어 아래 대상을 찾습니다.

```text
java.net.URLClassLoader
java.lang.Class
com.example.generated.Generated*
com.example.metaspace.MetaspaceOomLab
```

이 실습의 장점은 참조 경로가 단순하다는 점입니다. 단점은 운영 장애처럼 여러 framework와 agent가 얽힌 복잡한 경로를 그대로 보여주지는 않는다는 점입니다.

## JVM 로그는 무엇을 보여줄까

`jvm-metaspace.log`는 GC와 Metaspace 관련 로그입니다. 로그를 보면 Metaspace 사용량이 증가하는 흐름과 OOM 직전의 JVM 동작을 확인할 수 있습니다.

아래 명령으로 Metaspace 관련 줄을 확인합니다.

```bash
grep -i metaspace dumps/jvm-metaspace.log | tail -40
```

로그는 hprof와 역할이 다릅니다. hprof는 "누가 참조하고 있는가"를 보는 데 유리하고, JVM 로그는 "언제 얼마나 증가했는가"를 보는 데 유리합니다. 둘 중 하나만 보면 원인을 좁히기 어렵습니다.

## 운영 환경에서는 무엇을 일반화해야 할까

AWS Auto Scaling Group, systemd, S3 jar 배포 같은 환경에서는 실제 계정, bucket, host, path를 문서나 코드에 고정하지 않습니다. 대신 아래 체크리스트로 일반화합니다.

- JVM 옵션은 서비스 단위 환경 변수나 systemd drop-in으로 관리한다.
- dump 저장 위치는 애플리케이션 쓰기 권한이 있는 로컬 디렉터리로 둔다.
- OOM 이후에는 dump를 별도 보관소로 복사한다.
- dump 파일에는 민감한 값이 들어갈 수 있으므로 접근 권한과 보관 기간을 정한다.
- 분석은 운영 서버가 아니라 별도 환경에서 수행한다.

예시 형태는 아래처럼 값이 없는 template로만 둡니다.

```ini
[Service]
Environment="JAVA_OPTS=-XX:MaxMetaspaceSize=<size> -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=<dump-dir>/<app>.hprof"
```

S3 같은 외부 보관소로 옮길 때도 실제 bucket 이름은 쓰지 않습니다.

```bash
aws s3 cp <dump-dir>/<app>.hprof s3://<dump-bucket>/<service>/<date>/<app>.hprof
```

## 추가 진단 옵션은 무엇을 볼까

Metaspace OOM을 더 자세히 봐야 한다면 `NativeMemoryTracking`을 검토할 수 있습니다.

```text
-XX:NativeMemoryTracking=summary
```

장점은 JVM native memory 분류를 더 자세히 볼 수 있다는 점입니다. 단점은 약간의 overhead가 있고, 실행 중 `jcmd`로 별도 조회해야 하므로 운영 환경에서 권한과 절차가 필요합니다. 이 실습에서는 기본 옵션에 넣지 않았습니다.

Metaspace OOM 상황에서 반드시 남겨야 할 추가 JVM 진단 옵션은 서비스의 JVM 버전, 컨테이너 제한, 운영 수집 체계에 따라 달라집니다. 이 부분은 `확인 필요`입니다.

## 정리

정리하면, Metaspace OOM 이후에는 hprof와 JVM 로그를 분리해서 봐야 합니다. hprof는 참조 관계를 보여주고, JVM 로그는 증가 흐름을 보여줍니다. 운영 환경으로 옮길 때는 실제 인프라 값을 코드나 문서에 박지 않고, dump 수집과 보관 절차만 일반화해야 합니다.

## 참고자료

- [Oracle Java SE Troubleshooting Guide - Diagnostic Tools](https://docs.oracle.com/en/java/javase/21/troubleshoot/diagnostic-tools.html)
- [Oracle Java SE Tools Reference - jcmd](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html)
