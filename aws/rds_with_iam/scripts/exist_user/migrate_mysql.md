# 기존 MySQL 계정 IAM 인증 전환 가이드

기존 비밀번호 인증을 사용하는 MySQL 계정을 IAM 인증으로 전환하는 가이드입니다.

## 주의사항

- 전환 후 기존 비밀번호로는 로그인 불가
- 전환 전 IAM 정책이 준비되어 있어야 함
- 애플리케이션 코드 변경 필요

## 전환 전 확인사항

### 1. 현재 계정 인증 방식 확인

```sql
SELECT user, host, plugin FROM mysql.user WHERE user = 'exist_user';
```

결과 예시 (비밀번호 인증):

```
+------------+------+-----------------------+
| user       | host | plugin                |
+------------+------+-----------------------+
| exist_user | %    | caching_sha2_password |
+------------+------+-----------------------+
```

### 2. IAM 정책 확인

EC2/ECS/Lambda에 아래 정책이 있는지 확인:

```json
{
  "Effect": "Allow",
  "Action": "rds-db:connect",
  "Resource": "arn:aws:rds-db:ap-northeast-2:ACCOUNT_ID:dbuser:CLUSTER_RESOURCE_ID/exist_user"
}
```

## 스크립트 실행

### 환경 변수 설정

```bash
export MYSQL_HOST="<Aurora MySQL Endpoint>"
export MYSQL_USER="postgres"
export MYSQL_PASSWORD="<master password>"
export EXIST_USER="exist_user"
```

### 스크립트 실행

```bash
chmod +x migrate_mysql.sh
./migrate_mysql.sh
```

## 수동 실행

### 1. MySQL 접속

```bash
mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD
```

### 2. 인증 방식 변경

```sql
ALTER USER 'exist_user'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
ALTER USER 'exist_user'@'%' REQUIRE SSL;
FLUSH PRIVILEGES;
```

### 3. 변경 확인

```sql
SELECT user, host, plugin FROM mysql.user WHERE user = 'exist_user';
```

결과 (IAM 인증):

```
+------------+------+---------------------------+
| user       | host | plugin                    |
+------------+------+---------------------------+
| exist_user | %    | AWSAuthenticationPlugin   |
+------------+------+---------------------------+
```

## 롤백 방법

IAM 인증에서 다시 비밀번호 인증으로 되돌리려면:

```sql
ALTER USER 'exist_user'@'%' IDENTIFIED BY 'new_password';
FLUSH PRIVILEGES;
```

## 전환 후 연결 테스트

```bash
TOKEN=$(aws rds generate-db-auth-token \
  --hostname $MYSQL_HOST \
  --port 3306 \
  --region ap-northeast-2 \
  --username exist_user)

mysql -h $MYSQL_HOST \
  --user=exist_user \
  --password="$TOKEN" \
  --enable-cleartext-plugin
```
