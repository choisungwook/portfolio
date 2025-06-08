## 개요

* sysbench로 RDS CPU 사용률을 높여, cloudwatch alarm 을 트리거
* [이 예제 테라폼](../terraform/)으로 생성된 EKS, RDS로 테스트를 진행합니다.

## 준비

### 1. 테스트를 위한 db 생성

1. mysql pod 생성

```sh
kubectl apply -f ../kubernetes_manifests/mysql-cli.yaml
```

2. mysql pod에서 mysql cli로 로그인 및 데이터 확인

```sh
kubectl exec -it mysql-cli -- /bin/bash
mysql> mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_ROOT_PASSWORD
mysql> use testdb;
mysql> select c from sbtest1 limit 1;
```

### RDS CPU 스트레스 테스트

1. stress 테스트 configmap에서 이전과정에서 확인한 c필드를 업데이트

```sh
$ vi ../kubernetes_manifests/sysbench_configmap.yaml
local query = ...
```

2. kubernetes sysbench configmap 배포

```sh
kubernetes apply -f ../kubernetes_manifests/sysbench_configmap.yaml
```

3. sysbench 스트레스 기능을 하는 kubernetes job 실행

1. job배포

```sh
kubernetes apply -f ../kubernetes_manifests/sysbench_stress_job.yaml
```

2. pod 실행 확인

```sh
$ kubectl get pod
sysbench-stress-d6llg    1/1     Running     0          6s
```

```sh
$ kubectl logs -f sysbench-stress-d6llg
sysbench 1.0.17 (using bundled LuaJIT 2.1.0-beta2)

Running the test with following options:
Number of threads: 16
Report intermediate results every 10 second(s)
Initializing random number generator from current time


Initializing worker threads...

Threads started!

[ 10s ] thds: 16 tps: 0.00 qps: 0.00 (r/w/o: 0.00/0.00/0.00) lat (ms,95%): 0.00 err/s: 0.00 reconn/s: 0.00
[ 20s ] thds: 16 tps: 0.00 qps: 0.00 (r/w/o: 0.00/0.00/0.00) lat (ms,95%): 0.00 err/s: 0.00 reconn/s: 0.00
[ 30s ] thds: 16 tps: 0.00 qps: 0.00 (r/w/o: 0.00/0.00/0.00) lat (ms,95%): 0.00 err/s: 0.00 reconn/s: 0.00
[ 40s ] thds: 16 tps: 0.00 qps: 0.00 (r/w/o: 0.00/0.00/0.00) lat (ms,95%): 0.00 err/s: 0.00 reconn/s: 0.00
[ 50s ] thds: 16 tps: 0.00 qps: 0.00 (r/w/o: 0.00/0.00/0.00) lat (ms,95%): 0.00 err/s: 0.00 reconn/s: 0.00
```

4. RDS CPU 및 cloudwatch 확인

```sh
../kubernetes_manifests/sysbench_configmap.yaml
```

```sh
$ kubectl get pod
NAME                     READY   STATUS      RESTARTS   AGE
create-testdb-tfxsp      0/1     Completed   0          92m
mysql-cli                1/1     Running     0          10m
sysbench-prepare-45p6f   0/1     Completed   0          89m
sysbench-stress-d6llg    1/1     Running     0          6s
```

![알람](../imgs/cloudwatch_alarm_alb_errorrate_1.png)

![알람](../imgs/cloudwatch_alarm_alb_errorrate_2.png)

![알람](../imgs/cloudwatch_alarm_alb_errorrate_3.png)
