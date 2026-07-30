#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./deploy/install.sh user@host
# Copies burmalda to /opt/holyvk-burmalda and installs systemd unit.

REMOTE="${1:?user@host}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ssh "$REMOTE" 'sudo mkdir -p /opt/holyvk-burmalda && sudo chown "$USER":"$USER" /opt/holyvk-burmalda'
rsync -az --delete \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '.env' \
  "$ROOT/" "$REMOTE:/opt/holyvk-burmalda/"

ssh "$REMOTE" bash -s <<'EOF'
set -euo pipefail
cd /opt/holyvk-burmalda
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env — edit HOLYVK_MASTER_SECRET and JOURNAL_API_KEY"
fi
sudo cp deploy/holyvk-burmalda.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now holyvk-burmalda
sudo systemctl status holyvk-burmalda --no-pager
EOF

echo "Then: nginx + certbot for your domain, put proxyBase/masterSecret into holyvk-config.js"
