#!/usr/bin/env bash
# Pull the latest code and (re)start E-REF on this EC2 instance.
# Run by GitHub Actions over SSH on every push to main, and once by ec2-user-data.sh at first boot.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/E-ref}"
cd "$REPO_DIR"

git fetch --quiet origin main
git reset --hard origin/main

# Public HTTPS name for this instance: 3.0.12.34 -> 3-0-12-34.sslip.io (no DNS purchase needed).
TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
export EREF_DOMAIN="${EREF_DOMAIN:-${PUBLIC_IP//./-}.sslip.io}"

# Optional SMTP settings live outside git.
[ -f "$HOME/eref.env" ] && set -a && . "$HOME/eref.env" && set +a

cd deploy
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

echo "Waiting for the API to load its models..."
for i in $(seq 1 60); do
  if curl -fsS "https://$EREF_DOMAIN/health" >/dev/null 2>&1; then
    echo "E-REF is live at https://$EREF_DOMAIN  (web console: https://$EREF_DOMAIN/web/)"
    exit 0
  fi
  sleep 5
done
echo "API did not answer on https://$EREF_DOMAIN/health within 5 minutes" >&2
docker compose logs --tail=50 api >&2
exit 1
