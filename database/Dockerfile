FROM node:22

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --omit=dev

ENV GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/paintbot-3e5d5b0e2fe3.json

# Bundle app source
COPY ./src .

EXPOSE 3000
CMD [ "node", "index.js" ]