# -*- coding: utf-8 -*-
import requests
from requests.api import post
from apis.auth.models import User, GitlabUser
from db.db import db
from logger.log import log
from config.gitlab_config import get_gitlabURI, get_GitlabAccessToken, get_GitlabInitPassword
from urllib.parse import urljoin

class FlaskCreateUserService():
    '''
        사용자 생성을 담당하는 class
    '''

    def __init__(self, userCreateDto):
        '''
            flask 유저와 gitlab 유저 생성
            
            parameter:
                UserCreateDto: 유저생성 dto
        '''
        self.email = userCreateDto.email
        self.passwrod = userCreateDto.password
        self.confirm_password = userCreateDto.confirm_password

        # gitlab 설정
        self.gitlabURI = urljoin(get_gitlabURI(), 'users/')
        self.gitlabAccessToken = get_GitlabAccessToken()
        self.InitPassword = get_GitlabInitPassword()

    def CreateFlaskUser(self):
        """
            Flaske 회원가입
            실패: 이미 존재하는 email
        """
        
        result = {
            'status': False,
            'error_msg': '',
            'data': None,
            'new_user': None
        }

        try:
            new_user = User(email=self.email, password=self.passwrod, confirm_password=self.confirm_password)
            db.session.add(new_user)
            db.session.commit()
            result['status'] = True
            result['new_user'] = new_user
        except Exception as e:
            log.error('[Error 104] CreateFlask {} User failed: {}'.format(self.email, e))
            result['error_msg'] = 'Create User is failed. error code: 104'

        return result

    def CreateGitlabUser(self, flask_newuser):
        """
            gitlab 사용자 생성
            실패: 이미 사용자가 gitlab에 가입
        """
        headers = {"Authorization": "Bearer {}".format(self.gitlabAccessToken)}
        post_data = {
            "username": self.email.split("@")[0],
            "name": self.email,
            "email": self.email,
            "password": self.InitPassword,
            "skip_confirmation": True
        }

        result = {
            'status': False,
            'error_msg': '',
            'data': None
        }

        try:
            response = requests.post(self.gitlabURI, headers=headers, data=post_data)
            status_code = response.ok

            result['status'] = response.ok
            result['data'] = response.json()
            
            if status_code:
                log.debug("회원가입 성공: joinedUserInfo: {}".format(result['data']))

                gitlab_newuser = GitlabUser(gitlab_userid=result['data'].get('id'), 
                email=result['data'].get('email'),
                state=result['data'].get('state'),
                flaskuser_id=flask_newuser.id
                )
                db.session.add(gitlab_newuser)
                db.session.commit()
            else:
                log.debug("[Error 103] 사용자가 이미 gitlab에 회원가입했습니다.: joinedUserInfo: {}".format(result['data']))
                result['error_msg'] = 'create user failed. errocde 103'

        except Exception as e:
            log.error('[Error 102] create gitlab user failed:{}'.format(e))
            result['error_msg'] = 'create user failed. errocde 102'

        return result

    # def isExistFlaskUser(self):
    #     '''
    #         Flask 유저가 있는지 확인
    #         deprecated
    #     '''
    #     return User.query.filter_by(email=self.email).first()

    def CreateUser(self):
        '''
            사용자 생성
        '''
        response = self.CreateFlaskUser()
        if response['status']:
            response = self.CreateGitlabUser(response.get('new_user'))

        return response
