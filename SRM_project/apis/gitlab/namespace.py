# -*- coding: utf-8 -*-
from apis import api
from flask_restx import Resource, Namespace
from flask import request
from flask_login import login_required, current_user
from flask.helpers import make_response
from flask.templating import render_template
from .service import GitlabImpl
from logger.log import log
from .dto.gitlabDTO import CreateGroupRequestDto, CreateGroupResponseDto

ns = Namespace('gitlab', version="1.0", description='gitlab controller')

@ns.route("/healthcheck")
class Index(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        return "This is a gitlab api healthcheck"

@ns.route("/project/create")
class Create(Resource):
    '''
        Gitlab Project 생성
    '''
    @ns.doc(response={200: "success"})
    def get(self):
        return make_response(render_template())
    
    @ns.doc(response={200: "success"})
    def post(self):
        response = ''
        return make_response(render_template())

@ns.route("/user/signup")
class Create(Resource):
    '''
        Gitlab 계정 생성
    '''
    @ns.doc(response={200: "success"})
    def get(self):
        return make_response(render_template())
    
    @ns.doc(response={200: "success"})
    def post(self):
        response = ''
        return make_response(render_template())

@ns.route("/users")
class Create(Resource):
    '''
        Gitlab 계정목록
    '''
    @ns.doc(response={200: "success"})
    def get(self):
        gitlabAPI = GitlabImpl()
        response = gitlabAPI.getUsers()

        response_data = []
        for data in response['data']:
            _dict = {
                'id': data['id'],
                'email': data['email'],
                'stats': data['state']
            }
            response_data.append(_dict)

        log.debug('----------------------')
        log.debug(response_data)
        log.debug('----------------------')
        return make_response(render_template('gitlab/users.html', response_code=response['status'], users=response_data))


@ns.route('/createproject')
class CreateProject(Resource):
    '''
        gitlab 프로젝트 생성
    '''

    @ns.doc(response={200: 'success'})
    @login_required
    def get(self):
        return make_response(render_template('gitlab/createproject.html'))

    @ns.doc(response={200: 'success'})
    @login_required
    def post(self):
        projectname = request.form.get('projectname')
        gitlabAPI = GitlabImpl()
        
        post_data = CreateGroupRequestDto(name=projectname, path=projectname).__dict__
        response = gitlabAPI.createGroup(post_data, current_user.email)

        createGroupResponseDto = CreateGroupResponseDto(group_id=response['data'].get('id'),
        group_url=response['data'].get('web_url'))

        return make_response(render_template('gitlab/createprojcessuccess.html', data=createGroupResponseDto.__dict__))
