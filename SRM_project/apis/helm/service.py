# -*- coding: utf-8 -*-
from logger.log import log
import chevron
from git.repo.base import Repo
import shutil
import os
import stat
from config.gitlab_config import get_GitlabAccessToken, get_GitlabInitPassword, get_gitlabURI, get_default_memberexpires_data
import time

def readonly_handler(func, path, execinfo):
    '''
        git 프로젝트 삭제 에러 핸들링
    '''
    os.chmod(path, stat.S_IWRITE)
    func(path)

class ConfigureHelmProject:
    '''
        helm gitlab 프로젝트 생성
        애플리케이션 생성 과정에서 helm 호출
    '''

    def __init__(self, helm_repo_url, application_name, cpu, memory, port, image_version=1):
        self.helm_repo_url = helm_repo_url
        self.image_name = application_name
        self.helm_localpath = application_name
        self.imgae_version = image_version
        self.port = port
        self.helm_values_path = os.path.join(self.helm_localpath, 'values.yaml')
        self.cpu = cpu
        self.memory = memory
        self.timeout = 5
    
    def first_configure(self):
        '''
            helm fork이후 첫 번째 설정
                values.yaml수정
        '''
        # wait fork helm project done
        time.sleep(5)

        try:
            # 1. delete local helm project if exists
            self.delete_local_helmproject()

            # 2. clone
            log.debug("hel_repo_url: {}, helm_localpath:{}".format(self.helm_repo_url, self.helm_localpath))
            repo = Repo.clone_from(self.helm_repo_url, self.helm_localpath)
            log.debug("git clone done")

            # 3. change valeus.yaml
            with open(self.helm_values_path, 'r') as f:
                changed = chevron.render(f, 
                    {
                        "IMAGENAME": self.image_name,
                        "IMAGETAG": self.imgae_version,
                        "PORT": self.port,
                        "CPU": self.cpu,
                        "MEMORY": self.memory
                    }
                )

            log.debug("change values.yaml done")
            with open(self.helm_values_path, 'w') as f:
                f.write(changed)

            # 4. add, commit and push
            repo.index.add(['values.yaml'])
            repo.index.commit("init values.yaml")
            log.debug("{} helm add and commit done".format(self.helm_localpath ))

            repo.git.push()
            log.debug("{} helm push done".format(self.helm_localpath ))

            # 5. delete local helm project
            # self.delete_local_helmproject()
            
        except Exception as e:
            log.error("[318] configure helm values: {}".format(e))
            # gitlab project 생성대기
            raise("[318] configure helm values: {}".format(e))
            
    def delete_local_helmproject(self):
        '''
            helm local프로젝트 삭제
        '''
        if os.path.exists(self.helm_localpath):
            #reference: https://programmersought.com/article/97605598037/
            shutil.rmtree(self.helm_localpath, onerror=readonly_handler)
