# -*- coding: utf-8 -*-
from apis import api
from flask_restx import Resource
from flask.helpers import make_response
from flask.templating import render_template
from .service import GitlabImpl
from logger.log import log

ns = api.namespace('gitlab', version="1.0", description='gitlab controller')

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
    