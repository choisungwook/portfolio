# 기존 PostgreSQL 계정 IAM 인증 전환 가이드

기존 비밀번호 인증을 사용하는 PostgreSQL 계정을 IAM 인증으로 전환하는 가이드입니다.

## 주의사항

- PostgreSQL에서 `rds_iam` 역할을 부여하면 **비밀번호 인증이 비활성화**됨
- 전환 전 IAM 정책이 준비되어 있어야 함
- 애플리케이션 코드 변경 필요

## 전환 전 확인사항

### 1. 현재 계정 역할 확인

```sql
SELECT r.rolname, m.member::regrole
FROM pg_auth_members m
JOIN pg_roles r ON m.roleid = r.oid
WHERE m.member::regrole::text = 'exist_user';
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
export PGHOST="<Aurora PostgreSQL Endpoint>"
export PGUSER="postgres"
export PGPASSWORD="<master password>"
export PGDATABASE="demo"
export EXIST_USER="exist_user"
```

### 스크립트 실행

```bash
chmod +x migrate_postgres.sh
./migrate_postgres.sh
```

## 수동 실행

### 1. PostgreSQL 접속

```bash
psql -h $PGHOST -U $PGUSER -d $PGDATABASE
```

### 2. rds_iam 역할 부여

```sql
GRANT rds_iam TO exist_user;
```

### 3. 변경 확인

```sql
SELECT r.rolname, m.member::regrole
FROM pg_auth_members m
JOIN pg_roles r ON m.roleid = r.oid
WHERE r.rolname = 'rds_iam';
```

결과:

```
 rolname  |   member
----------+------------
 rds_iam  | exist_user
```

## 롤백 방법

IAM 인증에서 다시 비밀번호 인증으로 되돌리려면:

```sql
REVOKE rds_iam FROM exist_user;
ALTER USER exist_user WITH PASSWORD 'new_password';
```

## 전환 후 연결 테스트

```bash
TOKEN=$(aws rds generate-db-auth-token \
  --hostname $PGHOST \
  --port 5432 \
  --region ap-northeast-2 \
  --username exist_user)

PGSSLMODE=verify-full \
PGSSLROOTCERT=ap-northeast-2-bundle.pem \
psql "host=$PGHOST port=5432 dbname=demo user=exist_user password=$TOKEN"
```

## MySQL과의 차이점

| 항목 | MySQL | PostgreSQL |
|------|-------|------------|
| 전환 방법 | `ALTER USER ... IDENTIFIED WITH` | `GRANT rds_iam TO user` |
| 비밀번호 인증 | 즉시 비활성화 | 즉시 비활성화 |
| 롤백 | `ALTER USER ... IDENTIFIED BY` | `REVOKE rds_iam FROM user` |
