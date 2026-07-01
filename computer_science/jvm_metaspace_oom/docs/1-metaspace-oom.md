# Metaspace OOM은 왜 발생할까

Java 애플리케이션에서 `java.lang.OutOfMemoryError`가 발생하면 보통 heap부터 떠올립니다. 그런데 로그에 `Metaspace`가 붙어 있으면 원인이 조금 다릅니다. heap이 아니라 클래스 메타데이터를 저장하는 영역이 부족해진 상황이기 때문입니다.

왜 객체를 많이 만들지 않아도 OOM이 날까요?

## Metaspace는 무엇을 담을까

Metaspace는 JVM이 로드한 클래스의 메타데이터를 저장하는 native memory 영역입니다. 클래스 이름, 메서드, 필드, 상속 관계, constant pool 같은 정보가 이 영역에 올라갑니다. Java 8 이후 PermGen이 사라지고 Metaspace가 그 역할을 맡았습니다.

heap과 다른 점은 저장 대상입니다. heap은 애플리케이션 객체를 담고, Metaspace는 JVM이 클래스를 이해하고 실행하기 위해 필요한 구조 정보를 담습니다. 그래서 큰 배열이나 큰 문자열을 만들지 않아도, 클래스를 계속 새로 로드하면 Metaspace가 늘어납니다.

**Metaspace OOM은 객체 수보다 클래스 로딩 패턴을 먼저 의심해야 하는 OOM입니다.**

## 왜 클래스 로더를 붙잡으면 위험할까

클래스는 클래스 로더가 살아 있는 동안 쉽게 내려가지 않습니다. JVM은 클래스 로더가 더 이상 참조되지 않을 때 그 로더가 로드한 클래스도 함께 언로드할 수 있습니다. 반대로 애플리케이션이 클래스 로더나 `Class<?>` 객체를 계속 참조하면 클래스 메타데이터도 계속 남습니다.

이 핸즈온은 이 성질을 의도적으로 이용합니다. JDK compiler API로 매번 새로운 Java 클래스를 만들고, 새 `URLClassLoader`로 로드한 뒤, 클래스 로더와 클래스를 리스트에 보관합니다. 이러면 GC가 heap 객체는 정리하려고 해도 클래스 메타데이터를 내려놓기 어렵습니다.

이 방식의 장점은 원리가 직접 보인다는 점입니다. 외부 라이브러리 없이도 "클래스를 계속 로드하면 Metaspace가 찬다"를 확인할 수 있습니다. 단점은 실제 운영 장애의 원인을 그대로 재현하지는 않는다는 점입니다. 운영에서는 프레임워크 reload, 동적 proxy, 스크립트 엔진, 플러그인 구조처럼 간접적인 클래스 생성 경로가 원인일 수 있습니다.

## MaxMetaspaceSize를 왜 작게 잡을까

로컬 실습에서는 `-XX:MaxMetaspaceSize=32m`로 제한합니다. 제한을 작게 잡으면 짧은 시간 안에 OOM을 재현할 수 있습니다. 운영 환경의 권장값이라는 뜻은 아닙니다.

이 선택의 장점은 재현 시간이 짧고 결과가 명확하다는 점입니다. 단점은 작은 제한값 때문에 운영에서 보는 증가 속도와 다를 수 있다는 점입니다. 그래서 실습 결과를 운영 설정으로 바로 옮기면 안 됩니다. 운영에서는 애플리케이션의 클래스 수, 프레임워크, 배포 방식, 관측 지표를 같이 보고 판단해야 합니다.

## 정리

정리하면, 객체를 많이 만들지 않아도 OOM이 날 수 있는 이유는 JVM이 클래스 메타데이터를 heap 바깥의 Metaspace에 저장하기 때문입니다. 클래스가 계속 생성되고, 그 클래스를 로드한 클래스 로더가 계속 참조되면 Metaspace가 줄어들지 않습니다. 이 핸즈온은 그 현상을 작은 제한값에서 안전하게 재현하는 실습입니다.

## 참고자료

- [Oracle Java SE Troubleshooting Guide - Understand the OutOfMemoryError Exception](https://docs.oracle.com/en/java/javase/21/troubleshoot/troubleshooting-memory-leaks.html)
- [HotSpot Virtual Machine Garbage Collection Tuning Guide - Other Considerations](https://docs.oracle.com/en/java/javase/21/gctuning/other-considerations.html)
