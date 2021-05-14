# -*- coding: utf-8 -*-
from db.db import db
from logger.log import log
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

# reference: https://hackersandslackers.com/flask-login-user-authentication/
class User(UserMixin, db.Model):
    __table__name = 'user'

    # 스키마 정의
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), nullable=False)
    email = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(20), nullable=False)
    
    def __init__(self, username, email, password, confirm_password):
        self.username = username
        self.email = email
        self.password = self.encrypt_password(password)
        self.confirm_password = confirm_password

        if not self.check_password(self.confirm_password):
            log.debug('[*] 사용자가 입력한 패스워드가 불일치')
            raise('[*] 사용자가 입력한 패스워드가 불일치')

    def set_password(self, password):
        '''
            비밀번호 재설정
        '''
        self.password = self.encrypt_password(password)

    def encrypt_password(self, password):
        '''
            비밀번호 암호화
        '''
        return generate_password_hash(password=password, method='sha256')

    def check_password(self, password):
        '''
            비밀번호 확인
        '''
        return check_password_hash(self.password, password)

    def __repr__(self):
        return '<User {}>'.format(self.username)