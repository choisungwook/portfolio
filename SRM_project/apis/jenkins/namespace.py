from flask_restx import Resource, Namespace
from logger.log import log
from .service import JenkinsTriggerJob
from werkzeug.utils import redirect

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

        jenkinstriggerjob = JenkinsTriggerJob(jenkins_folder, jenkins_job, jenkins_jobid)
        consoleurl = jenkinstriggerjob.get_consoleurl()
        if consoleurl:
            response = jenkinstriggerjob.trigger_job()
            if response:
                # (original jenkins console log시 사용) 젠킨스 잡 로그 url이 나올때까지 무한대기
                # blueocean은 미사용
                # while not jenkinstriggerjob.conoleurl_is_exist(consoleurl):
                #     pass
                return redirect(consoleurl)
        
        return "get console url failed"
