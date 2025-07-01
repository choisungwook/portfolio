from datetime import timedelta
from feast import (
    Entity,
    FeatureView,
    Field
)
from feast.types import String, Int64, ValueType
from feast.infra.offline_stores.contrib.postgres_offline_store.postgres_source import (
    PostgreSQLSource,
)

zipcode = Entity(name="zipcode", value_type=ValueType.INT64)

zipcode_source = PostgreSQLSource(
    name="zipcode_features",
    query="SELECT * FROM zipcode_features",
    timestamp_field="event_timestamp",
    created_timestamp_column="created_timestamp",
)

zipcode_features = FeatureView(
    name="zipcode_features",
    entities=[zipcode],
    ttl=timedelta(days=3650),
    schema=[
        Field(name="city", dtype=String),
        Field(name="state", dtype=String),
        Field(name="location_type", dtype=String),
        Field(name="tax_returns_filed", dtype=Int64),
        Field(name="population", dtype=Int64),
        Field(name="total_wages", dtype=Int64),
    ],
    source=zipcode_source,
)

dob_ssn = Entity(
    name="dob_ssn",
    value_type=ValueType.STRING,
    description="Date of birth and last four digits of social security number",
)

credit_history_source = PostgreSQLSource(
    name="credit_history",
    query="SELECT * FROM credit_history",
    timestamp_field="event_timestamp",
    created_timestamp_column="created_timestamp",
)

credit_history = FeatureView(
    name="credit_history",
    entities=[dob_ssn],
    ttl=timedelta(days=90),
    schema=[
        Field(name="credit_card_due", dtype=Int64),
        Field(name="mortgage_due", dtype=Int64),
        Field(name="student_loan_due", dtype=Int64),
        Field(name="vehicle_loan_due", dtype=Int64),
        Field(name="hard_pulls", dtype=Int64),
        Field(name="missed_payments_2y", dtype=Int64),
        Field(name="missed_payments_1y", dtype=Int64),
        Field(name="missed_payments_6m", dtype=Int64),
        Field(name="bankruptcies", dtype=Int64),
    ],
    source=credit_history_source,
)
