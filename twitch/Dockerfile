FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies from monorepo
COPY package-lock.json package.json ./
COPY twitch/package.json ./twitch/

RUN npm ci --workspace=twitch --omit=dev

# Bundle app source - keep in twitch/ so node_modules resolution works
COPY twitch/src/ ./twitch/

EXPOSE 3000
WORKDIR /usr/src/app/twitch
CMD [ "node", "twitch.js" ]