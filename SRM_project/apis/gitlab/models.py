# -*- coding: utf-8 -*-
from db.db import db

class ServiceProject(db.Model):
    '''
        서비스 입장에서는 프로트이지만 Gialb group을 관리
    '''
    __tablename__  = 'service_project'

    id = db.Column(db.Integer, primary_key=True)
    user_project_id = db.relationship('UserProjectMappingEntity', backref='service_project', lazy=True)
    project_id = db.Column(db.Integer, nullable=False)
    project_name = db.Column(db.String(300), nullable=False)
    weburl = db.Column(db.String(200), nullable=False)

    def __init__(self, project_id, weburl, project_name):
        self.project_id = project_id
        self.weburl = weburl
        self.project_name = project_name

class UserProjectMappingEntity(db.Model):
    __tablename__  = 'userprojectmapping'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('service_project.id'), nullable=False)

    def __init__(self, flaskuser_id, project_id):
        self.user_id = flaskuser_id
        self.project_id = project_id
