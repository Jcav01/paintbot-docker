FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install build dependencies for native modules (pg)
RUN apk add --no-cache python3 make g++

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm ci --omit=dev

# Remove build dependencies to keep image size small
RUN apk del python3 make g++

# Bundle app source
COPY ./src .

EXPOSE 3000
CMD [ "node", "index.js" ]