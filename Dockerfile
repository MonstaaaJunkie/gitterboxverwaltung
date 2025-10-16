FROM node:20-slim

RUN apt-get update && apt-get install -y nginx python3 make g++ sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend ./backend
WORKDIR /app/backend
RUN npm install && npm cache clean --force

WORKDIR /app
COPY frontend /app/frontend/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 5000
ENV PORT=5000

CMD ["/bin/sh", "-c", "node /app/backend/server.js & nginx -g 'daemon off;'"]
