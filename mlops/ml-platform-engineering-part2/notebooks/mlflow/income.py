"""Lab 1 노트북이 같이 쓰는 데이터 로딩과 S3 업로드 함수."""
import io
import os
from urllib.parse import urlparse

import boto3
import pandas as pd

# 책 4장의 income_data.csv는 UCI Adult adult.data에서 범주형 컬럼 8개만 남기고 '?' 행을 지운 것이다.
UCI_URL = "https://archive.ics.uci.edu/ml/machine-learning-databases/adult/adult.data"
UCI_COLUMNS = [
    "age", "Workclass", "fnlwgt", "Education", "education-num", "Marital-Status",
    "Occupation", "Relationship", "Race", "Sex", "capital-gain", "capital-loss",
    "hours-per-week", "Native_country", "Target",
]
CATEGORICAL = [
    "Workclass", "Education", "Marital-Status", "Occupation",
    "Relationship", "Race", "Sex", "Native_country",
]


def load_income_data(cache: str = "income_data.csv") -> pd.DataFrame:
    """책과 같은 30,162행 데이터셋을 만든다. 값 앞의 공백도 책 데이터와 같게 둔다."""
    if not os.path.exists(cache):
        raw = pd.read_csv(UCI_URL, header=None, names=UCI_COLUMNS)
        df = raw[CATEGORICAL + ["Target"]]
        df = df[~df.apply(lambda col: col.str.strip() == "?").any(axis=1)]
        df.to_csv(cache, index=False)
    return pd.read_csv(cache)


def upload_df(df: pd.DataFrame, bucket: str, key: str) -> str:
    """DataFrame을 CSV로 SeaweedFS에 올리고 s3:// URI를 돌려준다. 주소와 계정은 파드 환경 변수에서 읽는다."""
    boto3.client("s3").put_object(Bucket=bucket, Key=key, Body=df.to_csv(index=False).encode())
    return f"s3://{bucket}/{key}"


def download_df(uri: str) -> pd.DataFrame:
    u = urlparse(uri)
    body = boto3.client("s3").get_object(Bucket=u.netloc, Key=u.path.lstrip("/"))["Body"].read()
    return pd.read_csv(io.BytesIO(body))


if __name__ == "__main__":
    df = load_income_data("/tmp/income_data_check.csv")
    assert len(df) == 30162, len(df)
    assert list(df.columns) == CATEGORICAL + ["Target"]
    assert set(df.Target.str.strip()) == {"<=50K", ">50K"}
    print("ok", len(df))
