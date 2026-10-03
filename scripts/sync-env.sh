#!/usr/bin/env bash
set -e

# VPS Configuration
VPS_HOST="187.77.70.77"
VPS_USER="root"
VPS_KEY="${HOME}/.ssh/hostinger_vps_key"
REMOTE_DIR="/root/kriptofani"

echo "🔄 [KriptoFani] Lokal .env faylı VPS-ə sinxronizasiya olunur..."

if [ ! -f ".env" ]; then
  echo "❌ XƏTA: Lokal qovluqda .env faylı tapılmadı!"
  exit 1
fi

# Transfer .env to VPS
scp -i "$VPS_KEY" -o StrictHostKeyChecking=no .env "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/.env"

echo "✅ .env faylı uğurla VPS-ə köçürüldü."
echo "🔄 Konteyner yeni mühit dəyişənləri ilə yenidən başladılır..."

# Apply new env inside docker compose
ssh -i "$VPS_KEY" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "cd ${REMOTE_DIR} && docker compose up -d --force-recreate"

echo "🎉 Konteyner uğurla yeniləndi! Status:"
ssh -i "$VPS_KEY" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "docker ps --filter name=kripto-app --format 'ID: {{.ID}} | Ad: {{.Names}} | Status: {{.Status}} | Port: {{.Ports}}'"
