# 개요
* EKS구축 후 초기 설치하는 ArgoCD bootstrap

# Bootstrap ArgoCD Application 목록
* [argocd-app helm chart로 원클릭 bootstrap 설치](./one-click-bootstrap)
* [root applicationset](./root-applicationset.yaml)은 가장 먼저 실행되야 하는 ArgoCD applicatino모음(예: ALB controller, ExternalDNS)
* [required child applicationset](./required-child-applicationset.yaml)은 root application실행 이후 생성하는 ArgoCD application모음
