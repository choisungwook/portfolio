# -*- coding: utf-8 -*-
from db.db import db

class ServiceProject(db.Model):
    '''
        서비스 입장에서는 프로트이지만 Gialb group을 관리
    '''
    __tablename__  = 'service_project'

    id = db.Column(db.Integer, primary_key=True)
    user_project_id = db.relationship('UserProjectMappingEntity', backref='service_project', lazy=True)
    project_id = db.Column(db.Integer, nullable=False) # gitlab group_id
    project_name = db.Column(db.String(300), nullable=False) #gitlab gorup_name
    weburl = db.Column(db.String(200), nullable=False) # gitlab group web_url
    app_id = db.relationship('ServiceApp', backref='service_project', lazy=True)

    def __init__(self, project_id, weburl, project_name):
        self.project_id = project_id
        self.weburl = weburl
        self.project_name = project_name

    def add_app(self, app_id):
        self.app_id = app_id

class UserProjectMappingEntity(db.Model):
    __tablename__  = 'userprojectmapping'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('service_project.id'), nullable=False)

    def __init__(self, flaskuser_id, project_id):
        self.user_id = flaskuser_id
        self.project_id = project_id

class ServiceApp(db.Model):
    '''
        서비스 애플리케이션
            애플리케이션을 생성하면 gitlab project가 fork된다.
    '''
    
    __tablename__ = 'service_app'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer)
    project_name = db.Column(db.String(200), nullable=False)
    weburl = db.Column(db.String(200), nullable=False)
    user_app_id = db.relationship('UserAppMappingEntity', backref='service_app', lazy=True)
    group_id = db.Column(db.Integer, db.ForeignKey('service_project.id'))

    def __init__(self, project_id, weburl, project_name, group_id=None):
        self.project_id = project_id
        self.project_name = project_name
        self.weburl = weburl
        self.group_id = group_id

    def add_group(self, group_id):
        self.group_id = group_id

class UserAppMappingEntity(db.Model):
    '''
        flask user 테이블과 service_app 테이블 다대다 매핑
    '''
    __tablename__  = 'userappmapping'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    app_id = db.Column(db.Integer, db.ForeignKey('service_app.id'), nullable=False)
    
    def __init__(self, flaskuser_id, app_id):
        self.user_id = flaskuser_id
        self.app_id = app_id
