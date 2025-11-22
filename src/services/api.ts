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
      console.log('🔒 Unauthorized, session expired or invalid');
      
      // Check if this is a session-related error
      const errorData = error.response?.data;
      const errorCode = errorData?.code;
      const errorMessage = errorData?.message || 'Session expired';
      
      // Session-specific error codes from backend
      const sessionErrorCodes = [
        'SESSION_EXPIRED',
        'SESSION_INVALID',
        'SESSION_MISMATCH',
        'TOKEN_EXPIRED',
        'USER_NOT_FOUND',
        'ACCOUNT_DISABLED'
      ];
      
      if (sessionErrorCodes.includes(errorCode) || errorMessage.includes('session') || errorMessage.includes('Session')) {
        console.log('🔒 Session error detected, clearing token and redirecting to login');
        localStorage.removeItem('admin_token');
        window.location.href = '/login';
      } else {
        // Generic 401 - might be temporary, don't redirect immediately
        console.warn('🔒 Authentication error (non-session):', errorMessage);
        // Still remove token as it's likely invalid
        localStorage.removeItem('admin_token');
        window.location.href = '/login';
      }
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
  logout: async () => {
    try {
      const response = await api.post('/auth/logout');
      return response.data;
    } catch (error: any) {
      // Even if logout fails on server, clear local token
      console.warn('Logout request failed, clearing local token anyway:', error);
      // Don't throw error - we still want to clear local storage
      return { success: true, message: 'Logged out locally' };
    }
  },
  logoutAll: async () => {
    try {
      const response = await api.post('/auth/logout-all');
      return response.data;
    } catch (error: any) {
      console.warn('Logout all request failed, clearing local token anyway:', error);
      return { success: true, message: 'Logged out locally' };
    }
  },
  getSessions: async () => {
    const response = await api.get('/auth/sessions');
    return response.data;
  },
  deleteSession: async (sessionId: string) => {
    const response = await api.delete(`/auth/sessions/${sessionId}`);
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
  duplicate: async (id: string) => {
    // Get prefilled data for duplication (doesn't create product)
    const response = await api.get(`/products/${id}/duplicate`);
    return response.data;
  },
  generateContent: async (id: string, sectionId: string, options: {
    generateText: boolean;
    generateImages: boolean;
    generateVideos: boolean;
    overrideExisting: boolean;
  }) => {
    const response = await api.post(`/products/${id}/generate-content`, {
      sectionId,
      options,
    });
    return response.data;
  },
  generateField: async (
    id: string,
    sectionId: string,
    fieldType: 'text' | 'image',
    fieldPath: string,
    options?: {
      contextProductId?: string;
      contextSectionId?: string;
      customPrompt?: string;
    }
  ) => {
    const response = await api.post(`/products/${id}/generate-field`, {
      sectionId,
      fieldType,
      fieldPath,
      ...options,
    });
    return response.data;
  },
};

// Categories API
const safeError = (error: any) => {
  if (!error || !error.response) {
    throw error;
  }
  const { status, data } = error.response;
  const message =
    data?.message ||
    data?.error ||
    data?.errors?.[0]?.msg ||
    'Something went wrong. Please try again.';
  const code = data?.code || data?.errorCode;

  const wrapped = new Error(message) as Error & { status?: number; code?: string };
  wrapped.status = status;
  if (code) {
    wrapped.code = code;
  }
  throw wrapped;
};

