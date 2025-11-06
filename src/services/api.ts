import axios from 'axios';

// API Configuration
// Production: https://api.redfit.in
// Development: http://localhost:3000
// Normalize API base URL (remove trailing slashes to avoid double slashes)
let API_BASE_URL = import.meta.env.VITE_API_SERVER_URL || 
  (import.meta.env.PROD ? 'https://api.redfit.in' : 'http://localhost:3000');
API_BASE_URL = API_BASE_URL.replace(/\/+$/, ''); // Remove trailing slashes

const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';
const API_URL = `${API_BASE_URL}/api/${API_VERSION}`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Log API configuration
console.log('🔧 API Configuration:', {
  baseURL: API_URL,
  apiBaseUrl: API_BASE_URL,
  apiVersion: API_VERSION,
  isProduction: import.meta.env.PROD,
  currentOrigin: window.location.origin,
  currentHostname: window.location.hostname,
  protocol: window.location.protocol
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('📤 Request:', {
    method: config.method?.toUpperCase(),
    url: config.url,
    baseURL: config.baseURL,
    headers: config.headers,
    hasToken: !!token
  });
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => {
    console.log('📥 Response:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  (error) => {
    // Network errors (no response from server)
    if (!error.response) {
      const fullURL = error.config?.baseURL + error.config?.url;
      
      console.error('❌ Network Error (No Response):', {
        message: error.message,
        code: error.code,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: fullURL,
        timeout: error.config?.timeout,
        method: error.config?.method?.toUpperCase()
      });
      
      // Provide specific error messages
      if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || error.message?.includes('Connection refused')) {
        console.error('❌ CONNECTION REFUSED - Server is not reachable');
        console.error('   Possible causes:');
        console.error('   1. Backend server is not running');
        console.error('   2. Backend is running on a different port');
        console.error('   3. Firewall is blocking the connection');
        console.error('   4. Wrong URL in configuration');
        console.error('   Check backend server at:', error.config?.baseURL);
        console.error('   Try: http://localhost:3000/health');
        
        // Show user-friendly error
        alert(`Cannot connect to backend server.\n\nURL: ${fullURL}\n\nPlease check:\n1. Backend server is running\n2. Correct URL in .env file\n3. Firewall settings`);
      } else if (error.code === 'ETIMEDOUT') {
        console.error('❌ Connection timeout - Server did not respond in time');
      } else if (error.code === 'ENOTFOUND') {
        console.error('❌ DNS lookup failed - Hostname not found:', error.config?.baseURL);
      }
    } else {
      // HTTP errors (server responded with error status)
      console.error('❌ Response Error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: error.config?.baseURL + error.config?.url,
        data: error.response?.data,
        message: error.message,
        headers: error.response?.headers
      });
    }
    
    if (error.response?.status === 401) {
      console.log('🔒 Unauthorized, removing token and redirecting');
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (email: string, password: string) => {
    const fullUrl = `${API_URL}/auth/login`;
    console.log('📤 API Request:', {
      method: 'POST',
      url: fullUrl,
      baseURL: API_URL,
      endpoint: '/auth/login',
      data: { email, password: '***' }
    });
    
    try {
      const response = await api.post('/auth/login', { email, password });
      console.log('📥 API Response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers
      });
      return response.data;
    } catch (error: any) {
      // Network error (no response)
      if (!error.response) {
        console.error('❌ Network Error - Server not reachable:', {
          message: error.message,
          code: error.code,
          fullURL: fullUrl,
          baseURL: API_URL,
          suggestion: 'Check if backend server is running and accessible'
        });
      } else {
        // HTTP error (server responded)
        console.error('❌ API Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            baseURL: error.config?.baseURL,
            fullURL: fullUrl,
            headers: error.config?.headers
          }
        });
      }
      throw error;
    }
  },
  me: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// Products API
export const productsAPI = {
  getAll: async (params?: { active?: boolean; search?: string }) => {
    const response = await api.get('/products', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/products/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/products', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/products/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/products/${id}`);
    return response.data;
  },
};

// Orders API
export const ordersAPI = {
  getAll: async (params?: {
    orderId?: string;
    mobileNumber?: string;
    status?: string;
    limit?: number;
    page?: number;
  }) => {
    const response = await api.get('/orders', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/orders/${id}`);
    return response.data;
  },
  updateStatus: async (id: string, status: string) => {
    const response = await api.put(`/orders/${id}/status`, { status });
    return response.data;
  },
};

// Upload API
export const uploadAPI = {
  uploadSingle: async (file: File, folder?: string) => {
    const formData = new FormData();
    formData.append('image', file);
    if (folder) {
      formData.append('folder', folder);
    }
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  uploadMultiple: async (files: File[], folder?: string) => {
    const formData = new FormData();
    files.forEach((file) => {
      // Use 'images' field name for both images and videos (backend accepts both)
      // The backend middleware accepts 'images' field for all file types
      formData.append('images', file);
    });
    if (folder) {
      formData.append('folder', folder);
    }
    const response = await api.post('/upload/multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  delete: async (key: string) => {
    const response = await api.delete(`/upload/${encodeURIComponent(key)}`);
    return response.data;
  },
};

// Reviews API
export const reviewsAPI = {
  getAll: async (params?: { productId?: string; approved?: boolean }) => {
    const response = await api.get('/reviews', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/reviews/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (key === 'images' && Array.isArray(data[key])) {
        // Images are already URLs, just add them
        data[key].forEach((img: string) => formData.append('images', img));
      } else if (data[key] !== undefined && data[key] !== null) {
        formData.append(key, typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key]);
      }
    });
    const response = await api.post('/reviews', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/reviews/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/reviews/${id}`);
    return response.data;
  },
  approve: async (id: string, approved: boolean) => {
    const response = await api.put(`/reviews/${id}/approve`, { approved });
    return response.data;
  },
  getProducts: async () => {
    const response = await api.get('/products');
    return response.data;
  },
};

// Shipping API
export const shippingAPI = {
  createShipment: async (orderId: string) => {
    const response = await api.post('/shipping/create-shipment', { orderId });
    return response.data;
  },
  checkServiceability: async (pincode: string, weight?: number, cod?: boolean) => {
    const response = await api.post('/shipping/check-serviceability', {
      pincode,
      weight,
      cod,
    });
    return response.data;
  },
  trackShipment: async (awb: string) => {
    const response = await api.get(`/shipping/track/${awb}`);
    return response.data;
  },
};

export const couponsAPI = {
  getAll: async () => {
    // Admin route - get all coupons (including inactive)
    const response = await api.get('/coupons/admin');
    return response.data.data || response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/coupons/${id}`);
    return response.data.data || response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/coupons', data);
    return response.data.data || response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/coupons/${id}`, data);
    return response.data.data || response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/coupons/${id}`);
    return response.data;
  },
};

export default api;
