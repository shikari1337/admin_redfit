# Admin Panel Deployment Summary

## Server Structure

Your server uses this structure:
```
/var/www/
├── redfit/        # Ecom frontend
├── superadmin/    # Super admin panel
└── admin/         # Admin panel (will be created)
    └── dist/      # Built files deployed here
```

## Quick Deployment

### Option 1: GitHub Actions (Recommended)

1. **Add GitHub Secrets:**
   - `SSH_PRIVATE_KEY`: Your private SSH key
   - `SSH_USER`: `root` (or your SSH username)
   - `SSH_HOST`: Your server IP/domain
   - `VITE_API_SERVER_URL`: `https://api.redfit.in`
   - `VITE_API_VERSION`: `v1` (optional)
   - `SSH_RELOAD_NGINX`: `true` (optional)

2. **Push to main branch:**
   ```bash
   git push origin main
   ```

3. **Deployment automatically:**
   - Builds the admin panel
   - Deploys to `/var/www/admin/dist/`
   - Sets correct permissions
   - Optionally reloads Nginx

### Option 2: Manual Deployment

```bash
# On your local machine
cd admin
npm install
npm run build

# Deploy to server
rsync -avz --delete dist/ root@your-server:/var/www/admin/dist/
ssh root@your-server "sudo chown -R www-data:www-data /var/www/admin/dist"
```

## Nginx Setup

1. **Create nginx config:**
   ```bash
   sudo nano /etc/nginx/sites-available/admin.redfit.in
   ```
   Copy content from `nginx-admin.conf` (already configured for `/var/www/admin/dist`)

2. **Enable site:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/admin.redfit.in /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

3. **Set up SSL:**
   ```bash
   sudo certbot --nginx -d admin.redfit.in
   ```

## Verification

```bash
# Check deployment
ls -la /var/www/admin/dist/

# Check nginx config
ls -la /etc/nginx/sites-enabled/ | grep admin

# Test site
curl -I https://admin.redfit.in
```

## Important Notes

- ✅ Deployment path: `/var/www/admin/dist/` (matches server structure)
- ✅ Nginx root: `/var/www/admin/dist` (already configured)
- ✅ Permissions: `www-data:www-data` (set automatically)
- ✅ No need to clone repo on server if using GitHub Actions
- ✅ Files are served directly from `/var/www/admin/dist/`

