FROM node:12

ENV APP_ROOT='/usr/src/amazon-ecs-renew-task-schedule'

WORKDIR $APP_ROOT

COPY package*.json $APP_ROOT/

RUN npm install

COPY . $APP_ROOT
