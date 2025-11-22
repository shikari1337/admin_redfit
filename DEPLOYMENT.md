# Admin Panel Deployment Guide

This guide covers deploying the Redfit Admin Panel to a production server where the backend and ecom are already deployed.

## 📋 Prerequisites

1. Server with SSH access
2. Nginx installed and configured
3. Node.js 18+ installed
4. Git installed
5. Admin repository cloned or ready to clone
6. Backend API accessible (e.g., `https://api.redfit.in`)
7. SSL certificate configured for admin domain

## 🏗️ Server Directory Structure

Recommended directory structure on the server:

```
/home/[username]/htdocs/admin.redfit.in/
├── .git/
├── dist/              # Built admin panel files
├── src/               # Source files (optional, can be removed after build)
├── package.json
├── package-lock.json
├── vite.config.ts
├── .env               # Production environment variables
└── nginx.conf         # Nginx configuration (optional, can be in sites-available)
```

## 📦 Step 1: Clone Repository on Server

If the admin repo is already on the server, skip to Step 2. Otherwise:

```bash
# SSH into your server
ssh user@your-server-ip

# Navigate to your web directory
cd ~/htdocs/  # or /var/www/html/ or wherever you keep web files

# Clone the admin repository
git clone [YOUR_ADMIN_REPO_URL] admin.redfit.in
# OR if using SSH:
# git clone git@github.com:yourusername/redfit-admin.git admin.redfit.in

cd admin.redfit.in
```

## ⚙️ Step 2: Configure Environment Variables

Create a `.env` file in the admin directory:

```bash
cd admin.redfit.in
nano .env
```

Add the following content:

```env
# Production API Server URL
VITE_API_SERVER_URL=https://api.redfit.in

# API Version
VITE_API_VERSION=v1
```

**Important:** Replace `https://api.redfit.in` with your actual backend API URL.

Save and exit (Ctrl+X, then Y, then Enter).

## 🔨 Step 3: Install Dependencies and Build

```bash
# Install dependencies
npm install

# Build for production
npm run build
```

This will create the `dist/` folder with the production-ready files.

## 🌐 Step 4: Configure Nginx

Create an Nginx configuration file for the admin panel:

```bash
sudo nano /etc/nginx/sites-available/admin.redfit.in
```

Add the following configuration:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name admin.redfit.in;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name admin.redfit.in;

    # SSL Certificate (adjust paths as needed)
    ssl_certificate /etc/letsencrypt/live/admin.redfit.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.redfit.in/privkey.pem;
    
    # SSL Configuration (recommended settings)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Root directory (point to dist folder)
    root /home/[username]/htdocs/admin.redfit.in/dist;
    index index.html;

    # Logging
    access_log /var/log/nginx/admin.redfit.in.access.log;
    error_log /var/log/nginx/admin.redfit.in.error.log;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # Handle React Router (SPA fallback)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache index.html
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # Security: Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

**Important:** 
- Replace `[username]` with your actual server username
- Replace `admin.redfit.in` with your actual admin domain
- Adjust SSL certificate paths if using a different provider

Enable the site:

```bash
# Create symlink to sites-enabled
sudo ln -s /etc/nginx/sites-available/admin.redfit.in /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

## 🔒 Step 5: Set Up SSL Certificate (if not already done)

If you haven't set up SSL yet, use Let's Encrypt:

```bash
# Install certbot (if not already installed)
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d admin.redfit.in

# Test auto-renewal
sudo certbot renew --dry-run
```

## ✅ Step 6: Verify Deployment

1. **Check Nginx status:**
   ```bash
   sudo systemctl status nginx
   ```

2. **Test the admin panel:**
   ```bash
   curl -I https://admin.redfit.in
   ```

3. **Open in browser:**
   - Navigate to `https://admin.redfit.in`
   - You should see the admin login page

4. **Check browser console:**
   - Open DevTools (F12)
   - Check Console for any errors
   - Verify API calls are going to the correct backend URL

