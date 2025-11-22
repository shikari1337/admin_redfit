#!/bin/bash

# Comprehensive Server Fix Script
# Fixes nginx configurations, SSL certificates, and server issues
# Run this script on your server as root: sudo bash FIX_ALL_SERVER_ISSUES.sh

set -e

echo "🔧 Starting comprehensive server fix..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root (use sudo)${NC}"
    exit 1
fi

# Step 1: Backup current nginx configs
echo -e "${GREEN}📦 Step 1: Backing up nginx configurations...${NC}"
mkdir -p /root/nginx-backup-$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
cp -r /etc/nginx/sites-available/* "$BACKUP_DIR/" 2>/dev/null || true
cp -r /etc/nginx/sites-enabled/* "$BACKUP_DIR/" 2>/dev/null || true
echo -e "${GREEN}✅ Backup created at: $BACKUP_DIR${NC}"
echo ""

# Step 2: List current nginx sites
echo -e "${GREEN}📋 Step 2: Current nginx sites:${NC}"
ls -la /etc/nginx/sites-enabled/
echo ""

# Step 3: Fix su.growcord.in SSL certificate issue
echo -e "${GREEN}🔐 Step 3: Fixing SSL certificate for su.growcord.in...${NC}"
if [ -f "/etc/nginx/sites-available/su.growcord.in" ]; then
    # Check if certificate paths are correct
    if grep -q "admin.redfit.in" /etc/nginx/sites-available/su.growcord.in; then
        echo -e "${YELLOW}⚠️  Found wrong certificate paths in su.growcord.in config${NC}"
        sed -i 's|admin\.redfit\.in|su.growcord.in|g' /etc/nginx/sites-available/su.growcord.in
        echo -e "${GREEN}✅ Fixed certificate paths${NC}"
    fi
    
    # Ensure server_name is correct
    if ! grep -q "server_name su.growcord.in" /etc/nginx/sites-available/su.growcord.in; then
        echo -e "${YELLOW}⚠️  Fixing server_name in su.growcord.in config${NC}"
        sed -i 's/server_name.*/server_name su.growcord.in;/g' /etc/nginx/sites-available/su.growcord.in
        echo -e "${GREEN}✅ Fixed server_name${NC}"
    fi
    
    # Ensure SSL certificate paths are correct
    sed -i 's|ssl_certificate.*su\.growcord\.in|ssl_certificate /etc/letsencrypt/live/su.growcord.in/fullchain.pem;|g' /etc/nginx/sites-available/su.growcord.in
    sed -i 's|ssl_certificate_key.*su\.growcord\.in|ssl_certificate_key /etc/letsencrypt/live/su.growcord.in/privkey.pem;|g' /etc/nginx/sites-available/su.growcord.in
    echo -e "${GREEN}✅ Fixed SSL certificate paths for su.growcord.in${NC}"
else
    echo -e "${YELLOW}⚠️  su.growcord.in config not found${NC}"
fi
echo ""

# Step 4: Fix admin.redfit.in config
echo -e "${GREEN}🔐 Step 4: Verifying admin.redfit.in configuration...${NC}"
if [ -f "/etc/nginx/sites-available/admin.redfit.in" ]; then
    # Ensure server_name is correct
    if ! grep -q "server_name admin.redfit.in" /etc/nginx/sites-available/admin.redfit.in; then
        echo -e "${YELLOW}⚠️  Fixing server_name in admin.redfit.in config${NC}"
        sed -i 's/server_name.*/server_name admin.redfit.in;/g' /etc/nginx/sites-available/admin.redfit.in
        echo -e "${GREEN}✅ Fixed server_name${NC}"
    fi
    echo -e "${GREEN}✅ admin.redfit.in config verified${NC}"
else
    echo -e "${YELLOW}⚠️  admin.redfit.in config not found${NC}"
fi
echo ""

