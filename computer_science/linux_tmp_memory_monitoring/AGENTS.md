# what is tmpfs?

이 디렉터리는 리눅스 `tmpfs`가 메모리 사용률 알람 오탐을 만들 수 있는 상황을 설명하는 핸즈온입니다.

## 디렉터리 구조

```bash
$ tree ./
├── Makefile # 핸즈온 환경 생성 자동화
├── README.md
├── docs # 핸즈온 문서
├── manifests # 핸즈온에 필요한 manifests
│   └── docker-compose
│       ├── docker-compose.yml
│       └── monitoring
│           ├── alerts.yml
│           ├── grafana
│           └── prometheus.yml
├── scripts # 핸즈온에 필요한 scripts
└── terraform # AWS에서 테스트하기 위한 테라폼코드
```
