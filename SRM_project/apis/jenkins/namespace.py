from flask_restx import Resource, Namespace
from requests.models import Response
from logger.log import log
from .service import JenkinsTriggerJob

ns = Namespace('jenkins', version="1.0", description='jenkins controller')

@ns.route("/healthcheck")
class Index(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        return "This is a jenknis health check api"

@ns.route("/triggerjob/<string:job_path>")
class Triggerjob(Resource):
    @ns.doc(response={200: "success"})
    def get(self, job_path):
        jenkins_folder, jenkins_job, jenkins_jobid = job_path.split("and")

        log.debug(f"{jenkins_folder} {jenkins_job} {jenkins_jobid}")
        jenkinstriggerjob = JenkinsTriggerJob(jenkins_folder, jenkins_job, jenkins_jobid)
        response = jenkinstriggerjob.trigger_job()
        if response:
            return "job trigger success"
        return "job trigger failed"
