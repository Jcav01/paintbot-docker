FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies from monorepo
COPY package-lock.json package.json ./
COPY twitch/package.json ./twitch/

RUN npm ci --workspace=twitch --omit=dev

# Bundle app source (copy contents to root)
COPY twitch/src/ .

EXPOSE 3000
CMD [ "node", "twitch.js" ]