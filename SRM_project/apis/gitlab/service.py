# -*- coding: utf-8 -*-
from abc import *
import requests
import json
from urllib.parse import urljoin

from requests.api import head
from logger.log import log
from pathlib import Path
import os

class AbstractGitlab(metaclass=ABCMeta):
    '''
        gitlab서비스클래스 추상화
    '''

    # gitlab API를 사용하기 위한 accesstoekn 설정
    accesstoken = "gZVSzZMgzMnzkkKiwj3T" # this is for sample
    gitlabDomain = "https://gitlab.choilab.com" # this is for sample
    gitlabAPIVersion = "/api/v4/"
    gitlabURI = urljoin(gitlabDomain, gitlabAPIVersion)

    @abstractmethod
    def createUser(self):
        '''
            gitlab유저 생성
        '''
        pass
    
    @abstractmethod
    def createProject(self):
        '''
            프로젝트 생성
        '''
        pass

    @abstractmethod
    def getUsers(self):
        '''
            gitlab 계정목록 조회
        '''
        pass

class GitlabImpl(AbstractGitlab):
    def createProject(self):
        '''
            프로젝트 생성
        '''
        return super().createProject()

    def createUser(self):
        '''
            gitlab유저 생성
        '''
        data = {

        }

        return super().createUser()

    def getUsers(self):
        '''
            gitlab 계정목록 조회
        '''
        
        response = {
            'status': False,
            'data': []
        }

        try:
            URI = urljoin(self.gitlabURI, "users")
            headers = {"Authorization": "Bearer {}".format(self.accesstoken)}
            api_response = requests.get(URI, headers=headers)
            
            response['status'] = api_response.ok

            if not response['status']:
                log.debug('[Error 301] 계정목록 조회실패. 응답코드: {}'.format(response['status']))
            else:
                log.debug("[OK] 계정목록 조회 성공")
                response['data'] = api_response.json()

        except Exception as e:
            log.debug('[Error 300] 계정목록 조회실패: {}'.format(e))

        return response
