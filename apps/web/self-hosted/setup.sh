#!/usr/bin/env bash
set -euo pipefail

# ── AgentCenter Self-Hosted Setup Script ─────────────────────────
# Creates .env with generated secrets and starts the containers.
# Run: bash setup.sh

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()  { echo -e "${GREEN}[+]${RESET} $1"; }
warn()  { echo -e "${YELLOW}[!]${RESET} $1"; }
error() { echo -e "${RED}[x]${RESET} $1"; exit 1; }

# ── Preflight checks ────────────────────────────────────────────
echo -e "\n${BOLD}AgentCenter — Self-Hosted Setup${RESET}\n"

command -v docker >/dev/null 2>&1 || error "Docker is not installed. Install it first: https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is required. Update Docker: https://docs.docker.com/compose/install/"

info "Docker $(docker --version | grep -oP '[\d.]+'| head -1) detected"
info "Docker Compose $(docker compose version --short) detected"

# ── Check required files ─────────────────────────────────────────
if [ ! -f "docker-compose.yml" ]; then
  error "docker-compose.yml not found in current directory. Run this script from the agentcenter directory."
fi

if [ ! -f ".env.example" ]; then
  error ".env.example not found in current directory."
fi

# ── Generate .env ────────────────────────────────────────────────
if [ -f ".env" ]; then
  warn ".env already exists. Skipping secret generation."
  warn "Delete .env and re-run this script to regenerate secrets."
else
  info "Generating secrets..."

  PG_PASS=$(openssl rand -hex 16)
  REDIS_PASS=$(openssl rand -hex 16)
  AUTH_SECRET=$(openssl rand -hex 32)
  CRON_SECRET=$(openssl rand -hex 32)

  cp .env.example .env

  # Cross-platform sed (macOS + Linux)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^PG_PASS=.*|PG_PASS=${PG_PASS}|" .env
    sed -i '' "s|^REDIS_PASS=.*|REDIS_PASS=${REDIS_PASS}|" .env
    sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" .env
    sed -i '' "s|^CRON_SECRET=.*|CRON_SECRET=${CRON_SECRET}|" .env
  else
    sed -i "s|^PG_PASS=.*|PG_PASS=${PG_PASS}|" .env
    sed -i "s|^REDIS_PASS=.*|REDIS_PASS=${REDIS_PASS}|" .env
    sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" .env
    sed -i "s|^CRON_SECRET=.*|CRON_SECRET=${CRON_SECRET}|" .env
  fi

  info "Secrets generated and saved to .env"

  # Lock down .env permissions
  chmod 600 .env
  info ".env permissions set to 600 (owner read/write only)"
fi

# ── Ask for PUBLIC_URL ───────────────────────────────────────────
echo ""
read -rp "Enter your public URL (press Enter for http://localhost:3000): " PUBLIC_URL
PUBLIC_URL="${PUBLIC_URL:-http://localhost:3000}"

if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|^PUBLIC_URL=.*|PUBLIC_URL=${PUBLIC_URL}|" .env
else
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=${PUBLIC_URL}|" .env
fi

info "PUBLIC_URL set to ${PUBLIC_URL}"

# ── Production mode with Traefik ─────────────────────────────────
USE_TRAEFIK=false
if [ -f "docker-compose.prod.yml" ] && [[ "$PUBLIC_URL" == https://* ]]; then
  echo ""
  read -rp "Set up automatic HTTPS with Traefik? (y/N): " SETUP_TRAEFIK
  if [[ "$SETUP_TRAEFIK" =~ ^[Yy]$ ]]; then
    USE_TRAEFIK=true

    # Extract domain from PUBLIC_URL
    DOMAIN=$(echo "$PUBLIC_URL" | sed 's|https://||' | sed 's|/.*||')

    read -rp "Email for Let's Encrypt certificates: " ACME_EMAIL
    if [ -z "$ACME_EMAIL" ]; then
      error "Email is required for Let's Encrypt."
    fi

    # Add DOMAIN and ACME_EMAIL to .env
    if ! grep -q "^DOMAIN=" .env; then
      echo "" >> .env
      echo "# ── Production HTTPS (Traefik) ────────────────────────────────" >> .env
      echo "DOMAIN=${DOMAIN}" >> .env
      echo "ACME_EMAIL=${ACME_EMAIL}" >> .env
    else
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
        sed -i '' "s|^ACME_EMAIL=.*|ACME_EMAIL=${ACME_EMAIL}|" .env
      else
        sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
        sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=${ACME_EMAIL}|" .env
      fi
    fi

    info "Traefik will handle HTTPS for ${DOMAIN}"
  fi
fi

# ── Start containers ─────────────────────────────────────────────
echo ""
info "Pulling Docker images..."

if [ "$USE_TRAEFIK" = true ]; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
  info "Starting containers with Traefik..."
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
else
  docker compose pull
  info "Starting containers..."
  docker compose up -d
fi

# ── Wait for health checks ───────────────────────────────────────
info "Waiting for services to be healthy..."
sleep 5

RETRIES=0
MAX_RETRIES=30
while [ $RETRIES -lt $MAX_RETRIES ]; do
  if docker compose ps | grep -q "healthy"; then
    break
  fi
  RETRIES=$((RETRIES + 1))
  sleep 2
done

# ── Done ─────────────────────────────────────────────────────────
echo ""
docker compose ps
echo ""

if [ "$USE_TRAEFIK" = true ]; then
  info "AgentCenter is running at ${BOLD}${PUBLIC_URL}${RESET}"
  info "HTTPS certificates will be provisioned automatically by Traefik."
else
  info "AgentCenter is running at ${BOLD}${PUBLIC_URL}${RESET}"
fi

echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo "  1. Open ${PUBLIC_URL} in your browser"
echo "  2. Activate your license"
echo "  3. Create your admin account"
echo ""
echo -e "Logs:     ${YELLOW}docker compose logs -f app${RESET}"
echo -e "Stop:     ${YELLOW}docker compose down${RESET}"
echo -e "Upgrade:  ${YELLOW}docker compose pull && docker compose up -d${RESET}"
echo ""
