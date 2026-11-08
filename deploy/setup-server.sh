#!/usr/bin/env bash
# Installs or updates HealMedz on Ubuntu 24.04. Run as root from the unpacked release folder.
# Safe to run again: secrets and the database are created once and then kept.
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE=/etc/healmedz/app.env

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q openjdk-17-jre-headless postgresql caddy curl

# Oracle Cloud's Ubuntu images block web traffic in iptables as well as in the cloud firewall.
if command -v netfilter-persistent >/dev/null 2>&1; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
      || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  done
  netfilter-persistent save
fi

id healmedz >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin healmedz
install -d -o healmedz -g healmedz /opt/healmedz
install -d -m 755 /var/www/healmedz /etc/healmedz

if [ ! -f "$ENV_FILE" ]; then
  DB_PASSWORD="$(openssl rand -hex 32)"
  install -m 600 /dev/null "$ENV_FILE"
  cat > "$ENV_FILE" <<EOF
SPRING_PROFILES_ACTIVE=demo
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5432/healmedz
SPRING_DATASOURCE_USERNAME=healmedz
SPRING_DATASOURCE_PASSWORD=$DB_PASSWORD
APP_JWT_SECRET=$(openssl rand -hex 48)
APP_DEMO_PASSWORD=$(openssl rand -hex 12)
EOF
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "CREATE ROLE healmedz LOGIN PASSWORD '$DB_PASSWORD'"
  sudo -u postgres createdb -O healmedz healmedz
fi

install -o healmedz -g healmedz -m 644 "$RELEASE_DIR/app.jar" /opt/healmedz/app.jar
find /var/www/healmedz -mindepth 1 -delete
cp -r "$RELEASE_DIR/web/." /var/www/healmedz/
chmod -R a+rX /var/www/healmedz
install -m 644 "$RELEASE_DIR/Caddyfile" /etc/caddy/Caddyfile

cat > /etc/systemd/system/healmedz.service <<'EOF'
[Unit]
Description=HealMedz API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=healmedz
EnvironmentFile=/etc/healmedz/app.env
ExecStart=/usr/bin/java -Xmx512m -jar /opt/healmedz/app.jar
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/cron.daily/healmedz-backup <<'EOF'
#!/bin/sh
# Keeps 14 days of database backups on this server.
set -e
install -d -m 700 /var/backups/healmedz
sudo -u postgres pg_dump healmedz | gzip > "/var/backups/healmedz/healmedz-$(date +%F).sql.gz"
find /var/backups/healmedz -name '*.sql.gz' -mtime +14 -delete
EOF
chmod 755 /etc/cron.daily/healmedz-backup

systemctl daemon-reload
systemctl enable --quiet healmedz caddy
systemctl restart healmedz
systemctl reload-or-restart caddy

for _ in $(seq 1 60); do
  if curl -fs http://127.0.0.1:8080/api/public/meta >/dev/null; then
    echo "HealMedz is running."
    exit 0
  fi
  sleep 2
done

echo "HealMedz did not start. Recent log:" >&2
journalctl -u healmedz -n 40 --no-pager >&2
exit 1
