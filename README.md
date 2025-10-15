# Gitterbox-Tracker – Docker/Portainer (HTTP, Port 5000)

Zentrale Web-App mit Login, Barcode-Scan und SQLite:
- Frontend: Nginx (Port 5000)
- Backend: Node.js/Express (intern auf 5001)
- DB: SQLite (persistiert unter `./data/gitterboxen.db`)
- Standardlogin: `admin` / `admin` (bitte nach dem ersten Login ändern)

## Start (Docker Compose)
```bash
docker compose up -d --build
```
Dann im Browser: `http://<server>:5000`

## Portainer
- „Stacks“ → **Add stack**
- Inhalt aus `docker-compose.yml` einfügen oder Repo/ZIP bereitstellen
- Deploy

## Env
- `JWT_SECRET` (optional): Geheimnis für Tokens (Default: gitterbox-secret)
