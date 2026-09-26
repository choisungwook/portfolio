# SELinux 핸즈온

nginx로 SELinux 거부를 4번 만들고 각각 다른 수단으로 고친다. label, 파일 경로 규칙, 포트 label, boolean 순서다.

- 환경: [4-setup-ec2.md](4-setup-ec2.md). 모든 명령은 EC2의 root 셸에서 실행한다
- 개념: [1-selinux-concepts.md](1-selinux-concepts.md)
- 확인 필요: 출력 예시는 AL2023 targeted 정책 기준 예상값이다. 실측하면 이 줄을 지운다

## 0. 현재 상태 확인

SELinux 상태와 정책을 본다.

```bash
sestatus
```

AL2023은 켜져 있지만 permissive다.

```text
SELinux status:                 enabled
Loaded policy name:             targeted
Current mode:                   permissive
Mode from config file:          permissive
```

nginx를 띄운다.

```bash
systemctl enable --now nginx
```

## 1. enforcing으로 바꾸기

재부팅 전까지만 유효한 전환이다.

```bash
setenforce 1 && getenforce
```

## 2. label 관찰

nginx 실행 파일, 프로세스, 웹 루트의 label을 차례로 본다.

```bash
ls -Z /usr/sbin/nginx
ps -eZ | grep nginx
ls -Zd /usr/share/nginx/html
id -Z
```

| 대상 | type | 의미 |
|---|---|---|
| `/usr/sbin/nginx` | `httpd_exec_t` | 이 파일을 실행하면 `httpd_t`로 전환 |
| nginx 프로세스 | `httpd_t` | master(root)와 worker(nginx) 모두 같은 domain |
| 웹 루트 | `httpd_sys_content_t` | `httpd_t`가 읽을 수 있는 type |
| 내 셸 | `unconfined_t` | targeted 정책에서 사용자 셸은 거의 제한이 없음 |

domain transition 규칙을 정책에서 직접 찾는다.

```bash
sesearch -T -s init_t -t httpd_exec_t -c process
```

```text
type_transition init_t httpd_exec_t:process httpd_t;
```

## 3. mv는 label을 가져간다

`/root`에서 파일 2개를 만들고 하나는 `mv`, 하나는 `cp`로 웹 루트에 넣는다.

```bash
echo moved > /root/moved.html
echo copied > /root/copied.html
mv /root/moved.html /usr/share/nginx/html/
cp /root/copied.html /usr/share/nginx/html/
ls -Z /usr/share/nginx/html/*.html
```

`mv`한 파일만 `/root`의 label을 유지한다.

```text
unconfined_u:object_r:httpd_sys_content_t:s0 /usr/share/nginx/html/copied.html
unconfined_u:object_r:admin_home_t:s0        /usr/share/nginx/html/moved.html
```

두 파일을 요청한다. DAC 권한은 둘 다 644로 같다.

```bash
for f in copied moved; do curl -s -o /dev/null -w "$f %{http_code}\n" localhost/$f.html; done
```

```text
copied 200
moved 403
```

거부 로그와 원인을 본다.

```bash
ausearch -m AVC -ts recent | audit2why
```

```text
type=AVC ... avc:  denied  { read } for  pid=... comm="nginx" name="moved.html" ...
  scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:admin_home_t:s0 tclass=file permissive=0
	Was caused by:
		Missing type enforcement (TE) allow rule.
```

permissive와 비교한다. 같은 요청이 200이 되고, 로그는 `permissive=1`로 남는다.

```bash
setenforce 0
curl -s -o /dev/null -w "%{http_code}\n" localhost/moved.html
ausearch -m AVC -ts recent | tail -1
setenforce 1
```

- permissive는 "SELinux 때문인지" 확인하는 스위치다. 200이 되면 원인은 SELinux다
- 운영에서 permissive로 둔 채 끝내지 않는다. 경로 규칙대로 label을 되돌린다

```bash
restorecon -v /usr/share/nginx/html/moved.html
curl -s -o /dev/null -w "%{http_code}\n" localhost/moved.html
```

## 4. 비표준 경로는 규칙으로 등록한다

웹 루트를 `/srv/web`으로 옮긴다. 포트 8008은 이미 `http_port_t`라 label 문제만 분리된다.

```bash
mkdir -p /srv/web && echo srv > /srv/web/index.html
cat > /etc/nginx/conf.d/srv.conf <<'EOF'
server {
  listen 8008;
  root /srv/web;
}
EOF
systemctl restart nginx
ls -Z /srv/web/index.html
curl -s -o /dev/null -w "%{http_code}\n" localhost:8008/
```

`/srv` 아래 파일은 `httpd_sys_content_t`가 아니라 403이다.

