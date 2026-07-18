# O_DIRECT: page cache를 일부러 끄는 읽기

page cache는 기본 동작이지만 끌 수도 있습니다. O_DIRECT 플래그로 파일을 열면 커널은 page cache를 건너뛰고 디스크와 직접 데이터를 주고받습니다. DB가 자체 buffer pool을 쓸 때 택하는 방식이 바로 이것입니다. 캐시를 끄면 무슨 일이 생기는지 관찰합니다.

환경 준비는 [1. 실습 준비](./1-setup.md)를 따릅니다.

## O_DIRECT로 읽기

캐시를 비운 뒤, dd의 iflag=direct 옵션으로 O_DIRECT 읽기를 합니다. 읽기 전후의 Cached 크기를 비교합니다.

```bash
sync && echo 3 > /proc/sys/vm/drop_caches
grep "^Cached" /proc/meminfo
time dd if=/tmp/pagecache-test of=/dev/null bs=1M iflag=direct
grep "^Cached" /proc/meminfo
```

실행 결과 예시입니다. 1GB를 읽었는데 Cached가 늘지 않았습니다. 데이터가 page cache를 거치지 않고 프로세스 버퍼로 직행했다는 뜻입니다.

```text
Cached:           228112 kB

1073741824 bytes (1.1 GB, 1.0 GiB) copied, 0.655278 s, 1.6 GB/s
real    0m0.657s

Cached:           230272 kB
```

## 두 번 읽어도 빨라지지 않는다

같은 O_DIRECT 읽기를 반복합니다.

```bash
time dd if=/tmp/pagecache-test of=/dev/null bs=1M iflag=direct
```

buffered 읽기는 두 번째부터 warm read로 빨라졌지만, O_DIRECT는 몇 번을 읽어도 매번 디스크에 갑니다. 캐시에 넣지 않으니 캐시 히트도 없습니다. 이 환경 기준으로 warm read 0.139초 vs O_DIRECT 0.657초, 캐시를 끄는 순간 매번 4~5배를 치릅니다.

## 그런데 DB는 왜 일부러 이 느린 길을 택할까

여기서 보통 "캐시를 끄면 느려지는데 InnoDB는 왜 O_DIRECT를 쓰나"라고 묻습니다. InnoDB는 캐시를 포기한 것이 아니라 **자기 buffer pool로 캐시를 직접 하겠다**는 것입니다. buffer pool에 올린 데이터가 page cache에도 또 들어가면 같은 데이터가 메모리를 두 번 차지하므로, page cache 쪽을 꺼서 이중 캐시를 없애는 선택입니다. 대신 페이지 교체 정책과 dirty page 내리는 시점을 DB가 원하는 대로 제어할 수 있습니다.

이 실습이 보여주는 것은 선택지의 실체입니다. 애플리케이션 앞에는 "page cache에 맡긴다(Kafka)"와 "O_DIRECT로 끄고 내 캐시를 만든다(InnoDB)"라는 두 갈래 길이 실제로 존재하고, dd 옵션 하나로 그 갈림길을 재현할 수 있습니다.

## 정리

O_DIRECT는 page cache가 선택 가능한 계층임을 보여줍니다. 기본값은 모두가 page cache를 지나가는 것이고, 자체 캐시를 가진 애플리케이션만 이중 캐시를 피하려고 일부러 끕니다. "Kafka는 OS page cache를 쓴다"는 문장은 이 갈림길에서 끄지 않는 쪽, 즉 자체 캐시를 만들지 않는 쪽을 택했다는 뜻입니다.
