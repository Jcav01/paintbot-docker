FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install build dependencies for native modules (pg)
RUN apk add --no-cache python3 make g++

# Install app dependencies from monorepo
COPY package-lock.json package.json ./
COPY database/package.json ./database/

RUN npm ci --workspace=database --omit=dev

# Remove build dependencies to keep image size small
RUN apk del python3 make g++

# Bundle app source (copy contents to root)
COPY database/src/ .

EXPOSE 3000
CMD [ "node", "index.js" ]