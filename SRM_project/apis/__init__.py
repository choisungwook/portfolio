from flask import Blueprint
from flask_restx import Api

# reference: https://flask-restplus.readthedocs.io/en/stable/scaling.html#use-with-blueprints
api_v1 = Blueprint('api', __name__, url_prefix="/api/v1")
api = Api(api_v1, version="1,0", title="api version 1")

# import apis
from .auth.namespace import ns as authAPI
from .gitlab.namespace import ns as gitlabAPI
from .index.namespace import ns as defatulIndex

api.add_namespace(authAPI)
api.add_namespace(gitlabAPI)
api.add_namespace(defatulIndex)