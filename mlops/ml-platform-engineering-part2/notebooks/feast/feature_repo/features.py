"""income 피처 정의. 사람(person_id)마다 one-hot 인코딩한 피처 90개를 한 FeatureView로 묶는다.

schema를 적지 않아 Feast가 parquet 컬럼에서 피처 목록을 읽는다. 컬럼 90개를 코드에 다시 적지 않으려는 선택이다.
"""
import os
from datetime import timedelta

from feast import Entity, FeatureView, FileSource, ValueType

FEATURES_PATH = "s3://feature-data-sets/income/features.parquet"

person = Entity(name="person", join_keys=["person_id"], value_type=ValueType.INT64)

income_source = FileSource(
  path=FEATURES_PATH,
  timestamp_field="event_timestamp",
  s3_endpoint_override=os.environ["AWS_ENDPOINT_URL"],
)

income_features = FeatureView(
  name="income_features",
  entities=[person],
  ttl=timedelta(days=365),
  source=income_source,
)
