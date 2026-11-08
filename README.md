# Tirupati Lab Compare (working title)

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

## Before deploying

The `local` profile is for this machine only. A deployment needs a managed PostgreSQL database (`spring.datasource.*`), its own `APP_JWT_SECRET`, HTTPS, login rate limiting, a way to create admin accounts, and backups.
