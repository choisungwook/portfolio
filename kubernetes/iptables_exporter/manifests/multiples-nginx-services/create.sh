#!/bin/sh

kubectl -n default create deployment http-echo --image=traefik/whoami --replicas=1

N=15000  # 원하는 서비스 개수로 설정하세요
seq 1 $N | xargs -n 1 -P 30 -I {} kubectl -n default expose deployment http-echo --port=80 --target-port=80 --name=http-echo-{}
