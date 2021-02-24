# 개요
* marathon-lb 설정

# 로드 밸런스 설정
* label을 external로 설정
```json
{
  "labels": {
    "HAPROXY_GROUP": "external"
  },
  ...
}
```

![](./imgs/external.png)