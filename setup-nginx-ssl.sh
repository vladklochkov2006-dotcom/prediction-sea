#!/usr/bin/env bash
set -euo pipefail

# ============== HOVERWARS NGINX + SSL SETUP (PRODUCTION) ==============
# Domain: hoverwars.xyz
# Frontend: Static build served by nginx
# Game server port: 8976

DOMAIN="${DOMAIN:-hoverwars.xyz}"
EMAIL="${EMAIL:-egor4042007@gmail.com}"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root: sudo bash setup-nginx-ssl.sh"
  exit 1
fi

echo "=== HoverWars PRODUCTION Deployment ==="
echo "Domain:  $DOMAIN"
echo "Email:   $EMAIL"
echo "Project: $PROJECT_DIR"
echo "Mode:    PRODUCTION (static build)"
echo "======================================="

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Project directory not found: $PROJECT_DIR"
  exit 1
fi

# Install Nginx, Certbot and Node.js (Debian/Ubuntu)
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx curl gnupg lsb-release ca-certificates

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Allow firewall
if command -v ufw >/dev/null 2>&1; then
  ufw allow 'Nginx Full' || true
  ufw allow OpenSSH || true
  ufw allow 8976 || true
fi

# Create web root directory
WEB_ROOT="/var/www/$DOMAIN"
mkdir -p "$WEB_ROOT"

# Nginx site config - STATIC FILES + GAME SERVER PROXY
cat >/etc/nginx/sites-available/$DOMAIN <<'EOF'
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

# Game WebSocket server
upstream hoverwars_game {
  server 127.0.0.1:8976;
}

server {
  listen 80;
  server_name DOMAIN_PLACEHOLDER;

  # Cross-origin isolation for SharedArrayBuffer in WASM/Workers
  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header Cross-Origin-Embedder-Policy "require-corp" always;

  location /.well-known/acme-challenge/ {
    root /var/www/html;
  }

  # Frontend - STATIC FILES
  location / {
    root WEB_ROOT_PLACEHOLDER;
    index index.html;
    try_files $uri $uri/ /index.html;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
  }

  # Static assets with caching
  location /assets/ {
    root WEB_ROOT_PLACEHOLDER;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  # Socket.io game server
  location /socket.io/ {
    proxy_pass http://hoverwars_game;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
  }

  # Proxy Linera faucet via local path
  location /faucet/ {
    proxy_pass https://faucet.testnet-conway.linera.net/;
    proxy_http_version 1.1;
    proxy_set_header Host faucet.testnet-conway.linera.net;
    proxy_ssl_server_name on;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Generic Linera RPC dynamic proxy: /linera-rpc/{proto}/{host}/{path}
  location ~ ^/linera-rpc/(?<proto>https|http)/(?<dest>[^/]+)/(?<path>.*)$ {
    if ($request_method = OPTIONS) {
      add_header Access-Control-Allow-Origin *;
      add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
      add_header Access-Control-Allow-Headers 'Content-Type, Authorization, X-Requested-With';
      return 204;
    }
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    proxy_pass $proto://$dest/$path$is_args$args;
    proxy_set_header Host $dest;
    proxy_ssl_server_name on;
    proxy_buffering off;
    proxy_http_version 1.1;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Origin $http_origin;
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
    add_header Access-Control-Allow-Headers 'Content-Type, Authorization, X-Requested-With';
    add_header Access-Control-Expose-Headers 'grpc-status,grpc-message,grpc-status-details-bin';
  }
}
EOF

# Replace placeholders
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN
sed -i "s|WEB_ROOT_PLACEHOLDER|$WEB_ROOT|g" /etc/nginx/sites-available/$DOMAIN

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
rm -f /etc/nginx/sites-enabled/default || true
nginx -t
systemctl reload nginx

# Issue and configure SSL cert
certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --redirect --non-interactive || true

# ============== BUILD FRONTEND ==============
echo "Building frontend..."
cd "$PROJECT_DIR"
npm ci

# Build for production
npm run build

# Deploy built files to web root
echo "Deploying to $WEB_ROOT..."
rm -rf "$WEB_ROOT"/*
cp -r "$PROJECT_DIR/dist/"* "$WEB_ROOT/"

# Set proper permissions
chown -R www-data:www-data "$WEB_ROOT"
chmod -R 755 "$WEB_ROOT"

# ============== GAME SERVER SERVICE ==============
RUN_USER="${SUDO_USER:-$(whoami)}"

# Install server dependencies
cd "$PROJECT_DIR/server"
npm ci --omit=dev

cat >/etc/systemd/system/hoverwars-game.service <<SERVICE
[Unit]
Description=HoverWars Game Server (Socket.io)
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$PROJECT_DIR/server
Environment="PORT=8976"
Environment="HOST=0.0.0.0"
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now hoverwars-game.service

# Final nginx reload after certbot changes
nginx -t && systemctl reload nginx

echo ""
echo "=== HoverWars PRODUCTION Deployment Complete! ==="
echo ""
echo "Frontend: https://$DOMAIN/ (static files from $WEB_ROOT)"
echo "Game Server: wss://$DOMAIN/socket.io/"
echo ""
echo "Services:"
echo "  systemctl status hoverwars-game"
echo ""
echo "To redeploy frontend:"
echo "  cd $PROJECT_DIR && npm run build && cp -r dist/* $WEB_ROOT/"
echo ""
echo "To restart game server:"
echo "  systemctl restart hoverwars-game"
echo "================================================"
