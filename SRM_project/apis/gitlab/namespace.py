from apis import api
from flask_restx import Resource
from flask.helpers import make_response
from flask.templating import render_template

ns = api.namespace('gitlab', version="1.0", description='gitlab controller')

@ns.route("/healthcheck")
class Index(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        return "This is a gitlab api healthcheck"
