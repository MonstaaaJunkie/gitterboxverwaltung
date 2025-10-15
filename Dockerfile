# --- Build Stage ---
FROM node:20-alpine

# install nginx
RUN apk add --no-cache nginx python3 make g++

# setup app structure
WORKDIR /app

# copy backend
COPY backend ./backend
WORKDIR /app/backend
RUN npm install --omit=dev && npm cache clean --force
WORKDIR /app

# copy frontend
COPY frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# expose port
EXPOSE 5000
ENV PORT=5000

# start both backend and nginx
CMD ["/bin/sh", "-c", "node /app/backend/server.js & nginx -g 'daemon off;'"]
