# 5. 운영 적용 체크리스트 — 켜기만 하면 되는 옵션이 아니다

이 옵션은 평소 비용이 없어서 켜는 것 자체는 쉽습니다. 위험은 반대쪽에 있습니다. 켜 두고 잊으면 정작 사고 순간에 dump가 안 남거나, dump 때문에 디스크가 차는 2차 장애가 납니다. 켤지 말지가 아니라, 켠 뒤에 무엇을 같이 챙길지가 이 문서의 주제입니다.

## 꼭 켜야 할까요?

**켜는 것을 기본값으로 두는 편이 낫습니다.** OOM이 없는 평상시에는 아무 동작도 하지 않으므로 켜 두는 비용이 없고, 안 켜면 첫 OOM의 증거를 영영 잃습니다. OOM은 재현이 어려워서 "다음에 켜고 기다리자"는 몇 주짜리 계획이 됩니다.

트레이드오프는 명확합니다. 얻는 것은 사고 순간의 증거이고, 지는 부담은 아래 네 가지를 운영 절차로 관리하는 일입니다. 이 부담을 지지 않을 서비스(즉시 재현 가능한 개발 환경 등)라면 안 켜도 됩니다.

기준 삼을 옵션 조합입니다.

```bash
java -Xmx4g \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/dumps \
  -XX:+ExitOnOutOfMemoryError \
  -jar app.jar
```

`ExitOnOutOfMemoryError`를 같이 두는 이유는 OOM 이후의 JVM이 정상이 아니기 때문입니다. 일부 스레드만 죽은 채 트래픽을 받는 반쯤 죽은 상태보다, dump를 남기고 즉시 종료해 orchestrator가 재시작하게 만드는 쪽이 안전합니다. 실험해 보면 dump를 먼저 쓰고 종료하므로 증거는 잃지 않습니다.

## 체크 1. 디스크 — dump 크기의 상한은 Xmx다

dump 크기는 OOM 순간의 heap 사용량이고, OOM 시점의 heap은 거의 가득 차 있으므로 상한은 사실상 `-Xmx`입니다. `-Xmx8g`면 8GB짜리 파일이 생길 수 있습니다.

- dump 경로 파티션에 `-Xmx` 이상의 여유를 확보합니다.
- 애플리케이션 로그와 같은 파티션에 두지 않습니다. dump가 디스크를 채우면 로그까지 멈추는 2차 장애가 됩니다.
- 쓰다가 디스크가 차면 잘린 dump가 남고, 잘린 dump는 MAT가 열지 못합니다. 증거 확보에 실패한 것과 같습니다.

## 체크 2. 수거와 정리 — JVM은 덮어쓰지 않는다

[실험 2](./3-reproduce-oom-dump.md)에서 확인한 대로, 같은 이름의 dump 파일이 있으면 JVM은 `Unable to create ... File exists`를 남기고 dump를 포기합니다. JVM에는 오래된 dump를 지우는 기능도 없습니다. 그래서 "OOM 발생 → dump를 분석 장비로 수거 → 원본 삭제"를 운영 절차로 만들어야 두 번째 사고의 증거를 잃지 않습니다.

"첫 OOM에서 한 번만"이 프로세스 기준이라는 점이 여기서 반대 방향의 문제도 만듭니다. systemd가 죽은 서비스를 자동 재시작하면 새 JVM이라 내부 플래그가 초기화되고, 프로세스마다 dump가 1회씩 새로 생깁니다. `HeapDumpPath`가 고정 파일명이면 파일 충돌로 첫 dump만 남지만, 디렉터리면 호스트에서는 재시작마다 pid가 달라져 `java_pid<pid>.hprof`가 계속 쌓입니다. OOM → 재시작 → OOM 루프에 들어간 서비스가 `-Xmx` 크기의 dump를 반복 생성해 디스크를 채우는 시나리오입니다. 수거 절차에 오래된 dump 정리(개수 또는 보관 기간 상한)까지 넣어야 하는 이유입니다.

## 체크 3. 멈춤 시간 — dump를 쓰는 동안 JVM은 정지한다

dump를 쓰는 동안 모든 애플리케이션 스레드가 멈춥니다. 이 실습에서는 약 1GB를 3.1초에 썼지만 로컬 NVMe 기준이고, 수십 GB heap을 네트워크 스토리지에 쓰면 분 단위까지 늘어납니다.

Kubernetes에서는 이 멈춤이 liveness probe 실패로 이어질 수 있습니다. probe가 먼저 터져 kubelet이 컨테이너를 죽이면 잘린 dump가 남습니다. heap이 큰 서비스는 dump 시간을 감안해 probe의 failureThreshold와 terminationGracePeriodSeconds에 여유를 둡니다.

## 체크 4. 컨테이너 — dump를 컨테이너 밖에 남겨라

컨테이너 파일시스템에 쓴 dump는 재시작과 함께 사라집니다. 이 실습이 `dumps/`를 volume mount한 것과 같은 이유로, 운영에서는 `HeapDumpPath`를 emptyDir이나 PersistentVolume 같은 컨테이너 밖 저장소로 향하게 합니다. emptyDir은 pod 재시작(컨테이너 재시작)에는 살아남지만 pod 삭제에는 사라지므로, 수거 전 pod이 지워질 수 있는 환경이면 PersistentVolume을 씁니다. dump를 컨테이너 쓰기 계층에 남기면 ephemeral-storage limit을 초과해 pod eviction까지 이어질 수 있다는 점도 컨테이너 밖에 써야 할 이유입니다.

## 체크 5. 민감정보 — dump는 메모리 전체의 사본이다

heap에는 그 순간 메모리에 있던 전부가 들어 있습니다. 평문 비밀번호, 세션 토큰, 개인정보가 문자열 그대로 남습니다. dump 파일을 로그처럼 다루면 안 됩니다. 접근 권한을 제한하고, 외부(개인 PC, 외부 SaaS)로 반출하지 않고, 분석이 끝나면 파기합니다.

여기서 보통 "`OnOutOfMemoryError`로 업로드 스크립트를 돌리면 수거도 자동화되지 않나"를 묻습니다. 가능하지만, OOM 직후의 프로세스에서 외부 명령 실행은 실패할 수 있고 실패를 알기도 어렵습니다. 수거는 JVM 바깥(노드의 수집 데몬, sidecar, 운영 절차)에서 하는 쪽이 단순합니다.

이 옵션은 켜는 것이 기본값이지만, 목표는 "켜기"가 아니라 "dump가 실제로 남고, 안전하게 수거되는 상태"입니다. 디스크 여유, 수거 절차, 멈춤 시간, 저장 위치, 민감정보 다섯 가지가 그 상태를 만듭니다.

## 참고자료

- [java 명령 매뉴얼(HeapDumpOnOutOfMemoryError, ExitOnOutOfMemoryError)](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)
- [Kubernetes ephemeral storage 문서](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
