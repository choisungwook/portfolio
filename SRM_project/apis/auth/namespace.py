# -*- coding: utf-8 -*-
from flask.helpers import make_response
from flask.templating import render_template
from flask_restx import Namespace, Resource, fields
from logger.log import log
from apis import api

ns = api.namespace('auth', version="1.0", description='login and authentication')

# swagger 입출력
model = api.model('auth', {
    'id': fields.String(required=True, description='example1'),
    'name': fields.String(required=True, description='example2'),
})

@ns.route('/healthcheck')
class method_name(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        body = 'this is auth api'
        log.debug(body)
        return body

@ns.route('/login')
class login(Resource):
    @ns.doc(response={200: "success"})
    def get(self):
        return make_response(render_template('signup.html'))