import sys
from credit_model import CreditScoringModel
import warnings


# Suppress specific deprecation warnings from botocore
warnings.filterwarnings("ignore", message="datetime.datetime.utcnow()", category=DeprecationWarning)

model = CreditScoringModel()
if not model.is_model_trained():
    sys.exit("Model is not trained. Please run the training script first.")

# Make online prediction (using DynamoDB for retrieving online features)
loan_request = {
    "zipcode": [76104],
    "dob_ssn": ["19630621_4278"],
    "person_age": [133],
    "person_income": [59000],
    "person_home_ownership": ["RENT"],
    "person_emp_length": [123.0],
    "loan_intent": ["PERSONAL"],
    "loan_amnt": [35000],
    "loan_int_rate": [16.02],
}

result = model.predict(loan_request)

if result == 0:
    print("Loan approved!")
elif result == 1:
    print("Loan rejected!")
