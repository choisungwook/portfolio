from flask import Blueprint
from flask_restx import Api

# reference: https://flask-restplus.readthedocs.io/en/stable/scaling.html#use-with-blueprints
api_v1 = Blueprint('api', __name__, url_prefix="/api/v1")
api = Api(api_v1, version="1,0", title="api version 1")

from . import (
    index,
    auth
)
