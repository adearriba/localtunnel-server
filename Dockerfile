FROM node:21-bookworm-slim

WORKDIR /app

COPY package.json /app/
COPY yarn.lock /app/

RUN yarn install --production && yarn cache clean

COPY . /app

EXPOSE 80  

ENV NODE_ENV production
#ENTRYPOINT ["node", "-r", "esm", "/app/bin/server"]
ENTRYPOINT ["node", "./bin/server.js"]