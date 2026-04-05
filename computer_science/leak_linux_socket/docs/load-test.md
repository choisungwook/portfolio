# k6를 이용한 부하 테스트

k6로 `/reproduce`를 반복 호출하여 소켓 누수가 누적되는 과정을 Grafana에서 관찰합니다. 스크립트(`k6/load-test.js`)는 VU 300개가 300초 동안 1초 간격으로 요청을 보냅니다. 각 요청은 socketTimeout 3초를 기다리므로 실제 호출 간격은 약 4초입니다.

```bash
brew install k6          # 설치
make up                  # 환경 실행
make open                # Grafana 대시보드 열기
k6 run k6/load-test.js   # 부하 테스트 실행
make down                # 환경 종료
```
