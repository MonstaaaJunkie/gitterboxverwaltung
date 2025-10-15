FROM node:20-alpine

# Systemabhängigkeiten für native Module (bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./

# npm Cache aufräumen nach Installation
RUN npm install --omit=dev && npm cache clean --force

COPY . .

EXPOSE 5001

CMD ["node", "server.js"]
