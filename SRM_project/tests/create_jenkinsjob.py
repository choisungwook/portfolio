import chevron
import requests
import uuid

class JenkinsCreateJob:
    '''
        젠킨스 잡 생성
    '''

    def __init__(self, job_name, folder_name, git_repo_url):
        self.jenkins_accesstoken = "testotken"
        self.jenkins_accesstoken = "1192f220a80306dbe4a07fe4d9d133dc2f"
        self.host = "https://choilab.com/jenkins1"
        self.admin = "admin"

        self.job_name = job_name
        self.folder_name = folder_name
        self.git_repo_url = git_repo_url

    def createJobWithFolder(self):
        '''
            폴더 안에 젠킨스 잡 생성
        '''
        result = {
            "status": False,
            "data": None
        }

        if not self.folder_name:
            print("[Error 317] pelase Input folder node")
            return result

        try:
            post_data = ""
            token = self.create_randomtoken()
            request_url = "{}/job/{}/createItem?name={}".format(
                self.host,
                self.folder_name,
                self.job_name
            )
            headers = {"Content-Type": "text/xml"}
            auth = (self.admin, self.jenkins_accesstoken)

            with open("test.xml", "r", encoding="utf-8") as f:
                post_data = chevron.render(f.readline(), {
                    "gitrepo": self.git_repo_url,
                    "barnch": "master", # gitlab default
                    "trigger_token": token # token for remote trigger jenkins job
                })
            
            print("post_data: {}".format(post_data))
            print("request_url: {}".format(request_url))
            api_response = requests.post(request_url, auth=auth, data=post_data, headers=headers)

            if api_response.ok:
                result['status'] = True
                print("create jenkins job success")
            else:
                print("create jenkins failed: {}".format(api_response.json()))
        except Exception as e:
            print("[318] failed to create jenkins job: {}".format(e))

        return result
    
    def create_randomtoken(self):
        '''
        랜덤 UUID 생성
        '''
        return uuid.uuid4().__str__().replace("-", "")

jenkinsjob = JenkinsCreateJob(
    job_name="test",
    folder_name="today6-1-1",
    git_repo_url="https://gitlab.choilab.com/today6-1-1/aaaa.git"
)

jenkinsjob.createJobWithFolder()