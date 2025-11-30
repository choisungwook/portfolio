# AWS RDS Aurora MySQL PITR Hands-on

* 이 Terraform 코드는 AWS RDS Aurora MySQL의 PITR(Point-In-Time Recovery) 기능을 실습하기 위한 환경을 구성합니다.

## PITR 관련 변수

### 필수 PITR 설정

1. **backup_retention_period** (기본값: 7일)
   - 자동 백업 보관 기간 (1-35일)
   - **PITR 활성화를 위한 필수 조건**: 0으로 설정 시 자동 백업이 꺼지고 PITR도 불가능해짐
   - 값이 클수록 더 오래된 시점으로 복원 가능

2. **preferred_backup_window** (기본값: "03:00-04:00")
   - 자동 백업이 생성되는 일일 시간대 (UTC)
   - 형식: "hh24:mi-hh24:mi"
   - 최소 30분 이상의 시간 범위 필요

3. **preferred_maintenance_window** (기본값: "mon:04:00-mon:05:00")
   - 시스템 유지보수가 수행될 수 있는 주간 시간대 (UTC)
   - 형식: "ddd:hh24:mi-ddd:hh24:mi"
   - backup_window와 겹치지 않아야 함
