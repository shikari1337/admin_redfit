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
You can change it in `.env` file if needed.

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

