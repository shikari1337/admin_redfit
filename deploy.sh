#!/bin/bash

# Admin Panel Deployment Script
# This script builds and deploys the admin panel to the production server

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (adjust these as needed)
DEPLOY_PATH="/var/www/admin"
SSH_USER="root"
SSH_HOST="your-server-ip"
BRANCH="main"

echo -e "${GREEN}🚀 Starting Admin Panel Deployment...${NC}"

# Check if we're in the admin directory
if [ ! -f "package.json" ] || [ ! -f "vite.config.ts" ]; then
    echo -e "${RED}❌ Error: Must be run from the admin directory${NC}"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found${NC}"
    echo "Creating .env from example..."
    cat > .env << EOF
VITE_API_SERVER_URL=https://api.redfit.in
VITE_API_VERSION=v1
EOF
    echo -e "${YELLOW}⚠️  Please update .env with your actual API URL${NC}"
fi

# Pull latest changes
echo -e "${GREEN}📥 Pulling latest changes from git...${NC}"
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

# Install dependencies
echo -e "${GREEN}📦 Installing dependencies...${NC}"
npm ci

# Build for production
echo -e "${GREEN}🔨 Building for production...${NC}"
npm run build

# Verify build
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build failed: dist folder not found${NC}"
    exit 1
fi

if [ ! -f "dist/index.html" ]; then
    echo -e "${RED}❌ Build failed: dist/index.html not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed successfully${NC}"
echo -e "${GREEN}📊 Build size:${NC}"
du -sh dist/

# Ask for confirmation before deploying
echo -e "${YELLOW}⚠️  Ready to deploy to server${NC}"
echo -e "   SSH: ${SSH_USER}@${SSH_HOST}"
echo -e "   Path: ${DEPLOY_PATH}"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
fi

# Deploy to server
echo -e "${GREEN}🚀 Deploying to server...${NC}"

# Create deployment directory if it doesn't exist (with sudo)
ssh ${SSH_USER}@${SSH_HOST} "sudo mkdir -p ${DEPLOY_PATH}/dist && sudo chown -R ${SSH_USER}:www-data ${DEPLOY_PATH}"

# Sync files to server
rsync -avz --delete \
    --exclude='.env' \
    --exclude='.well-known/' \
    --exclude='node_modules/' \
    dist/ ${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/dist/

# Set correct permissions
ssh ${SSH_USER}@${SSH_HOST} "sudo chown -R www-data:www-data ${DEPLOY_PATH}/dist && sudo chmod -R 755 ${DEPLOY_PATH}/dist"

# Copy .env if it exists locally (optional)
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file found. Copy it manually to server if needed.${NC}"
    echo "   Run: scp .env ${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/.env"
fi

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Admin panel should be available at your configured domain${NC}"

# Optionally reload nginx
read -p "Reload Nginx? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ssh ${SSH_USER}@${SSH_HOST} "sudo systemctl reload nginx"
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
fi

