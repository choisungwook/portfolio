from flask_restx import Resource, Namespace

ns = Namespace('jenkins', version="1.0", description='jenkins controller')

@ns.route("/healthcheck")
class Index(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        return "This is a jenknis health check api"
