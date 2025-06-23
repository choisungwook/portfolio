import joblib
import pandas as pd
from credit_model import CreditScoringModel

# Load the model
try:
    classifier = joblib.load('model.bin')
    print('Model loaded successfully')
    if hasattr(classifier, 'n_features_in_'):
        print('Model expects', classifier.n_features_in_, 'features')
    if hasattr(classifier, 'feature_names_in_'):
        print('Model feature names:', classifier.feature_names_in_)
except:
    print('Model file not found or could not be loaded')

# Check what the training process actually uses
model = CreditScoringModel()
print('Target column name:', model.target)
print('Categorical features:', model.categorical_features)
