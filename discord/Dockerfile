FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies from monorepo
COPY package-lock.json package.json ./
COPY discord/package.json ./discord/

RUN npm ci --workspace=discord --omit=dev

# Bundle app source
COPY discord/src ./src

CMD [ "node", "index.js" ]