
# Redfit Admin Dashboard

Admin panel for managing Redfit store - products, orders, and more.

## Features

- ✅ **Dashboard** - Overview of products, orders, revenue
- ✅ **Product Management** - Create, edit, delete products
- ✅ **Order Management** - View and update order status
- ✅ **Image Upload** - Upload product images to DigitalOcean Spaces
- ✅ **Secure Authentication** - JWT-based admin login

## Setup

1. Install dependencies:
```bash
cd admin
npm install
```

2. Configure API URL:
The admin panel is configured to use `https://api.redfit.in` by default.

Create a `.env` file in the admin directory:
```env

```

Or use the `.env.example` file as a template:
```bash
cp .env.example .env
```

3. Start development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Usage

1. **Login**: Use your admin credentials (created via `/api/v1/auth/register`)
2. **Dashboard**: View store statistics
3. **Products**: Manage products - add, edit, delete
4. **Orders**: View orders and update their status

## API Endpoints Used

- `POST /api/v1/auth/login` - Admin login
- `GET /api/v1/auth/me` - Get current admin
- `GET /api/v1/products` - List products
- `POST /api/v1/products` - Create product
- `PUT /api/v1/products/:id` - Update product
- `DELETE /api/v1/products/:id` - Delete product
- `GET /api/v1/orders` - List orders
- `GET /api/v1/orders/:id` - Get order details
- `PUT /api/v1/orders/:id/status` - Update order status
- `POST /api/v1/upload` - Upload images

## Development

The admin panel runs on port 3001 by default.

## Production

Build the admin panel and deploy to your hosting platform.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deployment

1. **Clone repository on server:**
   ```bash
   git clone [YOUR_ADMIN_REPO_URL] admin.redfit.in
   cd admin.redfit.in
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   nano .env  # Update with your API URL
   ```

3. **Build:**
   ```bash
   npm install
   npm run build
   ```

4. **Configure Nginx:**
   - Copy `nginx.conf.example` to `/etc/nginx/sites-available/admin.redfit.in`
   - Update paths and domain name
   - Enable site: `sudo ln -s /etc/nginx/sites-available/admin.redfit.in /etc/nginx/sites-enabled/`
   - Test: `sudo nginx -t`
   - Reload: `sudo systemctl reload nginx`

5. **Set up SSL:**
   ```bash
   sudo certbot --nginx -d admin.redfit.in
   ```

### Automated Deployment

**Option 1: Using GitHub Actions**
- Push to `main` branch triggers automatic deployment
- Configure secrets in GitHub repository:
  - `SSH_PRIVATE_KEY`: Private SSH key
  - `SSH_USER`: SSH username
  - `SSH_HOST`: Server IP/domain
  - `SSH_PATH`: Deployment path (e.g., `/home/user/htdocs/admin.redfit.in/dist`)
  - `VITE_API_SERVER_URL`: Production API URL (e.g., `https://api.redfit.in`)

**Option 2: Using Deployment Script**
```bash
./deploy.sh
```
Update variables in `deploy.sh` with your server details first.

