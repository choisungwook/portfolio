# -*- coding: utf-8 -*-
from flask import request
from flask.helpers import make_response
from flask.templating import render_template
from flask_restx import Resource, fields
from logger.log import log
# -*- coding: utf-8 -*-
from apis import api
from .models import User
from login.loginmanager import login_manager
from db.db import db

ns = api.namespace('auth', version="1.0", description='login and authentication')

# swagger 입출력
model = api.model('auth', {
    'id': fields.String(required=True, description='example1'),
    'name': fields.String(required=True, description='example2'),
})

@login_manager.user_loader
def load_user(user_id):
    log.debug('[*] user login: {}'.format(user_id))
    return User.query.get(int(user_id))

@ns.route('/healthcheck')
class method_name(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        body = 'this is auth api'
        log.debug(body)
        return body

@ns.route('/signup')
class login(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        return make_response(render_template('signup.html'))

    '''
        todo: form 유효값 검사
    '''
    @ns.doc(response={200: "success"})
    def post(self):
        username = request.form.get('username')        
        email = request.form.get('email')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        if User.query.filter_by(email=email).first():
            return "email alreay is exist. Please input another email"
        
        try:
            new_user = User(username, email, password, confirm_password)
            return_body = "signup is success"
            db.session.add(new_user)
            db.session.commit()
        except Exception as e:
            return_body = "signup is failed"
        
        return return_body
