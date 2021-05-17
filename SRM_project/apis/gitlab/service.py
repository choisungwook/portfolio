# -*- coding: utf-8 -*-
from abc import *
import requests
import json
from urllib.parse import urljoin
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
    initpassword = get_GitlabInitPassword()_

    @abstractmethod
    def createUser(self, userCreateDto):
        '''
            gitlab유저 생성
            
            parameter:
                UserCreateDto: 유저생성 DTO
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
    def __init__(self):
        pass

    def createProject(self):
        '''
            프로젝트 생성
        '''
        return super().createProject()

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

    def createUser(self, userCreateDto):
        '''
            gitlab유저 생성
            
            회원가입 조건:
                아래 2조건이 모두 만족해야 회원가입이 성공한다.
                1. flask user 테이블에 등록된 사용자가 없어야 하고
                2. gitlab DB에 등록된 사용자가 없어야 한다.

            parameter:
                UserCreateDto: 유저생성 DTO
        '''

        response = {            
            'status': False,
            'data': []
        }

        try:
            if self.existUser(userCreateDto.email):
                return response

            # URI = urljoin(self.gitlabURI, "users")
            # headers = {"Authorization": "Bearer {}".format(self.accesstoken)}

            # if userCreateDto.password is None:
            #     userCreateDto.password = self.initpassword

            # # data = {
            # #     'email': '',
            # #     'name': '',
            # #     'username': '',
            # #     'password': self.initpassword
                
            # # }
            
            # api_response = requests.post(headers=headers, data=userCreateDto.__dict__)
            # response['status'] = api_response['ok']

            # if not response['status']:
            #     log.debug['[Error 303] gitlab 계정 생성 실패']
            
        except Exception as e:
            log.debug('[Error 302] 회원가입 실패: {}'.format(e))

        return response

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
