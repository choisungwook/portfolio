# -*- coding: utf-8 -*-
from db.db import db

class GitlabProject(db.Model):
    '''
        Gialb project를 관리
    '''
    __table__name = 'gitlab_project'

    id = db.Column(db.Integer, primary_key=True)
    user_project_id = db.relationship('UserGitlabMappingEntity', backref='gitlab_project', lazy=True)
    email = db.Column(db.String(50), nullable=False)
    weburl = db.Column(db.String(200), nullable=False)


class UserGitlabMappingEntity(db.Model):
    __table__name = 'userprojectmapping'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('gitlab_project.id'), nullable=False)

