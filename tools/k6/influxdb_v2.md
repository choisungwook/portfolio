## 개요

* 2025년 4월 기준으로 k6는 influxDB v2를 호환하지 않아, 별도로 플러그인을 설치해야 합니다.

## 플러그인 설치 방법

> go lang이 설치되어 있어야 합니다.

* k6 플러그인은 내 PC에서 빌드해야 합니다. 빌드가 성공하면 k6 실행 파일(바이너리)이 생성됩니다.

```sh
go install go.k6.io/xk6/cmd/xk6@latest
xk6 build --with github.com/grafana/xk6-output-influxdb@latest
```

## 플러그인 실행 방법

* k6 실행인자에 --out xk6-influxdb을 지정하면 됩니다.

```sh
./k6 run --out xk6-influxdb=http://localhost:8086 {k6 스크립트 경로}
```

## 참고자료
* https://github.com/grafana/xk6-output-influxdb
