# -*- coding: utf-8 -*-
from abc import *
import requests
import json
from urllib.parse import urljoin

from requests.api import head
from logger.log import log
from pathlib import Path
import os
from apis.auth.models import User
from config.gitlab_config import get_GitlabAccessToken, get_GitlabInitPassword, get_gitlabURI

class AbstractGitlab(metaclass=ABCMeta):
    '''
        gitlab서비스클래스 추상화
    '''

    # gitlab API를 사용하기 위한 accesstoekn 설정
    accesstoken = get_GitlabAccessToken() # this is for sample
    gitlabURI = get_gitlabURI()
    initpassword = get_GitlabInitPassword()
    
    @abstractmethod
    def createGroup(self, createGroupRequestDto):
        '''
            그룹 생성
        '''
        pass

    @abstractmethod
    def getUsers(self):
        '''
            gitlab 계정목록 조회
        '''
        pass

class GitlabImpl(AbstractGitlab):
    def __init__(self):
        pass

    def createGroup(self, post_data):
        '''
            post_data: CreateGroupRequestDto class.__dict__
        '''

        URI = urljoin(self.gitlabURI, "groups")
        headers = {"Authorization": "Bearer {}".format(self.accesstoken)}

        result = {
            'status': False,
            'data': ''
        }

        try:
            
            api_response = requests.post(URI, headers=headers, data=post_data)
            result['status'] = api_response.ok

            if not result['status']:
                log.debug('[Error 311] gitlab 그룹 생성 실패')
            else:
                log.debug("[OK] 그룹생성 성공")
                result['data'] = api_response.json()
                result['status'] = True

        except Exception as e:
            log.error("[Error 310] gitlab 그룹생성 실패: {}".format(e))
        
        return result

    def existUser(self, email):
        '''
            flask user가 존재하는지 확인
        '''
        log.debug("---------------------")
        log.debug(email)
        return User.query.filter_by(email=email).first()

    def existGitlabUser(self):
        '''
            gitlab User가 존재하는지 확인
        '''
        pass
    
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
            log.error('[Error 300] 계정목록 조회실패: {}'.format(e))

        return response
