# zero copy

계산을 전혀 하지 않는 파일 서버가 왜 CPU를 쓰는지, 그 CPU가 어디까지 줄어드는지 재현하는 공간이다.

`read()` + `write()`로 파일을 소켓에 보내면 같은 바이트가 네 번 복사되고 그 중 두 번을 CPU가 한다. `mmap`과 `sendfile`은 그 복사를 하나씩 지운다. 여기서는 세 경로로 같은 파일을 보내고 syscall 횟수와 system CPU 시간을 직접 비교한다.

## 학습지

[studysheet-zero-copy.html](./studysheet-zero-copy.html)을 브라우저로 열어 페이지를 넘기며 읽는다. 외부 라이브러리 없이 파일 하나로 동작한다. 원리, 실습 결과, 한계까지 16장으로 정리했다.

## 문서

| 문서 | 설명 |
| --- | --- |
| [1. Setup](./docs/1-setup.md) | 컨테이너 기동과 테스트 파일 생성, 정리 |
| [2. Why copying is the cost](./docs/2-why-copy-costs.md) | 네 번의 복사 중 무엇이 CPU 비용인지 정리한다 |
| [3. Measuring the three transfer paths](./docs/3-measure-transfer-paths.md) | readwrite, mmap, sendfile을 측정하고 결과를 읽는다 |
| [4. What zero copy does not solve](./docs/4-limits.md) | TLS, 본문 가공, 작은 파일에서 이득이 사라지는 이유 |

## 실행

컨테이너를 띄우고 256MB 테스트 파일을 만든다.

```bash
docker compose up -d --build
docker compose exec lab /lab/scripts/make-testfile.sh 256
```

세 경로를 3라운드씩 측정한다.

```bash
docker compose exec lab /lab/scripts/bench.sh
```

정리한다.

```bash
docker compose down -v
```

## 디렉터리

| 경로 | 설명 |
| --- | --- |
| `src/fileserver.c` | 같은 파일을 readwrite, mmap, sendfile 세 경로로 보내고 비용을 출력하는 서버 |
| `scripts/` | 테스트 파일 생성, 단일 전송, 벤치마크 스크립트 |
| `docs/` | 원리와 실습 절차 |
