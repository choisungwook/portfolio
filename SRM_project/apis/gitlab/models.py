# -*- coding: utf-8 -*-
from db.db import db

class GitlabProject(db.Model):
    '''
        Gialb project를 관리
    '''
    __table__name = 'gitlab_project'

    id = db.Column(db.Integer, primary_key=True)
    user_project_id = db.relationship('UserGitlabMappingEntity', backref='gitlab_project', lazy=True)
    project_id = db.Column(db.Integer, nullable=False)
    weburl = db.Column(db.String(200), nullable=False)

    def __init__(self, project_id, weburl):
        self.project_id = project_id
        self.weburl = weburl

class UserGitlabMappingEntity(db.Model):
    __table__name = 'userprojectmapping'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('gitlab_project.id'), nullable=False)

    def __init__(self, flaskuser_id, gitlabproject_id):
        self.user_id = flaskuser_id
        self.project_id = gitlabproject_id
