import yaml
import logging.config
import logging

with open('logger/config.yaml', 'r') as f:
    config = yaml.safe_load(f)

# reference: https://stackoverflow.com/questions/49012123/python3-logging-yaml-configuration
logging.config.dictConfig(config)
log = logging.getLogger('simple')

# example
# log.debug("do you see me?")