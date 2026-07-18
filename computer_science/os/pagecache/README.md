# 애플리케이션이 OS page cache를 쓴다는 말의 의미

"Kafka는 자체 캐시 대신 OS page cache에 의존한다"는 문장의 의미를 정리하고, page cache 동작을 Linux 명령으로 재현하는 공간이다.

## 문서

| 문서 | 설명 |
| --- | --- |
| [1. 실습 준비](./docs/1-setup.md) | 요구사항, 실습 파일 생성, drop_caches 주의사항을 정리한다 |
| [2. 모든 프로세스가 page cache를 쓰는데, 왜 Kafka만 "쓴다"고 강조할까](./docs/2-what-is-page-cache.md) | page cache 원리와 Kafka·DB의 캐시 전략 차이를 정리한다 |
| [3. 같은 파일인데 두 번째 읽기만 빠른 이유 관찰](./docs/3-observe-cold-vs-warm.md) | cold/warm read 시간 차이와 캐시가 프로세스 종료 후에도 남는 것을 관찰한다 |
| [4. O_DIRECT: page cache를 일부러 끄는 읽기](./docs/4-direct-io.md) | O_DIRECT로 page cache를 우회하면 생기는 일을 관찰한다 |

## 실행

cold read vs warm read를 재현한다 (root 필요).

```bash
sudo bash scripts/cold-vs-warm-read.sh
```

O_DIRECT가 page cache를 우회하는 것을 재현한다 (root 필요).

```bash
sudo bash scripts/direct-io-read.sh
```

정리한다.

```bash
rm -f /tmp/pagecache-test
```
