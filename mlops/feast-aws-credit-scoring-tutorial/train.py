import pandas as pd

from credit_model import CreditScoringModel

# Get historic loan data
loans = pd.read_parquet("data/loan_table.parquet")

# Create model
model = CreditScoringModel()

# Train model (using Redshift for zipcode and credit history features)
if not model.is_model_trained():
    print("[info] Training model with historic loan data...")
    print("[info] Train successful.")
    model.train(loans)
else:
    print("[info] model file is already exist. Skipping training...")

print("[info] Done")
