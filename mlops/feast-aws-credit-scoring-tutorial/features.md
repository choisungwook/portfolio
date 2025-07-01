# Feast Feature Store 구성요소 가이드

## 🏗️ Feast 아키텍처 개요

Feast는 3가지 핵심 구성요소로 이루어져 있습니다:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   🗂️ Registry    │    │ 💾 Offline Store │    │ ⚡ Online Store  │
│   (메타데이터)     │    │   (학습용)        │    │   (실시간 예측)   │
│                 │    │                 │    │                 │
│ • Entity 정의    │    │ • PostgreSQL    │    │ • DynamoDB      │
│ • FeatureView   │    │ • 과거 데이터      │    │ • 캐시된 Feature │
│ • 스키마 정보      │    │ • Training 용    │    │ • Serving 용     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  🤖 ML Model    │
                    │                 │
                    │ • Training      │
                    │ • Prediction    │
                    └─────────────────┘
```

## 📁 1. Registry (메타데이터 저장소)

### **역할:**
- Feature 정의 정보 저장
- Entity, FeatureView 스키마 관리
- 버전 관리 및 설정 정보

### **현재 설정:**
```yaml
# feature_store.yaml
registry: registry.db  # 로컬 파일
```

### **저장되는 정보:**
```python
# features.py에서 정의한 내용들이 registry에 저장됨
zipcode = Entity(name="zipcode", value_type=ValueType.INT64)
zipcode_features = FeatureView(
    name="zipcode_features",
    entities=[zipcode],
    schema=[Field(name="city", dtype=String), ...]
)
```

### **CLI 명령어:**
```bash
# Registry 정보 확인
feast entities list
feast feature-views list
feast feature-services list

# Registry 상태 확인
feast registry-dump
```

## 💾 2. Offline Store (PostgreSQL)

### **역할:**
- 대용량 과거 데이터 저장
- Model Training 시 Feature 제공
- Point-in-time correctness 보장

### **현재 설정:**
```yaml
# feature_store.yaml
offline_store:
    type: postgres
    host: localhost
    port: 5432
    database: feast
    user: feast
    password: password
```

### **사용 시점:**
```python
# 🎓 Training 시에만 사용
def get_training_features(self, loans):
    # Offline Store에서 과거 데이터 조회
    training_df = self.fs.get_historical_features(
        entity_df=loans,
        features=self.feast_features
    ).to_df()
```

### **데이터 구조:**
```sql
-- PostgreSQL 테이블들
CREATE TABLE zipcode_features (
    zipcode BIGINT,
    city VARCHAR(255),
    state VARCHAR(255),
    population BIGINT,
    event_timestamp timestamp,
    created_timestamp timestamp
);

CREATE TABLE credit_history (
    dob_ssn VARCHAR(255),
    credit_card_due BIGINT,
    mortgage_due BIGINT,
    event_timestamp timestamp,
    created_timestamp timestamp
);
```

### **CLI 명령어:**
```bash
# Offline Store 데이터 확인
feast materialize-incremental $(date -u +"%Y-%m-%dT%H:%M:%S")

# 특정 기간 데이터 조회 (Python 필요)
python -c "
from feast import FeatureStore
import pandas as pd
fs = FeatureStore(repo_path='feature_repo')
features = fs.get_historical_features(
    entity_df=pd.DataFrame({'zipcode': [76104]}),
    features=['zipcode_features:city']
)
print(features.to_df())
"
```

## ⚡ 3. Online Store (DynamoDB)

### **역할:**
- 실시간 Feature 서빙
- 빠른 조회 성능 (1-5ms)
- 예측/추론 시 사용

### **현재 설정:**
```yaml
# feature_store.yaml
online_store:
    type: dynamodb
    region: ap-northeast-2
```

### **생성되는 테이블:**
```
DynamoDB 테이블:
├── credit_scoring_aws.zipcode_features
└── credit_scoring_aws.credit_history
```

### **사용 시점:**
```python
# 🔮 Prediction 시에만 사용
def _get_online_features_from_feast(self, request):
    # Online Store에서 실시간 조회
    return self.fs.get_online_features(
        entity_rows=[{"zipcode": zipcode, "dob_ssn": dob_ssn}],
        features=self.feast_features,
    ).to_dict()
```

### **데이터 구조:**
```json
// DynamoDB 레코드 예시
{
    "entity_id": "zipcode=76104",
    "features": {
        "city": "FORT_WORTH",
        "state": "TX",
        "population": 50000,
        "tax_returns_filed": 25000
    },
    "event_ts": "2023-12-01T12:00:00Z"
}
```

### **CLI 명령어:**
```bash
# Online Store 상태 확인
aws dynamodb list-tables --region ap-northeast-2

# 특정 테이블 스캔
aws dynamodb scan \
    --table-name "credit_scoring_aws.zipcode_features" \
    --region ap-northeast-2 \
    --max-items 5

# Online Store에 데이터 적재 (Materialize)
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S")
feast materialize-incremental $CURRENT_TIME
```

## 🔄 데이터 흐름

### **Training 흐름:**
```
1. 📊 Raw Data (PostgreSQL)
   ↓
2. 🎓 get_historical_features()
   ↓
3. 🧠 Model Training
   ↓
4. 💾 model.bin 저장
```

### **Serving 흐름:**
```
1. 📥 사용자 요청 (zipcode, dob_ssn)
   ↓
2. ⚡ get_online_features() → DynamoDB 조회
   ↓
3. 🔗 요청 데이터 + Feature Store 데이터 결합
   ↓
4. 🤖 Model Prediction
   ↓
5. 📤 결과 반환
```

### **Materialize 흐름:**
```
1. 💾 PostgreSQL (Offline Store)
   ↓
2. 📊 feast materialize-incremental
   ↓
3. ⚡ DynamoDB (Online Store)
```

## 🛠️ 실습 명령어 모음

### **기본 설정 및 확인:**
```bash
# 현재 디렉토리에서 feature store 설정
cd feature_repo

# Registry 내용 확인
feast entities list
feast feature-views list

# 설정 파일 검증
feast plan
```

### **데이터 적재:**
```bash
# Feature Store 배포
feast apply

# Offline → Online 데이터 동기화
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S")
feast materialize-incremental $CURRENT_TIME

# 특정 기간 데이터 적재
feast materialize \
    --start-ts 2023-01-01T00:00:00 \
    --end-ts 2023-12-31T23:59:59
```

### **데이터 조회:**
```bash
# AWS DynamoDB 확인
aws dynamodb list-tables --region ap-northeast-2

# PostgreSQL 직접 접속 (Docker 컨테이너 내)
docker exec -it postgres_container psql -U feast -d feast
\dt  # 테이블 목록
SELECT * FROM zipcode_features LIMIT 5;
```

### **디버깅:**
```bash
# Feast 버전 확인
feast version

# 설정 파일 검증
feast validate

# 에러 로그 확인 (verbose 모드)
feast apply --verbose

# Registry 내용 덤프
feast registry-dump > registry_backup.json
```

## 🎯 핵심 포인트

1. **Registry**: Feature 메타데이터의 중앙 저장소
2. **Offline Store**: Training을 위한 대용량 과거 데이터
3. **Online Store**: 실시간 서빙을 위한 고속 캐시
4. **Materialize**: Offline → Online 데이터 동기화 프로세스

이 3가지 구성요소가 조화롭게 작동하여 **Training-Serving Skew를 방지**하고 **실시간 Feature 서빙**을 가능하게 합니다! 🚀
