#!/bin/bash

kubectl delete deployment http-echo

N=15000  # 원하는 서비스 개수로 설정하세요
seq 1 $N | xargs -n 1 -P 30 -I {} kubectl -n default delete service http-echo-{}
