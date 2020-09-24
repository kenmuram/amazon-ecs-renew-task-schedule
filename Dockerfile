FROM node:12

ENV APP_ROOT='/usr/src/amazon-ecs-renew-task-schedule'

WORKDIR $APP_ROOT

ADD package.json $APP_ROOT/package.json
ADD package-lock.json $APP_ROOT/package-lock.json

RUN npm install

COPY . $APP_ROOT
