FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies from monorepo
COPY package-lock.json package.json ./
COPY youtube/package.json ./youtube/

RUN npm ci --workspace=youtube --omit=dev

# Run service from workspace directory so Node can resolve workspace-local node_modules
WORKDIR /usr/src/app/youtube

# Bundle app source in the workspace directory
COPY youtube/src/ .

EXPOSE 8005
CMD [ "node", "youtube.js" ]