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
from apis.auth.service import get_userByEmail
from config.gitlab_config import get_GitlabAccessToken, get_GitlabInitPassword, get_gitlabURI
from .models import GitlabProject, UserGitlabMappingEntity
from db.db import db

class AbstractGitlab(metaclass=ABCMeta):
    '''
        gitlab서비스클래스 추상화
    '''

    # gitlab API를 사용하기 위한 accesstoekn 설정
    accesstoken = get_GitlabAccessToken() # this is for sample
    gitlabURI = get_gitlabURI()
    initpassword = get_GitlabInitPassword()
    
    @abstractmethod
    def createGroup(self, post_data, requsetuser_information):
        '''
            그룹 생성
            파라미터:
                post_data: CreateGroupRequestDto class.__dict__
                requsetuser_information: 프로젝트 생성 요청자의 이메일
        '''
        pass

    @abstractmethod
    def getUsers(self):
        '''
            gitlab 계정목록 조회
        '''
        pass

    def addMembersToGroup(self, group_id, user_id):
        '''
            Group 멤버 추가
            파라미터:
                group_id: gitlab group ID
                user_id: gitlab user_id
        '''    
        pass

class GitlabImpl(AbstractGitlab):
    def __init__(self):
        pass

    def createGroup(self, post_data, requsetuser_information):
        '''
            그룹생성
            파라미터:
                post_data: CreateGroupRequestDto class.__dict__
                requsetuser_information: 프로젝트 생성 요청자의 이메일
        '''

        URI = urljoin(self.gitlabURI, "groups")
        headers = {"Authorization": "Bearer {}".format(self.accesstoken)}

        response = {
            'status': False,
            'data': ''
        }

        try:
            
            api_response = requests.post(URI, headers=headers, data=post_data)
            response['status'] = api_response.ok

            if not response['status']:
                log.error('[Error 311] gitlab 그룹 생성 실패')
            else:
                log.debug("[debug 001] {} 그룹생성 성공".format(post_data['name']))
                response['data'] = api_response.json()
                response['status'] = True

            # db 등록
            login_user = get_userByEmail(requsetuser_information)
            gitlabproject = GitlabProject(response['data']['id'], response['data']['web_url'])
            db.session.add(gitlabproject)
            db.session.commit()

            user_project_mapping = UserGitlabMappingEntity(flaskuser_id=login_user.id, gitlabproject_id=gitlabproject.id)
            db.session.add(user_project_mapping)
            db.session.commit()

            

            log.info("그룹{} DB 등록 성공".format(post_data['name']))

        except Exception as e:
            log.error("[Error 310] gitlab 그룹생성 실패: {}".format(e))
        
        return response

    def addMembersToGroup(self, group_id, user_id):
        '''
            Group 멤버 추가
            파라미터:
                group_id: gitlab group ID
                user_id: gitlab user_id
        '''
        try:
            pass
        except Exception as e:
            log.error("[Erorr 312] gitlab Group에 계정추가 실패 :{}".format(e))


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