# Step 5: Fix api.redfit.in config
echo -e "${GREEN}🔐 Step 5: Verifying api.redfit.in configuration...${NC}"
if [ -f "/etc/nginx/sites-available/api.redfit.in" ]; then
    if ! grep -q "server_name api.redfit.in" /etc/nginx/sites-available/api.redfit.in; then
        echo -e "${YELLOW}⚠️  Fixing server_name in api.redfit.in config${NC}"
        sed -i 's/server_name.*/server_name api.redfit.in;/g' /etc/nginx/sites-available/api.redfit.in
        echo -e "${GREEN}✅ Fixed server_name${NC}"
    fi
    echo -e "${GREEN}✅ api.redfit.in config verified${NC}"
else
    echo -e "${YELLOW}⚠️  api.redfit.in config not found${NC}"
fi
echo ""

# Step 6: Fix ecom (redfit) config
echo -e "${GREEN}🔐 Step 6: Verifying redfit.in configuration...${NC}"
if [ -f "/etc/nginx/sites-available/redfit" ]; then
    if ! grep -q "server_name redfit.in" /etc/nginx/sites-available/redfit; then
        echo -e "${YELLOW}⚠️  Fixing server_name in redfit config${NC}"
        sed -i 's/server_name.*/server_name redfit.in www.redfit.in;/g' /etc/nginx/sites-available/redfit
        echo -e "${GREEN}✅ Fixed server_name${NC}"
    fi
    echo -e "${GREEN}✅ redfit.in config verified${NC}"
else
    echo -e "${YELLOW}⚠️  redfit config not found${NC}"
fi
echo ""

# Step 7: Check SSL certificates
echo -e "${GREEN}🔐 Step 7: Checking SSL certificates...${NC}"
DOMAINS=("su.growcord.in" "admin.redfit.in" "api.redfit.in" "redfit.in")

for domain in "${DOMAINS[@]}"; do
    cert_path="/etc/letsencrypt/live/$domain/fullchain.pem"
    if [ -f "$cert_path" ]; then
        echo -e "${GREEN}✅ Certificate found for $domain${NC}"
    else
        echo -e "${YELLOW}⚠️  Certificate not found for $domain${NC}"
        echo -e "${YELLOW}   Run: sudo certbot --nginx -d $domain${NC}"
    fi
done
echo ""

# Step 8: Test nginx configuration
echo -e "${GREEN}🧪 Step 8: Testing nginx configuration...${NC}"
if nginx -t 2>&1 | grep -q "successful"; then
    echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
else
    echo -e "${RED}❌ Nginx configuration has errors:${NC}"
    nginx -t
    echo -e "${YELLOW}⚠️  Please fix the errors above and run this script again${NC}"
    exit 1
fi
echo ""

# Step 9: Reload nginx
echo -e "${GREEN}🔄 Step 9: Reloading nginx...${NC}"
systemctl reload nginx
echo -e "${GREEN}✅ Nginx reloaded${NC}"
echo ""

# Step 10: Check backend status
echo -e "${GREEN}🔍 Step 10: Checking backend status...${NC}"
if systemctl is-active --quiet node || pm2 list | grep -q "online"; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${YELLOW}⚠️  Backend may not be running${NC}"
    echo -e "${YELLOW}   Check with: pm2 list or systemctl status node${NC}"
fi
echo ""

# Step 11: Verify services
echo -e "${GREEN}✅ Step 11: Verifying services...${NC}"
echo "Testing endpoints:"

# Test su.growcord.in
echo -n "  su.growcord.in: "
if curl -s -k -o /dev/null -w "%{http_code}" https://su.growcord.in | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Test admin.redfit.in
echo -n "  admin.redfit.in: "
if curl -s -k -o /dev/null -w "%{http_code}" https://admin.redfit.in | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Test api.redfit.in
echo -n "  api.redfit.in: "
if curl -s -k -o /dev/null -w "%{http_code}" https://api.redfit.in/health | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Test redfit.in
echo -n "  redfit.in: "
if curl -s -k -o /dev/null -w "%{http_code}" https://redfit.in | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi
echo ""

echo -e "${GREEN}✅ Server fix completed!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "  1. If SSL certificates are missing, run: sudo certbot --nginx -d <domain>"
echo "  2. Check nginx logs: sudo tail -f /var/log/nginx/*.error.log"
echo "  3. Check backend logs: pm2 logs or journalctl -u node"
echo ""
echo -e "${GREEN}✅ Backup location: $BACKUP_DIR${NC}"

