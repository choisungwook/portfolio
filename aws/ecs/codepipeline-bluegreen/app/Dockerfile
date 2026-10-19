FROM public.ecr.aws/nginx/nginx:alpine

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
ENV APP_MESSAGE=hello
ENV APP_HEALTH_STATUS=200

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/index.html