export const categoriesAPI = {
  list: async () => {
    try {
      const response = await api.get('/categories');
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  create: async (data: any) => {
    try {
      const response = await api.post('/categories', data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (id: string, data: any) => {
    try {
      const response = await api.put(`/categories/${id}`, data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (id: string) => {
    try {
      const response = await api.delete(`/categories/${id}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
};

// Size Charts API
export const sizeChartsAPI = {
  list: async (params?: { search?: string }) => {
    try {
      const response = await api.get('/size-charts', { params });
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  getById: async (id: string) => {
    try {
      const response = await api.get(`/size-charts/${id}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  create: async (data: any) => {
    try {
      const response = await api.post('/size-charts', data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (id: string, data: any) => {
    try {
      const response = await api.put(`/size-charts/${id}`, data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (id: string) => {
    try {
      const response = await api.delete(`/size-charts/${id}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
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
    // Backend returns { success: true, data: orderData }
    // Extract and return the order data in the format expected by frontend
    if (response.data?.success && response.data?.data) {
      return { data: response.data.data };
    }
    // Fallback for non-standard responses
    return response.data?.data ? { data: response.data.data } : response.data;
  },
  confirmOrder: async (id: string) => {
    const response = await api.post(`/orders/${id}/confirm`);
    return response.data;
  },
  updateStatus: async (id: string, status: string, notes?: string) => {
    const response = await api.put(`/orders/${id}/status`, { status, notes });
    return response.data;
  },
  updateNotes: async (id: string, notes: string) => {
    const response = await api.put(`/orders/${id}/notes`, { notes });
    return response.data;
  },
  sendEmail: async (id: string, type: 'confirmation' | 'update' | 'invoice', options?: { subject?: string; content?: string }) => {
    const payload: any = { type };
    if (options?.subject) payload.subject = options.subject;
    if (options?.content) payload.content = options.content;
    const response = await api.post(`/orders/${id}/send-email`, payload);
    return response.data;
  },
};

// Payments API
export const paymentsAPI = {
  verifyRazorpay: async (orderId: string, paymentId: string) => {
    const response = await api.post('/payments/razorpay/verify-admin', { orderId, paymentId });
    return response.data;
  },
  verifyUPI: async (orderId: string, upiPaymentId: string, notes?: string) => {
    const response = await api.post('/payments/upi/verify', { orderId, upiPaymentId, notes });
    return response.data;
  },
  verifyManual: async (orderId: string, notes?: string) => {
    const response = await api.post('/payments/manual/verify', { orderId, notes });
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

// Pages API
export const pagesAPI = {
  getAll: async () => {
    const response = await api.get('/pages/admin/all');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/pages/admin/${id}`);
    return response.data;
  },
  create: async (pageData: any) => {
    const response = await api.post('/pages', pageData);
    return response.data;
  },
  update: async (id: string, pageData: any) => {
    const response = await api.put(`/pages/${id}`, pageData);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/pages/${id}`);
    return response.data;
  },
  getTemplates: async () => {
    const response = await api.get('/pages/templates');
    return response.data;
  },
  getBlockTypes: async () => {
    const response = await api.get('/pages/block-types');
    return response.data;
  },
  generateBlockContent: async (blockType: string, pageTitle?: string, pageDescription?: string, customPrompt?: string, existingData?: any) => {
    const response = await api.post('/pages/generate-block-content', {
      blockType,
      pageTitle,
      pageDescription,
      customPrompt,
      existingData,
    });
    return response.data;
  },
};

// Reviews API
export const reviewsAPI = {
  getAll: async (params?: { productId?: string; approved?: boolean; page?: number; limit?: number }) => {
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
  generateProfileImage: async (customerName: string, description?: string) => {
    const response = await api.post('/reviews/generate-profile-image', {
      customerName,
      description,
    });
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
  createShipment: async (orderId: string, options?: {
    warehouseId?: string;
    shippingProvider?: 'shiprocket' | 'delhivery' | 'manual';
    trackingId?: string;
    carrierName?: string;
    trackingUrl?: string;
    storeId?: string;
  }) => {
    // Clean up the payload - remove undefined/null/empty string values
    const payload: any = { orderId };
    if (options) {
      Object.keys(options).forEach(key => {
        const value = (options as any)[key];
        if (value !== undefined && value !== null && value !== '') {
          payload[key] = value;
        }
      });
    }
    const response = await api.post('/shipping/create-shipment', payload);
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
  trackShipment: async (trackingId: string, provider?: 'shiprocket' | 'delhivery') => {
    const response = await api.get(`/shipping/track/${trackingId}${provider ? `?provider=${provider}` : ''}`);
    return response.data;
  },
  getProviders: async () => {
    const response = await api.get('/shipping/providers');
    return response.data;
  },
  getWarehouses: async () => {
    const response = await api.get('/shipping/warehouses');
    return response.data;
  },
  getCourierRates: async (orderId: string, warehouseId?: string) => {
    const params = new URLSearchParams({ orderId });
    if (warehouseId) {
      // Ensure warehouseId is a string, not an object
      const warehouseIdStr = typeof warehouseId === 'object' 
        ? (warehouseId as any)?._id || String(warehouseId)
        : String(warehouseId);
      if (warehouseIdStr && warehouseIdStr !== 'undefined' && warehouseIdStr !== '[object Object]') {
        params.append('warehouseId', warehouseIdStr);
      }
    }
    const response = await api.get(`/shipping/courier-rates?${params.toString()}`);
    return response.data;
  },
    getDelhiveryRates: async (orderId: string, warehouseId?: string, serviceType?: 'express' | 'surface') => {
      const params = new URLSearchParams({ orderId });
      if (warehouseId) {
        // Ensure warehouseId is a string, not an object
        const warehouseIdStr = typeof warehouseId === 'object' 
          ? (warehouseId as any)?._id || String(warehouseId)
          : String(warehouseId);
        if (warehouseIdStr && warehouseIdStr !== 'undefined' && warehouseIdStr !== '[object Object]') {
          params.append('warehouseId', warehouseIdStr);
        }
      }
      if (serviceType) {
        params.append('serviceType', serviceType);
      }
      const response = await api.get(`/shipping/delhivery-rates?${params.toString()}`);
      return response.data;
    },
};

// Shipments API
export const shipmentsAPI = {
  getAll: async (params?: {
    status?: string;
    warehouseId?: string;
    shippingProvider?: 'shiprocket' | 'delhivery' | 'manual';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/shipments', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/shipments/${id}`);
    return response.data;
  },
  create: async (data: {
    orderIds: string[];
    warehouseId: string;
    shippingProvider: 'shiprocket' | 'delhivery' | 'manual';
    notes?: string;
    manualTrackingId?: string;
    manualCarrierName?: string;
    manualTrackingUrl?: string;
  }) => {
    const response = await api.post('/shipments', data);
    return response.data;
  },
  addOrders: async (id: string, orderIds: string[]) => {
    const response = await api.post(`/shipments/${id}/add-orders`, { orderIds });
    return response.data;
  },
  schedulePickup: async (id: string, data: {
    scheduledDate: string;
    pickupTimeSlot?: string;
    notes?: string;
  }) => {
    const response = await api.post(`/shipments/${id}/schedule-pickup`, data);
    return response.data;
  },
  generateAWB: async (id: string) => {
    const response = await api.post(`/shipments/${id}/generate-awb`);
    return response.data;
  },
  updateStatus: async (id: string, status: string, notes?: string) => {
    const response = await api.put(`/shipments/${id}/status`, { status, notes });
    return response.data;
  },
  fetchStatusUpdates: async () => {
    const response = await api.post('/shipments/fetch-status-updates');
    return response.data;
  },
  downloadLabel: async (id: string) => {
    const response = await api.get(`/shipments/${id}/download-label`, {
      responseType: 'blob', // For PDF download
      headers: {
        'Accept': 'application/pdf',
      },
    });
    // Create download link
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    const contentDisposition = response.headers['content-disposition'];
    const filename = contentDisposition
      ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || `label-${id}.pdf`
      : `label-${id}.pdf`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  downloadPickupReceipt: async (id: string) => {
    const response = await api.get(`/shipments/${id}/download-pickup-receipt`, {
      responseType: 'blob', // For PDF download
      headers: {
        'Accept': 'application/pdf',
      },
    });
    // Create download link
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    const contentDisposition = response.headers['content-disposition'];
    const filename = contentDisposition
      ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || `pickup-receipt-${id}.pdf`
      : `pickup-receipt-${id}.pdf`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

// Warehouses API
export const warehousesAPI = {
  getAll: async () => {
    const response = await api.get('/warehouses/stores/link');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/warehouses/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/warehouses', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/warehouses/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/warehouses/${id}`);
    return response.data;
  },
  linkStores: async (id: string, storeIndices: number[]) => {
    const response = await api.post(`/warehouses/${id}/link-stores`, { storeIndices });
    return response.data;
  },
  createFromStore: async (storeIndex: number, options?: { code?: string; contact?: { name?: string; phone?: string; email?: string } }) => {
    const response = await api.post('/warehouses/create-from-store', {
      storeIndex,
      ...options,
    });
    return response.data;
  },
  syncWithStore: async (id: string, options?: { storeIndex?: number; syncAddress?: boolean; syncContact?: boolean }) => {
    const response = await api.post(`/warehouses/${id}/sync-with-store`, options || {});
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

export const smsTemplatesAPI = {
  list: async () => {
    const response = await api.get('/sms-templates');
    return response.data.data || response.data;
  },
  update: async (
    event: string,
    data: {
      content: string;
      templateId?: string;
      isEnabled?: boolean;
      variablesHint?: string[];
    }
  ) => {
    const response = await api.put(`/sms-templates/${event}`, data);
    return response.data.data || response.data;
  },
};

export const smsConfigAPI = {
  get: async () => {
    const response = await api.get('/sms-config');
    return response.data.data || response.data;
  },
  update: async (data: {
    baseUrl?: string;
    route?: string;
    senderId?: string;
    isEnabled?: boolean;
    apiKey?: string;
  }) => {
    const response = await api.put('/sms-config', data);
    return response.data.data || response.data;
  },
};

export const gstSettingsAPI = {
  get: async () => {
    const response = await api.get('/settings/gst');
    return response.data.data || response.data;
  },
  update: async (data: {
    showPriceIncludingGst?: boolean;
    showGstOnCheckout?: boolean;
    taxBrackets?: Array<{ name: string; rate: number; isActive: boolean }>;
    stores?: Array<{ name: string; address: string; pincode: string; state: string; gstin?: string; isActive: boolean }>;
  }) => {
    const response = await api.put('/settings/gst', data);
    return response.data.data || response.data;
  },
};

export const bundlesAPI = {
  list: async (params?: { active?: boolean; search?: string }) => {
    const response = await api.get('/product-bundles', { params });
    return response.data.data || response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/product-bundles/${id}`);
    return response.data.data || response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/product-bundles', data);
    return response.data.data || response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/product-bundles/${id}`, data);
    return response.data.data || response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/product-bundles/${id}`);
    return response.data;
  },
};

// Product Quantity-Based Bundles API (managed via product-bundles endpoint)
export const productQuantityBundlesAPI = {
  get: async (productId: string) => {
    const response = await api.get(`/product-bundles/product/${productId}/quantity`);
    return response.data.data || response.data;
  },
  update: async (productId: string, bundles: any[]) => {
    const response = await api.put(`/product-bundles/product/${productId}/quantity`, { bundles });
    return response.data.data || response.data;
  },
  delete: async (productId: string) => {
    const response = await api.delete(`/product-bundles/product/${productId}/quantity`);
    return response.data;
  },
};

export const cartsAPI = {
  listAdmin: async (params?: { status?: string; search?: string }) => {
    const response = await api.get('/carts/admin', { params });
    return response.data.data || response.data;
  },
  exportAdmin: async () => {
    const response = await api.get('/carts/admin/export');
    return response.data.data || response.data;
  },
  sendRecovery: async (cartId: string) => {
    const response = await api.post(`/carts/${cartId}/send-recovery`);
    return response.data;
  },
};

// Users API
export const usersAPI = {
  getAll: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
  }) => {
    const response = await api.get('/users', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },
  getOrders: async (id: string, params?: { page?: number; limit?: number }) => {
    const response = await api.get(`/users/${id}/orders`, { params });
    return response.data;
  },
  getAddresses: async (id: string) => {
    const response = await api.get(`/users/${id}/addresses`);
    return response.data;
  },
  getBrowsedProducts: async (id: string) => {
    const response = await api.get(`/users/${id}/browsed-products`);
    return response.data;
  },
  resetPassword: async (id: string, newPassword: string) => {
    const response = await api.post(`/users/${id}/reset-password`, { newPassword });
    return response.data;
  },
};

// Logs API
export const logsAPI = {
  getLogs: async (params?: {
    type?: 'error' | 'combined' | 'exceptions' | 'rejections';
    date?: string;
    limit?: number;
    level?: 'error' | 'warn' | 'info' | 'http' | 'debug';
  }) => {
    const response = await api.get('/logs', { params });
    return response.data;
  },
  getLogFiles: async () => {
    const response = await api.get('/logs/files');
    return response.data;
  },
};

// FAQs API
export const faqsAPI = {
  getAll: async (params?: { category?: string; categories?: string; active?: boolean }) => {
    const response = await api.get('/faqs', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/faqs/${id}`);
    return response.data;
  },
  create: async (data: {
    question: string;
    answer: string;
    category: string;
    displayOrder?: number;
    isActive?: boolean;
  }) => {
    const response = await api.post('/faqs', data);
    return response.data;
  },
  update: async (id: string, data: {
    question?: string;
    answer?: string;
    category?: string;
    displayOrder?: number;
    isActive?: boolean;
  }) => {
    const response = await api.put(`/faqs/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/faqs/${id}`);
    return response.data;
  },
};

export default api;
