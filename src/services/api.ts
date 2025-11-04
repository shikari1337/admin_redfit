import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_SERVER_URL || 'https://api.redfit.in';
const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';
const API_URL = `${API_BASE_URL}/api/${API_VERSION}`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
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

export default api;

