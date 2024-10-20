# 개요
* prometheus와 vault 활성화

# vault<->prometheus 연동 방법

* vault policy 생성

```sh
vault policy write prometheus-metrics - << EOF
path "/sys/metrics" {
  capabilities = ["read"]
}
EOF
```

* vault toekn 생성

```sh
vault token create -policy=prometheus-metrics -format=json
```

* vault token을 prometheus config에 설정

```sh
$ vi ./prometheus_config/prometheus.yml
scrape_configs:
- job_name: 'vault_metrics'
  authorization:
    credentials: '{your vault token}'
```

* docker compose stop and up

```sh
docker compose stop prometheus
docker compose start prometheus
```

# 참고자료
* https://developer.hashicorp.com/vault/tutorials/archive/monitor-telemetry-grafana-prometheus
