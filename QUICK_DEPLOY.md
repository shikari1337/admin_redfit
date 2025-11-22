# Quick Deployment Guide

## Prerequisites
- Server with SSH access
- Nginx installed
- Node.js 18+ installed
- Git installed

## Step-by-Step Deployment

### 1. Clone Repository on Server

```bash
ssh user@your-server-ip
cd ~/htdocs  # or your web directory
git clone [YOUR_ADMIN_REPO_URL] admin.redfit.in
cd admin.redfit.in
```

### 2. Create Environment File

```bash
cat > .env << EOF
VITE_API_SERVER_URL=https://api.redfit.in
VITE_API_VERSION=v1
EOF
```

**Important:** Replace `https://api.redfit.in` with your actual backend API URL.

### 3. Install and Build

```bash
npm install
npm run build
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
   - `SSH_USER`: SSH username
   - `SSH_HOST`: Server IP or domain
   - `SSH_PATH`: Deployment path (e.g., `/home/user/htdocs/admin.redfit.in/dist`)
   - `VITE_API_SERVER_URL`: Production API URL

3. Push to `main` branch to trigger deployment

## Manual Update

```bash
cd ~/htdocs/admin.redfit.in
git pull origin main
npm install
npm run build
# Files are automatically served from dist/ folder
```

