## 테스트

* k6 실행

```sh
k6 run --out xk6-influxdb=http://localhost:8086 stress.js
```


## 결과 확인

* 3000명일때 thresholds실패


![](./imgs/over_3000.png)
