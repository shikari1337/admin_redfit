# Quick Deployment Guide

## Prerequisites
- Server with SSH access
- Nginx installed
- Node.js 18+ installed
- Git installed

## Step-by-Step Deployment

### 1. Set Up Deployment Directory

```bash
ssh root@your-server-ip
sudo mkdir -p /var/www/admin/dist
sudo chown -R root:www-data /var/www/admin
```

**Note:** If using GitHub Actions, you don't need to clone on the server - it deploys directly to `/var/www/admin/dist/`.

### 2. Configure GitHub Actions (Recommended)

Add these secrets to your GitHub repository:
- `SSH_PRIVATE_KEY`: Your private SSH key
- `SSH_USER`: `root` (or your SSH username)
- `SSH_HOST`: Your server IP/domain
- `VITE_API_SERVER_URL`: `https://api.redfit.in`

Then push to `main` branch - deployment is automatic!

### 3. Manual Deployment (Alternative)

If deploying manually:

```bash
# On your local machine or CI/CD
cd admin
npm install
npm run build

# Deploy to server
rsync -avz --delete dist/ root@your-server:/var/www/admin/dist/
ssh root@your-server "sudo chown -R www-data:www-data /var/www/admin/dist"
```

### 4. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/admin.redfit.in
```

Copy the content from `nginx.conf.example` and update:
- Replace `[username]` with your server username
- Replace `admin.redfit.in` with your admin domain
- Update SSL certificate paths if needed

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/admin.redfit.in /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Set Up SSL (if not already done)

```bash
sudo certbot --nginx -d admin.redfit.in
```

### 6. Verify

Visit `https://admin.redfit.in` in your browser.

## GitHub Actions Setup (Optional)

1. Go to your GitHub repository → Settings → Secrets and variables → Actions

2. Add these secrets:
   - `SSH_PRIVATE_KEY`: Your private SSH key
   - `SSH_USER`: `root` (or your SSH username)
   - `SSH_HOST`: Server IP or domain
   - `VITE_API_SERVER_URL`: Production API URL (e.g., `https://api.redfit.in`)
   - `VITE_API_VERSION`: `v1` (optional)
   - `SSH_RELOAD_NGINX`: `true` (optional, to auto-reload Nginx)

3. Push to `main` branch to trigger deployment

## Manual Update

```bash
# On your local machine
cd admin
git pull origin main
npm install
npm run build
rsync -avz --delete dist/ root@your-server:/var/www/admin/dist/
ssh root@your-server "sudo chown -R www-data:www-data /var/www/admin/dist"
```

