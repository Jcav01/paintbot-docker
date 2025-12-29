FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies from monorepo
COPY package-lock.json ./
COPY package.json ./
COPY youtube/package.json ./youtube/

RUN npm ci --workspace=youtube --omit=dev

# Bundle app source
COPY ./src .

EXPOSE 8005
CMD [ "node", "youtube.js" ]