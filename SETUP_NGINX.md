# Setup Nginx for Admin Panel

## Quick Setup Commands

Run these commands on your server to set up the admin panel nginx configuration:

```bash
# 1. Create the nginx configuration file
sudo nano /etc/nginx/sites-available/admin.redfit.in
```

Then paste the configuration below (see full config in next section).

```bash
# 2. Enable the site
sudo ln -s /etc/nginx/sites-available/admin.redfit.in /etc/nginx/sites-enabled/

# 3. Test nginx configuration
sudo nginx -t

# 4. If test passes, reload nginx
sudo systemctl reload nginx

# 5. Set up SSL certificate (if not already done)
sudo certbot --nginx -d admin.redfit.in
```

## Full Nginx Configuration

Copy this entire configuration to `/etc/nginx/sites-available/admin.redfit.in`:

```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name admin.redfit.in;

    # Allow Let's Encrypt validation
    location ~ /.well-known {
        allow all;
    }

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name admin.redfit.in;

    # SSL Certificate (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/admin.redfit.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.redfit.in/privkey.pem;
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Root directory - Deployment path matching server structure
    # Matches pattern: /var/www/redfit, /var/www/superadmin
    root /var/www/admin/dist;
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
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/x-javascript
        application/xml+rss
        application/javascript
        application/json
        application/xml
        image/svg+xml;

    # Allow Let's Encrypt validation
    location ~ /.well-known {
        allow all;
    }

    # Cache static assets with long expiration
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Don't cache index.html - always serve fresh version
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # Handle React Router (SPA fallback) - IMPORTANT for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security: Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Block access to source files (if present)
    location ~ ^/(src|node_modules|\.git|package\.json|vite\.config\.ts) {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Block access to .env file
    location ~ /\.env {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

## Important: Update the Root Path

The configuration is already set to use `/var/www/admin/dist` which matches your server structure (`/var/www/redfit`, `/var/www/superadmin`).

**No need to update the path** - it's already configured correctly!

## Step-by-Step Instructions

### 1. Verify Deployment Directory

The admin will be deployed to `/var/www/admin/dist/` to match your server structure:

```bash
# Check existing deployments
ls -la /var/www/

# You should see:
# - redfit/
# - superadmin/
# - admin/  (will be created by deployment)
```

### 2. Create the Configuration File

```bash
sudo nano /etc/nginx/sites-available/admin.redfit.in
```

Paste the configuration above. The `root` path is already set to `/var/www/admin/dist` - no changes needed!

### 3. Enable the Site

```bash
sudo ln -s /etc/nginx/sites-available/admin.redfit.in /etc/nginx/sites-enabled/
```

### 4. Test Configuration

```bash
sudo nginx -t
```

You should see:
```
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 5. Reload Nginx

```bash
sudo systemctl reload nginx
```

### 6. Set Up SSL Certificate

```bash
sudo certbot --nginx -d admin.redfit.in
```

This will:
- Automatically update the nginx config with SSL paths
- Set up automatic renewal

### 7. Verify

```bash
# Check if the site is enabled
ls -la /etc/nginx/sites-enabled/ | grep admin

# Test the site
curl -I https://admin.redfit.in

# Check nginx status
sudo systemctl status nginx
```

## Troubleshooting

### If nginx test fails:

```bash
# Check for syntax errors
sudo nginx -t

# View detailed error
sudo tail -20 /var/log/nginx/error.log
```

### If site doesn't load:

1. **Check if files exist:**
   ```bash
   ls -la /var/www/admin/dist/
   ```

2. **Check file permissions:**
   ```bash
   sudo chown -R www-data:www-data /var/www/admin/dist
   sudo chmod -R 755 /var/www/admin/dist
   ```

3. **Check nginx error logs:**
   ```bash
   sudo tail -f /var/log/nginx/admin.redfit.in.error.log
   ```

4. **Check if domain DNS is configured:**
   ```bash
   dig admin.redfit.in +short
   ```

### If SSL certificate fails:

```bash
# Check if certificate exists
sudo ls -la /etc/letsencrypt/live/admin.redfit.in/

# If not, get certificate
sudo certbot --nginx -d admin.redfit.in

# If DNS not ready, use --webroot method
sudo certbot certonly --webroot -w /var/www/admin/dist -d admin.redfit.in
```

## After Setup

Once nginx is configured:

1. **Deploy the admin panel** (if not using GitHub Actions):
   ```bash
   # On your local machine or CI/CD
   cd admin
   npm install
   npm run build
   rsync -avz --delete dist/ root@your-server:/var/www/admin/dist/
   ssh root@your-server "sudo chown -R www-data:www-data /var/www/admin/dist"
   ```

   **OR** if using GitHub Actions, just push to `main` branch - deployment is automatic!

2. **Verify deployment:**
   ```bash
   # On server
   ls -la /var/www/admin/dist/
   # Should see index.html and assets/
   ```

3. **Test in browser:**
   - Visit `https://admin.redfit.in` in your browser
   - Should see the admin login page

4. **Check browser console** for any API connection errors

