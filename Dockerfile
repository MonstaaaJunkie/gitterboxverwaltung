# --- Build Backend ---
FROM node:20-alpine AS backend
WORKDIR /app/backend
COPY backend/package.json .
RUN apk add --no-cache python3 make g++ \
 && npm install --omit=dev && npm cache clean --force
COPY backend .
RUN echo "Backend build complete"

# --- Build Frontend ---
FROM nginx:1.27-alpine AS frontend
WORKDIR /usr/share/nginx/html
COPY frontend .
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=backend /app/backend /app/backend

EXPOSE 5000
ENV PORT=5000
CMD ["sh", "-c", "node /app/backend/server.js & nginx -g 'daemon off;'"]
