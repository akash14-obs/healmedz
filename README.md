# HealMedz

Live domain (not deployed yet): https://healmedz.com

Patients compare diagnostic tests and prices. Labs submit their details, admins verify them, and only approved data is published.

## Run locally

Double-click `start-local.cmd`, then open http://localhost:8080. PostgreSQL runs inside the backend, so there is nothing else to install.

| Role | Email | Password |
|---|---|---|
| Admin | admin@local.test | localdemo-123 |
| Demo lab | lab-a@local.test | localdemo-123 |

All demo labs and prices are invented.

After changing code, rebuild the part you changed and restart:

- Frontend: `npx ng build` in `web/`
- Backend: `mvn -DskipTests package` in `backend/`

With more free memory, `npx ng serve` in `web/` gives live reload on port 4200.

To reset the local data, stop the app and delete `backend/.local-data/postgres`.

## Layout

- `backend/`: Spring Boot API, grouped into `publicapi`, `auth`, `provider`, `admin`
- `backend/src/main/resources/db/migration/`: the database schema
- `web/`: Angular app

## How the trust model works

Prices, service facts and lab profiles are stored in append-only `*_version` tables. A change adds a new `PENDING` row, and patients see only the latest `APPROVED` row in effect today. Database triggers reject any edit to a reviewed row, any change to submitted values, and any delete.

## Deploying

The server runs the `demo` profile: fictional data with a visible banner, and random secrets created on the server in `/etc/healmedz/app.env`.

1. Create an Ubuntu 24.04 server with a static IP, and open ports 80 and 443 in its firewall.
2. Build the app: `npx ng build` in `web/`, then `mvn -DskipTests package` in `backend/`.
3. From Git Bash, run `deploy/deploy.sh <server-ip> <path-to-key.pem>`.
4. Point the `A` records for `healmedz.com` and `www` at the server. Caddy then gets the HTTPS certificate by itself.

Repeat steps 2 and 3 for each update. Database backups run daily and stay on the server, so also turn on automatic server snapshots.

Before showing real data, replace the `demo` profile and the seeded accounts with a proper way to create admins, and remove `X-Robots-Tag` from `deploy/Caddyfile`.
