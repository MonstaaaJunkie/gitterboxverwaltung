FROM node:20-slim

RUN apt-get update && apt-get install -y nginx python3 make g++ sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Backend installieren ---
COPY backend/package*.json ./backend/
WORKDIR /app/backend
# erzwingt Kompilation und bewahrt node_modules
RUN npm install --build-from-source sqlite3 && npm cache clean --force
RUN npm install uuid && npm install --omit=dev && npm cache clean --force


WORKDIR /app
COPY backend ./backend
COPY frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 5000
ENV PORT=5000

CMD ["/bin/sh", "-c", "node /app/backend/server.js & nginx -g 'daemon off;'"]
