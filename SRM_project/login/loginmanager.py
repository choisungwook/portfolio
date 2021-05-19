from flask_login import LoginManager

login_manager = LoginManager()
login_manager.login_view = '/api/v1/auth/signin'
login_manager.login_message = "Please login"