`chcon`으로 고치면 당장은 200이다.

```bash
chcon -t httpd_sys_content_t /srv/web/index.html
curl -s -o /dev/null -w "%{http_code}\n" localhost:8008/
```

relabel이 한 번 돌면 사라진다. `restorecon`은 경로 규칙 DB를 기준으로 label을 되돌린다.

```bash
restorecon -v /srv/web/index.html
curl -s -o /dev/null -w "%{http_code}\n" localhost:8008/
```

경로 규칙 DB에 등록하고 적용한다. 이후 새로 만드는 파일과 전체 relabel에도 유지된다.

```bash
semanage fcontext -a -t httpd_sys_content_t '/srv/web(/.*)?'
restorecon -Rv /srv/web
curl -s -o /dev/null -w "%{http_code}\n" localhost:8008/
semanage fcontext -l -C
```

## 5. 포트에도 label이 있다

nginx를 8765에서 listen시킨다. 먼저 이 포트에 label이 없는 것을 확인한다.

```bash
semanage port -l | grep -w 8765 || echo "8765: label 없음"
sed -i 's/listen 8008;/listen 8008;\n  listen 8765;/' /etc/nginx/conf.d/srv.conf
nginx -t && systemctl restart nginx
```

`nginx -t`는 문법만 보므로 통과하고, 재시작은 실패한다.

```bash
journalctl -u nginx -n 5 --no-pager | grep bind
ausearch -m AVC -ts recent | grep name_bind
```

```text
nginx: [emerg] bind() to 0.0.0.0:8765 failed (13: Permission denied)
avc:  denied  { name_bind } for  pid=... comm="nginx" src=8765 scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:unreserved_port_t:s0 tclass=tcp_socket permissive=0
```

- nginx master는 root다. root인데도 `Permission denied`면 SELinux를 먼저 의심한다
- 포트에 `http_port_t`를 붙인다

```bash
semanage port -a -t http_port_t -p tcp 8765
systemctl restart nginx
curl -s -o /dev/null -w "%{http_code}\n" localhost:8765/
```

## 6. boolean은 정책이 준비해 둔 스위치다

nginx를 reverse proxy로 쓴다. backend는 9999번의 Python 서버다.

```bash
python3 -m http.server 9999 --bind 127.0.0.1 --directory /srv/web >/dev/null 2>&1 &
cat > /etc/nginx/conf.d/proxy.conf <<'EOF'
server {
  listen 8009;
  location / {
    proxy_pass http://127.0.0.1:9999;
  }
}
EOF
systemctl restart nginx
curl -s -o /dev/null -w "%{http_code}\n" localhost:8009/
```

502다. nginx가 backend로 연결하지 못했다.

```bash
ausearch -m AVC -ts recent | grep name_connect | audit2why
getsebool httpd_can_network_connect
```

- `audit2why`가 `Was caused by: The boolean httpd_can_network_connect was set incorrectly.`로 boolean을 지목한다
- 웹 서버가 임의 포트로 나가는 연결은 기본으로 꺼 둔 기능이다. 웹 서버가 탈취됐을 때 내부망 스캔을 막으려는 기본값이다

켜고 다시 요청한다. `-P`는 재부팅 후에도 유지한다.

```bash
setsebool -P httpd_can_network_connect on
curl -s -o /dev/null -w "%{http_code}\n" localhost:8009/
```

## 7. 이번 실습에서 쓴 수단 정리

| 증상 | AVC 권한 | 원인 | 수단 |
|---|---|---|---|
| mv한 파일 403 | `read` | label이 원래 위치의 것 | `restorecon` |
| 새 경로 403 | `read` | 경로 규칙 없음 | `semanage fcontext` + `restorecon` |
| 기동 실패 bind 13 | `name_bind` | 포트 label 없음 | `semanage port` |
| proxy 502 | `name_connect` | boolean off | `setsebool -P` |

- 4가지 모두 `audit2allow`로 모듈을 만들지 않고 끝났다
- `audit2allow -M`은 위 수단으로 안 될 때만 쓴다. 로그를 그대로 allow로 바꾸면 막아야 할 접근까지 열린다

## 8. Bottlerocket으로 가져갈 것

- Bottlerocket에는 `semanage`, `setsebool`이 없다. 정책은 이미지에 고정돼 있고 바꿀 수 없다
- 그래서 조정 대상은 정책이 아니라 컨테이너가 받는 label이다. [7-bottlerocket.md](7-bottlerocket.md)에서 이어서 본다

## 정리

EC2를 지우면 끝난다. [4-setup-ec2.md](4-setup-ec2.md)의 down을 실행한다.
