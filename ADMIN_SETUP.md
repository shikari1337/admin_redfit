# Admin Panel Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
cd admin
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `admin` folder:

```env
VITE_API_SERVER_URL=http://localhost:3000
VITE_API_VERSION=v1
```

**Important:** 
- For development, use `http://localhost:3000`
- For production, use your production API URL (e.g., `https://api.redfit.in`)
- Make sure the backend server is running before starting the admin panel

### 3. Start Backend Server

**Make sure the backend server is running first!**

```bash
cd ../backend
npm install
npm run dev
```

You should see:
```
✅ MongoDB connected successfully
🚀 Server is running on port 3000
📡 API Base URL: http://localhost:3000/api/v1
```

### 4. Start Admin Panel

```bash
cd admin
npm run dev
```

The admin panel should start on `http://localhost:3001`

### 5. Login to Admin Panel

1. Open `http://localhost:3001` in your browser
2. If you haven't created an admin user yet, register one first
3. Login with your credentials

## Troubleshooting

### Admin Panel Not Connecting to Backend

**Check 1: Backend Server Status**
```bash
# Test backend health endpoint
curl http://localhost:3000/health

# Should return: {"status":"ok","timestamp":"..."}
```

**Check 2: Environment Variables**
- Verify `.env` file exists in `admin` folder
- Check `VITE_API_SERVER_URL` is correct
- Make sure there are no typos in the URL

**Check 3: CORS Configuration**
- Backend should allow `http://localhost:3001` in CORS_ORIGIN
- Check backend `.env` file: `CORS_ORIGIN=http://localhost:5173,http://localhost:3000,http://localhost:3001,http://localhost:3002`

**Check 4: Browser Console**
- Open browser DevTools (F12)
- Check Console tab for errors
- Look for network errors in Network tab
- Check if API calls are being made to correct URL

**Check 5: Network Connectivity**
```bash
# Test if backend is accessible
curl http://localhost:3000/api/v1/products

# Should return product data or error response (not connection refused)
```

### Common Errors

**Error: "Cannot connect to backend server"**
- Backend server is not running
- Wrong URL in `VITE_API_SERVER_URL`
- Firewall blocking connection
- Backend running on different port

**Error: "CORS policy" or "Origin not allowed"**
- Backend CORS_ORIGIN doesn't include admin panel URL
- Update backend `.env` file to include `http://localhost:3001`

**Error: "401 Unauthorized"**
- Invalid or expired token
- Try logging out and logging in again
- Check if token is saved in localStorage

**Error: "Network Error" or "Connection Refused"**
- Backend server is not running
- Check if backend is running on port 3000
- Verify MongoDB is connected in backend logs

## Verification Checklist

- [ ] Backend server is running (`npm run dev` in backend folder)
- [ ] MongoDB is connected (check backend logs)
- [ ] `.env` file exists in admin folder
- [ ] `VITE_API_SERVER_URL` is correct in `.env`
- [ ] Backend CORS allows admin panel origin
- [ ] Admin panel starts without errors
- [ ] Can access admin panel at `http://localhost:3001`
- [ ] Can login to admin panel
- [ ] Products load correctly
- [ ] Can create/edit products

## Features

- **Product Management**: Create, edit, delete products
- **Size Chart**: Add size measurements for products
- **Order Management**: View and manage orders
- **Review Management**: Approve/reject customer reviews
- **Coupon Management**: Create and manage discount coupons
- **Settings**: Configure site settings

## Need Help?

1. Check browser console for errors
2. Check backend logs for errors
3. Verify all environment variables are set correctly
4. Ensure backend server is running and MongoDB is connected

