# JVM 옵션 /dev/./urandom, 점 하나는 오타가 아니다

레거시 배포 스크립트를 보다 보면 `-Djava.security.egd=file:/dev/./urandom` 옵션을 만납니다. 경로 중간의 `.` 하나가 오타처럼 보여서 지우고 싶어집니다. 그런데 이 점은 오타가 아니라 JDK 버그를 속이기 위한 장치였고, 지금은 옵션 전체가 두 번이나 화석이 된 워크어라운드입니다. 왜 그런지 순서대로 풀어보겠습니다.

## 이 옵션은 무슨 문제를 풀려고 나왔나

2010년대 초 Tomcat을 VM에서 띄우면 기동이 수 분씩 걸리는 문제가 흔했습니다. 로그에는 이런 메시지가 남습니다.

```text
Creation of SecureRandom instance for session ID generation using [SHA1PRNG] took [193,502] milliseconds.
```

원인은 Java가 아니라 Linux 커널의 `/dev/random`이었습니다. Tomcat은 session ID를 만들 때 SHA1PRNG SecureRandom을 쓰고, SHA1PRNG는 최초 사용 시 seed를 `securerandom.source`에서 읽습니다. 이 값의 기본이 `file:/dev/random`입니다. 구버전 커널(5.6 미만)의 `/dev/random`은 entropy 추정치가 바닥나면 entropy가 다시 쌓일 때까지 read를 blocking합니다. 키보드·마우스·디스크 인터럽트가 없는 headless VM은 entropy가 잘 쌓이지 않아서, JVM이 seed 몇십 byte를 읽으려고 수 분씩 멈춘 것입니다.

**`-Djava.security.egd`는 이 seed 소스를 blocking하지 않는 `/dev/urandom`으로 바꿔서 기동 지연을 없애는 옵션입니다.** 여기서 보통 "urandom은 덜 안전하지 않나"라고 묻습니다. 커널 CSPRNG가 초기화된 뒤에는 `/dev/random`과 `/dev/urandom`이 같은 CRNG에서 출력을 뽑기 때문에 품질 차이가 없습니다. blocking은 안전을 더해주는 게 아니라 entropy 추정이라는 회계 장부가 만든 부작용이었고, 커널 개발자들도 이를 인정하고 뒤에서 설명할 5.6에서 동작을 바꿨습니다.

## 점 하나의 정체: JDK를 속이는 경로

그럼 `file:/dev/urandom`이라고 쓰면 될 텐데 왜 `file:/dev/./urandom`일까요. 옛 JDK(8 미만)는 JDK-4705093에서 `file:/dev/urandom`이라는 문자열에 특별한 의미를 부여했습니다. 정확히 이 문자열이 들어오면 설정을 그대로 쓰지 않고 NativePRNG 경로로 우회했는데, 그 seed 생성이 다시 `/dev/random`을 읽었습니다. urandom을 지정해도 `/dev/random`을 읽는 이 동작이 JDK-6202721로 보고된 버그입니다.

**`/dev/./urandom`은 문자열 비교를 빗나가게 해서 진짜 `/dev/urandom`을 읽게 만드는 트릭입니다.** 경로로서는 `/dev/urandom`과 같은 파일을 가리키지만, JDK의 하드코딩된 비교식과는 일치하지 않습니다. JDK 8에서 이 special-case가 정리되어 `file:/dev/urandom`도 의도대로 동작합니다. 즉 점은 JDK 7 이하에서만 의미가 있었습니다.

## 최신 커널에서는 옵션 자체가 필요 없다

Linux 5.6(2020년 3월)에서 blocking pool이 제거되었습니다. 이후 `/dev/random`은 부팅 직후 CRNG 초기화까지만 기다리고, 초기화된 뒤에는 `/dev/urandom`처럼 blocking 없이 출력합니다. 5.18에서는 두 장치의 내부 구현이 사실상 통합되었습니다. Amazon Linux 2023은 kernel 6.1 이상을 쓰므로 이 옵션이 풀려던 문제가 커널 차원에서 존재하지 않습니다. Amazon Linux 2도 기본 kernel이 5.10이라 해당하지 않고, 초기 AMI의 kernel 4.14만 옛 동작을 갖고 있습니다.

정리하면 이 옵션은 두 겹으로 화석입니다. JDK 8 이상이면 점(`.`)이 필요 없고, kernel 5.6 이상이면 옵션 전체가 필요 없습니다. 반대로 말하면 kernel 5.6 미만(예: CentOS 7의 3.10, Amazon Linux 2의 4.14)에서 JDK 8 애플리케이션을 돌린다면 여전히 유효한 옵션입니다. 지울 때는 커널 버전을 먼저 확인해야 합니다.

## 어디서 재현할 수 있나: macOS와 Docker는 안 된다

blocking을 직접 보고 싶어도 macOS에서는 재현할 수 없습니다. macOS의 `/dev/random`은 Fortuna 계열 CSPRNG라 entropy 추정으로 blocking하는 동작 자체가 없습니다.

Docker container도 안 됩니다. `/dev/random`의 blocking은 커널 동작인데 container는 호스트 커널을 공유합니다. macOS의 Docker Desktop은 최신 커널(5.10+)의 Linux VM 위에서 container를 돌리므로, `centos:7` 같은 옛 이미지를 써도 `uname -r`은 최신 커널을 보여주고 `/dev/random`은 blocking하지 않습니다. 이미지는 userland만 바꿀 뿐 커널을 바꾸지 못합니다.

재현하려면 kernel 5.6 미만이 실제로 부팅된 머신이 필요합니다. 가장 간단한 방법은 EC2에서 kernel 4.14를 쓰는 Amazon Linux 2 초기 AMI를 띄우는 것입니다. 이 저장소의 [실습환경 구축](./1-setup.md)이 kernel 4.14 인스턴스(재현용)와 Amazon Linux 2023 인스턴스(대조용)를 Terraform으로 만들고, [실습](./hands-on.md)에서 entropy를 고갈시켜 JVM seed 읽기가 멈추는 것과 `-Djava.security.egd=file:/dev/./urandom`으로 즉시 풀리는 것을 확인합니다.

## 정리

`/dev/./urandom`의 점은 오타가 아니라 JDK 7 이하의 문자열 special-case를 우회하던 트릭이고, 옵션 자체는 kernel 5.6 미만의 `/dev/random` blocking을 피하던 워크어라운드입니다. JDK 8 이상과 kernel 5.6 이상(AL2023 포함)을 쓴다면 지워도 되고, 구버전 커널이 남아 있다면 아직 유효합니다. 레거시 옵션을 지우기 전에 `uname -r`부터 확인합시다.

## 참고자료

1. Removing the Linux /dev/random blocking pool - https://lwn.net/Articles/808575/
2. Uniting the Linux random-number devices - https://lwn.net/Articles/884875/
3. JDK-6202721 SHA1PRNG reads from /dev/random even if java.security.egd is set to urandom - https://bugs.openjdk.org/browse/JDK-6202721
4. Red Hat: java.security.egd=file:/dev/urandom does not take effect in older versions than JDK 8 - https://access.redhat.com/solutions/2066163
5. Baeldung: The java.security.egd JVM Option - https://www.baeldung.com/java-security-egd
6. AL2023 kernel changes from AL2 - https://docs.aws.amazon.com/linux/al2023/ug/compare-with-al2-kernel.html
7. AL2 supported kernels - https://docs.aws.amazon.com/linux/al2/ug/aml2-kernel.html
