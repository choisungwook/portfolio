from apis import api
from flask_restx import Resource
from flask.helpers import make_response
from flask.templating import render_template

ns = api.namespace('index', version="1.0", description='index controller')

@ns.route("/")
class Index(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        return make_response(render_template('index.html'))