## 🔄 Step 7: Set Up Auto-Deployment (Optional)

### Option A: Manual Deployment Script

Create a deployment script:

```bash
cd ~/htdocs/admin.redfit.in
nano deploy.sh
```

Add the following:

```bash
#!/bin/bash

set -e  # Exit on error

echo "🚀 Starting admin panel deployment..."

# Navigate to project directory
cd /home/[username]/htdocs/admin.redfit.in

# Pull latest changes from git
echo "📥 Pulling latest changes..."
git pull origin main  # or master, depending on your branch

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build for production
echo "🔨 Building for production..."
npm run build

# Verify build
if [ ! -d "dist" ]; then
    echo "❌ Build failed: dist folder not found"
    exit 1
fi

echo "✅ Deployment completed successfully!"
echo "🌐 Admin panel should be available at https://admin.redfit.in"
```

Make it executable:

```bash
chmod +x deploy.sh
```

Run it:

```bash
./deploy.sh
```

### Option B: GitHub Actions (Recommended)

If you want automatic deployment on push, use the existing `.github/workflows/main.yml` or create one:

```yaml
name: Deploy Admin Panel

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_API_SERVER_URL: ${{ secrets.VITE_API_SERVER_URL }}
          VITE_API_VERSION: v1
      
      - name: Deploy to server
        uses: appleboy/scp-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          port: ${{ secrets.SERVER_PORT || 22 }}
          source: "dist/*"
          target: "/home/[username]/htdocs/admin.redfit.in/dist"
      
      - name: Reload Nginx
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          port: ${{ secrets.SERVER_PORT || 22 }}
          script: |
            sudo systemctl reload nginx
```

Add these secrets to your GitHub repository:
- `SERVER_HOST`: Your server IP or domain
- `SERVER_USER`: SSH username
- `SERVER_SSH_KEY`: Private SSH key
- `SERVER_PORT`: SSH port (optional, defaults to 22)
- `VITE_API_SERVER_URL`: Your production API URL (e.g., `https://api.redfit.in`)

## 🛠️ Troubleshooting

### Admin panel not loading

1. **Check Nginx error logs:**
   ```bash
   sudo tail -f /var/log/nginx/admin.redfit.in.error.log
   ```

2. **Verify dist folder exists:**
   ```bash
   ls -la /home/[username]/htdocs/admin.redfit.in/dist
   ```

3. **Check file permissions:**
   ```bash
   sudo chown -R www-data:www-data /home/[username]/htdocs/admin.redfit.in/dist
   ```

### API connection errors

1. **Check API URL in .env:**
   ```bash
   cat /home/[username]/htdocs/admin.redfit.in/.env
   ```

2. **Rebuild with correct environment:**
   ```bash
   cd /home/[username]/htdocs/admin.redfit.in
   npm run build
   ```

3. **Test backend API directly:**
   ```bash
   curl https://api.redfit.in/api/v1/products
   ```

### 404 errors on page refresh

- This is normal for SPAs. The Nginx config should handle this with `try_files $uri $uri/ /index.html;`
- Verify the location block is correct in your Nginx config

### CORS errors

- Make sure the backend CORS configuration includes your admin domain
- Check backend `.env` file for `CORS_ORIGIN` setting

## 🔐 Security Checklist

- [ ] SSL certificate installed and valid
- [ ] Nginx configured with security headers
- [ ] `.env` file not accessible via web (check `location ~ /\.`)
- [ ] File permissions set correctly (not world-writable)
- [ ] Regular backups of configuration and code
- [ ] Firewall configured (only allow 22, 80, 443)

## 📝 Maintenance

### Regular Updates

```bash
# Pull latest changes
git pull origin main

# Rebuild
npm run build

# No need to restart anything - Nginx serves static files
```

### Clear Cache

If users see old versions, clear browser cache or add cache-busting to assets.

## 🎉 Success!

Your admin panel should now be live at `https://admin.redfit.in`!

