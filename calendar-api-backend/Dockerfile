FROM node:21.7.3

WORKDIR /usr/src/app

COPY package*.json ./

RUN rm -rf node_modules

RUN npm install --omit=dev

COPY --chown=:.:. . .

EXPOSE 3001

CMD ["npm", "run", "start"]