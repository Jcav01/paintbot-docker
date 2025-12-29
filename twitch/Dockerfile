FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies from monorepo
COPY package-lock.json ./
COPY package.json ./
COPY twitch/package.json ./twitch/

RUN npm ci --workspace=twitch --omit=dev

# Bundle app source
COPY ./src .

EXPOSE 3000
CMD [ "node", "twitch.js" ]