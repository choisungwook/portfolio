from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_apscheduler import APScheduler
from flask_migrate import Migrate

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///db.sqlite3'

scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()

# db 초기화
db = SQLAlchemy()
db.init_app(app)
migrate = Migrate(app, db)

@app.route("/")
def main():
    return "hello world"

@scheduler.task("interval", id="do_job_1", seconds=5, misfire_grace_time=900)
def job1():
    """Sample job 1."""
    print("Job 1 executed")