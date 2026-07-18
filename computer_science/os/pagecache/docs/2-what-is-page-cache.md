# 모든 프로세스가 page cache를 쓰는데, 왜 Kafka만 "쓴다"고 강조할까

Kafka 설계 문서를 읽다 보면 "자체 캐시 대신 OS page cache에 의존한다"는 문장이 나옵니다. 그런데 이상합니다. Linux에서 파일을 읽고 쓰는 프로세스는 전부 page cache를 거칩니다. 모두가 자동으로 쓰는 것을 왜 Kafka만 특별히 "쓴다"고 말할까요? 답은 "쓰냐 안 쓰냐"가 아니라 **그 위에 자기 캐시를 또 만드느냐**에 있습니다.

## page cache는 신청하는 기능이 아니다

메모리(DRAM)는 나노초 단위로 읽지만 디스크는 SSD가 마이크로초, HDD는 밀리초 단위입니다. 수천 배에서 수십만 배 차이입니다. 그래서 커널은 디스크에서 한 번 읽은 데이터의 사본을 남는 메모리에 보관해 둡니다. 이 보관 공간이 page cache입니다. 메모리를 page(보통 4KB) 단위로 관리하기 때문에 이런 이름이 붙었습니다.

프로세스가 read()로 파일을 읽으면 커널은 먼저 page cache를 확인합니다. 있으면 디스크에 가지 않고 메모리 사본을 복사해 주고, 없으면 디스크에서 읽어 page cache에 넣은 뒤 돌려줍니다. write()도 일단 page cache에 쓰고(write-back), 커널이 나중에 모아서 디스크에 내립니다. free 명령의 cache 열이 이 공간의 크기입니다.

핵심은 이것이 **선택이 아니라 기본 동작**이라는 점입니다. 일반적인 read()/write()를 부르는 순간 자동으로 page cache를 거칩니다. 그러니 "OS에서 실행되는 프로세스는 전부 page cache를 쓸 텐데?"라는 직감은 정확히 맞습니다.

## 같은 사실 위에서 갈리는 세 가지 전략

모두가 page cache를 지나가지만, 애플리케이션이 캐시를 대하는 전략은 세 갈래로 갈립니다.

| 전략 | 예 | 동작 |
| --- | --- | --- |
| 그냥 지나간다 | 대부분의 앱 | page cache의 존재를 의식하지 않고 혜택만 받는다 |
| 내 캐시를 따로 만들고 page cache를 끈다 | MySQL InnoDB 등 DB | 자체 buffer pool을 크게 잡고, O_DIRECT로 page cache를 우회한다 |
| 내 캐시를 안 만들고 page cache에 전부 맡긴다 | Kafka | heap을 작게 잡고 캐시 역할을 통째로 OS에 위임한다 |

두 번째 전략이 존재하는 이유는 이중 캐시 문제입니다. DB가 buffer pool에 데이터를 올려 두면, 같은 데이터가 page cache에도 들어가 메모리를 두 번 차지합니다. 그래서 DB는 O_DIRECT라는 플래그로 page cache를 우회해 디스크와 직접 주고받습니다. 즉 page cache를 "안 쓰는" 선택도 가능합니다.

여기서 처음 질문이 풀립니다. "Kafka가 OS page cache를 쓴다"는 문장은 "read()를 하면 page cache를 지나간다"는 당연한 사실을 말하는 게 아닙니다. **자체 대형 buffer pool을 만들지 않고, 캐시라는 역할 자체를 OS에 맡기기로 했다는 설계 결정**을 말하는 것입니다.

## Kafka는 왜 OS에 맡겼을까

Kafka는 JVM 위에서 돕니다. 만약 수십 GB짜리 캐시를 JVM heap 안에 만들면 두 가지 비용이 생깁니다. Java 객체는 원본 데이터보다 메모리를 훨씬 더 먹고, heap이 커질수록 GC(garbage collection)가 멈추는 시간이 길어집니다. 반면 page cache는 커널 공간에 있어서 GC 대상이 아닙니다.

더 결정적인 이유는 재시작입니다. heap 안의 캐시는 프로세스가 죽으면 같이 사라져서, 재시작 후 캐시가 다시 차오를 때까지 느립니다. page cache는 프로세스가 아니라 커널 소유라서 **Kafka를 재시작해도 캐시가 그대로 남아 있습니다**. 이 성질은 핸즈온에서 직접 확인합니다.

워크로드 궁합도 좋습니다. Kafka는 로그 파일을 순차로 쓰고 순차로 읽는데, 커널은 순차 읽기를 감지하면 다음 데이터를 미리 읽어 둡니다(readahead). 또 consumer에게 데이터를 보낼 때 sendfile 시스템 콜을 쓰면 page cache에서 네트워크 카드로 바로 전송되어, heap으로 복사해 올릴 필요가 없습니다.

여기서 보통 "write도 page cache에만 쓰면, 디스크에 내려가기 전에 장애가 나면 데이터가 날아가지 않나"라고 묻습니다. 맞습니다. 그래서 Kafka는 매 쓰기마다 fsync로 디스크에 내리는 대신, 여러 broker에 복제해서 내구성을 확보하는 쪽을 택했습니다.

물론 공짜는 아닙니다. OS에 맡기면 제어권이 없습니다. 어떤 데이터를 캐시에 남길지 정책을 조정할 수 없고, 같은 머신의 다른 프로세스가 메모리를 크게 쓰면 캐시가 밀려납니다. DB가 굳이 buffer pool을 직접 만드는 이유도 여기 있습니다. 자기 워크로드에 맞는 페이지 교체 정책과 dirty page 제어가 필요하기 때문입니다. 어느 쪽이 정답이 아니라, 워크로드에 따른 선택입니다.

## 정리

정리하면, 모든 프로세스가 page cache를 쓴다는 직감은 맞습니다. "Kafka가 OS page cache를 쓴다"는 말은 그 위에 자기 캐시를 또 만들지 않고 캐시 역할을 OS에 위임했다는 설계 결정이고, 반대편에는 O_DIRECT로 page cache를 꺼 버리고 자체 buffer pool을 쓰는 DB가 있습니다. 그래서 Kafka broker의 메모리 그래프에서 heap은 작고 OS cache가 큰 것은 문제가 아니라 의도된 모습입니다.

## 참고자료

1. Kafka 공식 문서 - Persistence 설계: <https://kafka.apache.org/documentation/#design_filesystem>
2. MySQL 공식 문서 - innodb_flush_method(O_DIRECT): <https://dev.mysql.com/doc/refman/8.0/en/innodb-parameters.html#sysvar_innodb_flush_method>
