---
type: Decision
title: nginx default.conf를 파일 하나로 두고 Terraform과 compose가 공유한다
description: task definition command는 file()로 conf를 heredoc에 끼워 넣고, compose는 같은 파일을 mount한다
tags: [ecs, terraform, nginx]
timestamp: 2026-10-11T00:00:00Z
---

## 결정

- `nginx/default.conf`를 원본으로 둔다.
- `terraform/ecs.tf`의 `local.container_command`가 `file()`로 conf를 읽어 `cat > ... <<'EOF'` heredoc 안에 넣고 `exec nginx -g 'daemon off;'`로 끝낸다.
- `compose.yaml`은 같은 파일을 `/etc/nginx/conf.d/default.conf`에 mount하고 같은 health check를 쓴다.

## 이유

- conf를 HCL에 직접 쓰면 compose와 두 벌이 되어 한쪽만 고치는 일이 생긴다.
- `file()` 결과는 template으로 다시 해석되지 않으므로 conf 안의 `$hostname`에 `$${` escape가 필요 없다. 쉘 치환은 quoted heredoc(`'EOF'`)이 막는다.
- 렌더링된 command를 `public.ecr.aws/nginx/nginx:stable-alpine` arm64 컨테이너로 실행해 PID 1이 nginx이고 health check가 healthy임을 확인했다.
- 같은 컨테이너에서 `wget http://localhost/health`는 실패했다. `localhost`가 `::1`로 풀리고 nginx는 IPv4로만 listen한다. 그래서 health check는 `127.0.0.1`을 쓴다.
