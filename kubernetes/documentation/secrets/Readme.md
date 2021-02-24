# 1. 개요
* mysql 인증정보를 secret으로 관리
* volume으로 secret mount

# 2. mysql docker image 환경변수
* MYSQL_ROOT_PASSWORD
* MYSQL_DATABASE
* MYSQL_USER
* MYSQL_PASSWORD

# 3. kubernetes에서 mysql 환경변수를 secret으로 관리
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mysql-secret
data:
  mysql-root-password: base64인코딩 값
  mysql-database: base64인코딩 값
  mysql-user: base64인코딩 값
  mysql-password: base64인코딩 값
```

# 4. kubernetes deployment에서 secret 참조
```yaml
containers:
- name: mysql
  image: nginx:1.14.2
  ports:
  - containerPort: 3306
  env:
  - name: MYSQL_ROOT_PASSWORD
    valueFrom:
      secretKeyRef:
        name: mysql-secret
        key: mysql-root-password
  - name: MYSQL_DATABASE
    valueFrom:
      secretKeyRef:
        name: mysql-secret
        key: mysql-database
  - name: MYSQL_USER
    valueFrom:
      secretKeyRef:
        name: mysql-secret
        key: mysql-user
  - name: MYSQL_PASSWORD
    valueFrom:
      secretKeyRef:
        name: mysql-secret
        key: mysql-password
```

# 5. 실행 방법
```sh
$ cd resources
$ kubectl apply -f .
```
# 6. 참고자료
* [1] 공식문서 secret: https://kubernetes.io/docs/concepts/configuration/secret/
* [2] mysql 공식 docker hub: https://hub.docker.com/_/mysql