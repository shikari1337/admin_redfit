# Admin Panel Multi-Tenant Setup

## Overview

The admin panel has been updated to support the multi-tenant backend architecture. This allows the same admin codebase to manage different stores based on the domain.

## How It Works

1. **Relative URLs**: The admin panel uses relative URLs (`/api/v1/*`) instead of fixed API URLs
2. **Nginx Proxy**: Nginx proxies `/api/*` requests to the backend (`localhost:3000`)
3. **Tenant Identification**: The backend identifies the tenant from the domain:
   - `admin.redfit.in` → manages `redfit` store
   - `admin.mishmish.in` → manages `mishmish` store

## Configuration

### Environment Variables

**For Multi-Tenant (Recommended):**
```env
# Leave empty to use relative URLs
VITE_API_SERVER_URL=
VITE_API_VERSION=v1
```

**For Fixed API URL (Not Recommended):**
```env
# Only use if you need a fixed API URL (not multi-tenant)
VITE_API_SERVER_URL=https://api.redfit.in
VITE_API_VERSION=v1
```

### Nginx Configuration

The nginx config (`nginx-admin.conf`) includes:

1. **API Proxy**: Proxies `/api/*` to `http://127.0.0.1:3000`
2. **Host Preservation**: Preserves the `Host` header so backend can identify tenant
3. **Static Files**: Serves admin panel files from `/var/www/admin/dist`

## Deployment

### Option 1: GitHub Actions (Recommended)

1. **Set GitHub Secrets:**
   - `VITE_API_SERVER_URL`: Leave empty or don't set (for multi-tenant)
   - `VITE_API_VERSION`: `v1` (optional, defaults to v1)

2. **Push to main branch:**
   ```bash
   git push origin main
   ```

3. **The build will:**
   - Use relative URLs if `VITE_API_SERVER_URL` is empty
   - Deploy to `/var/www/admin/dist/`

### Option 2: Manual Build

```bash
# Build with relative URLs (multi-tenant)
VITE_API_SERVER_URL= VITE_API_VERSION=v1 npm run build

# Or set in .env file
echo "VITE_API_SERVER_URL=" > .env
echo "VITE_API_VERSION=v1" >> .env
npm run build
```

## Nginx Setup

1. **Copy nginx config:**
   ```bash
   sudo cp nginx-admin.conf /etc/nginx/sites-available/admin.redfit.in
   ```

2. **Enable site:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/admin.redfit.in /etc/nginx/sites-enabled/
   ```

3. **Test and reload:**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **SSL:**
   ```bash
   sudo certbot --nginx -d admin.redfit.in
   ```

## Important Notes

✅ **Backend must be running** on `localhost:3000` for the proxy to work

✅ **Domain must match store** - `admin.redfit.in` manages the `redfit` store

✅ **CORS is handled** - Since requests go through nginx proxy, no CORS issues

✅ **Same codebase** - One admin deployment works for all stores via domain

## Troubleshooting

### Infinite Loading Loop

1. **Check backend is running:**
   ```bash
   curl http://127.0.0.1:3000/health
   ```

2. **Check nginx proxy:**
   ```bash
   curl https://admin.redfit.in/api/v1/health
   ```

3. **Check browser console** for API errors

4. **Verify nginx config:**
   ```bash
   sudo nginx -t
   sudo tail -f /var/log/nginx/admin.redfit.in.error.log
   ```

### API Calls Failing

1. **Verify proxy is working:**
   ```bash
   # Should return backend response
   curl -H "Host: admin.redfit.in" http://127.0.0.1:3000/api/v1/health
   ```

2. **Check nginx access logs:**
   ```bash
   sudo tail -f /var/log/nginx/admin.redfit.in.access.log
   ```

3. **Verify backend logs** for tenant identification

## Architecture

```
┌─────────────────┐
│ admin.redfit.in │
│  (Nginx)        │
└────────┬────────┘
         │
         ├─ /api/* ────────┐
         │                  │
         │                  ▼
         │          ┌───────────────┐
         │          │ localhost:3000│
         │          │  (Backend)    │
         │          │               │
         │          │ Identifies    │
         │          │ tenant from   │
         │          │ Host header   │
         │          │ (redfit)      │
         │          └───────────────┘
         │
         └─ /* ──► /var/www/admin/dist/
                    (Static Files)
```

## Migration from Fixed URL

If you previously used `VITE_API_SERVER_URL=https://api.redfit.in`:

1. **Update GitHub Secrets:**
   - Remove or empty `VITE_API_SERVER_URL` secret

2. **Rebuild:**
   ```bash
   # Local build
   VITE_API_SERVER_URL= npm run build
   
   # Or push to GitHub (will rebuild automatically)
   git push origin main
   ```

3. **Update nginx config:**
   - Make sure `nginx-admin.conf` has the `/api/` proxy block

4. **Restart nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

