CREATE TABLE zipcode_features (
  zipcode BIGINT,
  city VARCHAR(255),
  state VARCHAR(255),
  location_type VARCHAR(255),
  tax_returns_filed BIGINT,
  population BIGINT,
  total_wages BIGINT,
  event_timestamp timestamp without time zone,
  created_timestamp timestamp without time zone
);

CREATE TABLE credit_history (
  event_timestamp timestamp without time zone,
  dob_ssn VARCHAR(255),
  credit_card_due BIGINT,
  mortgage_due BIGINT,
  student_loan_due BIGINT,
  vehicle_loan_due BIGINT,
  hard_pulls BIGINT,
  missed_payments_2y BIGINT,
  missed_payments_1y BIGINT,
  missed_payments_6m BIGINT,
  bankruptcies BIGINT,
  created_timestamp timestamp without time zone
);

CREATE TABLE loan_table (
  loan_id BIGINT,
  dob_ssn VARCHAR(255),
  zipcode BIGINT,
  person_age BIGINT,
  person_income BIGINT,
  person_home_ownership VARCHAR(255),
  person_emp_length DOUBLE PRECISION,
  loan_intent VARCHAR(255),
  loan_amnt BIGINT,
  loan_int_rate DOUBLE PRECISION,
  loan_status BIGINT,
  event_timestamp timestamp without time zone,
  created_timestamp timestamp without time zone
);


COPY zipcode_features FROM '/data/zipcode_table_sample.csv' DELIMITER ',' CSV HEADER;
COPY credit_history FROM '/data/credit_history_sample.csv' DELIMITER ',' CSV HEADER;
COPY loan_table FROM '/data/loan_table_sample.csv' DELIMITER ',' CSV HEADER;
