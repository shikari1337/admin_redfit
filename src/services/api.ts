import axios from 'axios';

// API Configuration
// All requests go to api.redfit.in for consistent tenant identification
// The backend identifies tenant from the Host header or domain
const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';
const API_KEY = import.meta.env.VITE_API_KEY;

// Get API base URL from environment or use production default
let rawBaseUrl = import.meta.env.VITE_API_SERVER_URL;

// If not set, use production API URL
if (!rawBaseUrl || rawBaseUrl.trim() === '') {
  // Production default
  rawBaseUrl = 'https://api.redfit.in';
} else {
  // Remove trailing /api if it exists (handle cases where user includes it)
  if (rawBaseUrl.endsWith('/api')) {
    rawBaseUrl = rawBaseUrl.slice(0, -4);
  }
  // Remove trailing slashes
  rawBaseUrl = rawBaseUrl.replace(/\/+$/, '');
}

const API_BASE_URL = rawBaseUrl;
const API_URL = `${API_BASE_URL}/api/${API_VERSION}`;

console.log('🔧 Admin API Configuration:', {
  VITE_API_SERVER_URL: import.meta.env.VITE_API_SERVER_URL,
  VITE_API_KEY: API_KEY ? 'Present (Hidden)' : 'Missing',
  VITE_API_VERSION: import.meta.env.VITE_API_VERSION,
  PROD: import.meta.env.PROD,
  MODE: import.meta.env.MODE,
  API_BASE_URL,
  API_VERSION,
  API_URL,
  currentOrigin: window.location.origin,
  currentHostname: window.location.hostname,
  protocol: window.location.protocol,
  NOTE: 'All requests go to api.redfit.in for consistent tenant identification'
});

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY && { 'x-api-key': API_KEY }), // Add API Key if present
  },
  // Add timeout to prevent hanging requests
  timeout: 30000, // 30 seconds
});

/**
 * Normalize API response to ensure consistent format
 * Backend returns: { success: true, data: ... }
 * This function extracts the data field if present, otherwise returns the full response
 */
const normalizeResponse = (response: any): any => {
  if (!response || typeof response !== 'object') {
    return response;
  }

  // If response has success and data fields, extract data
  if (response.success !== undefined && response.data !== undefined) {
    return response.data;
  }

  // If response.data exists and has success/data structure, extract nested data
  if (response.data && typeof response.data === 'object' && response.data.success !== undefined && response.data.data !== undefined) {
    return response.data.data;
  }

  // Return as-is if no standard structure found
  return response;
};

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

// Handle auth errors and normalize responses
api.interceptors.response.use(
  (response) => {
    // Normalize response data to ensure consistent format
    if (response.data) {
      response.data = normalizeResponse(response.data);
    }
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
      const errorData = error.response?.data;
      console.error('❌ Response Error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: error.config?.baseURL + error.config?.url,
        data: errorData,
        errorCode: errorData?.code,
        errorMessage: errorData?.message,
        message: error.message,
        authorizationHeader: error.config?.headers?.Authorization ? 'Present' : 'Missing'
      });

      // Log full error data for 401 errors to help debug
      if (error.response?.status === 401) {
        console.error('❌ 401 Full Error Details:', JSON.stringify(errorData, null, 2));
      }
    }

    if (error.response?.status === 401) {
      console.log('🔒 Unauthorized response received');

      // Check if this is a session-related error
      const errorData = error.response?.data;
      const errorCode = errorData?.code;
      const errorMessage = errorData?.message || '';
      const requiresLogin = errorData?.requiresLogin !== false; // Default to true if not specified

      console.log('🔒 401 Error details:', {
        code: errorCode,
        message: errorMessage,
        requiresLogin,
        url: error.config?.url,
        data: errorData
      });

      // Session-specific error codes from backend that definitely require re-login
      const sessionErrorCodes = [
        'SESSION_EXPIRED',
        'SESSION_INVALID',
        'SESSION_MISMATCH',
        'TOKEN_EXPIRED',
        'TOKEN_INVALID',
        'AUTH_ERROR',
        'AUTH_REQUIRED'
      ];

      // Only clear token and redirect if:
      // 1. Error code indicates session/token issue
      // 2. Error message explicitly mentions session/token/login
      // 3. Backend explicitly says requiresLogin: true
      const isSessionError = sessionErrorCodes.includes(errorCode) ||
        errorMessage.toLowerCase().includes('session') ||
        errorMessage.toLowerCase().includes('token') ||
        errorMessage.toLowerCase().includes('login') ||
        errorMessage.toLowerCase().includes('authentication') ||
        (requiresLogin && errorCode);

      if (isSessionError) {
        console.log('🔒 Session/token error detected, clearing token and redirecting to login');
        localStorage.removeItem('admin_token');
        // Use setTimeout to avoid navigation during render
        setTimeout(() => {
          window.location.href = '/login';
        }, 100);
      } else {
        // Generic 401 - might be permission issue, don't clear token
        // Let the component handle the error
        console.warn('🔒 401 error (likely permission issue, not session):', {
          code: errorCode,
          message: errorMessage,
          url: error.config?.url
        });
        // Don't clear token or redirect - let the app handle it
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

// Leads API (CRM module - requires leads_manager permission)
export const leadsAPI = {
  getAll: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get('/leads', { params });
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data?.data) return data.data;
    return [];
  },
  getById: async (id: string) => {
    const response = await api.get(`/leads/${id}`);
    return response.data?.data ?? response.data;
  },
  update: async (id: string, updates: Record<string, unknown>) => {
    const response = await api.put(`/leads/${id}`, updates);
    return response.data?.data ?? response.data;
  },
};

// Staff API (Admin only - manage staff permissions)
export const staffAPI = {
  list: async () => {
    const response = await api.get('/staff');
    return response.data?.data ?? response.data ?? [];
  },
  update: async (id: string, data: { permissions?: string[]; isActive?: boolean; name?: string }) => {
    const response = await api.put(`/staff/${id}`, data);
    return response.data?.data ?? response.data;
  },
  create: async (data: { email: string; password: string; name: string; permissions?: string[] }) => {
    const response = await api.post('/staff', data);
    return response.data?.data ?? response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/staff/${id}`);
  },
};

// AI API (Page Editor module - requires page_editor permission)
export const aiAPI = {
  generateImage: async (prompt: string, context?: Record<string, unknown>) => {
    const response = await api.post('/ai/generate-image', { prompt, context });
    const data = response.data;
    if (data?.success && data.url) return data.url;
    return data?.url;
  },
};

// Content API (Page Editor module - requires page_editor permission)
export const contentAPI = {
  list: async () => {
    const response = await api.get('/content');
    const data = response.data;
    if (Array.isArray(data)) return data;
    return data?.data ?? [];
  },
  getBySlug: async (slug: string) => {
    const response = await api.get(`/content/${slug}`);
    return response.data?.data ?? response.data;
  },
  save: async (slug: string, payload: { title?: string; sections?: any[]; isActive?: boolean }) => {
    const response = await api.put(`/content/${slug}`, payload);
    return response.data?.data ?? response.data;
  },
};

// Products API
export const productsAPI = {
  getAll: async (params?: { active?: boolean; search?: string; category?: string; attributes?: string | object }) => {
    // Handle attributes parameter - if it's an object, stringify it
    const queryParams: any = { ...params };
    if (queryParams.attributes && typeof queryParams.attributes === 'object') {
      queryParams.attributes = JSON.stringify(queryParams.attributes);
    }
    const response = await api.get('/products', { params: queryParams });
    // Backend returns: { success: true, data: products[], count: number }
    // Interceptor normalizes to: products[] or { data: products[] }
    // Return as-is so frontend can handle both formats
    return response.data;
  },
  getById: async (id: string) => {
    // Backend route: GET /api/v1/products/:id
    const response = await api.get(`/products/${id}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getBySlug: async (slug: string) => {
    // Backend route: GET /api/v1/products/slug/:slug
    const response = await api.get(`/products/slug/${slug}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
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
    // Backend route: GET /api/v1/products/:id/duplicate
    // Get prefilled data for duplication (doesn't create product)
    const response = await api.get(`/products/${id}/duplicate`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  generateContent: async (id: string, sectionId: string, prompt?: string) => {
    // Backend route: POST /api/v1/products/:id/generate-content
    // Body: { sectionId: string, prompt?: string }
    const response = await api.post(`/products/${id}/generate-content`, {
      sectionId,
      ...(prompt && { prompt }),
    });
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
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
  getById: async (id: string | any) => {
    try {
      const normalizedId = typeof id === 'string' ? id.trim() : (id?.toString?.() || String(id));
      const response = await api.get(`/size-charts/${normalizedId}`);
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
  update: async (id: string | any, data: any) => {
    try {
      const normalizedId = typeof id === 'string' ? id.trim() : (id?.toString?.() || String(id));
      const response = await api.put(`/size-charts/${normalizedId}`, data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (id: string | any) => {
    try {
      const normalizedId = typeof id === 'string' ? id.trim() : (id?.toString?.() || String(id));
      const response = await api.delete(`/size-charts/${normalizedId}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
};

export const attributesAPI = {
  list: async (params?: { isActive?: boolean }) => {
    try {
      const response = await api.get('/attributes', { params });
      // Response format: { success: true, data: [...] } or array
      const data = response.data;
      if (data?.success && Array.isArray(data.data)) {
        return data.data;
      }
      return Array.isArray(data) ? data : (data?.data || []);
    } catch (error: any) {
      console.error('Failed to fetch attributes:', error);
      safeError(error);
      return [];
    }
  },
  getBySlug: async (slug: string) => {
    try {
      // Backend route: GET /api/v1/attributes/:slug
      const response = await api.get(`/attributes/${slug}`);
      // Response format: { success: true, data: {...} }
      const data = response.data;
      if (data?.success && data.data) {
        return data.data;
      }
      return data?.data || data;
    } catch (error: any) {
      safeError(error);
    }
  },
  getById: async (id: string) => {
    try {
      // Backend route: GET /api/v1/attributes/:id (using ID, not slug)
      const response = await api.get(`/attributes/${id}`);
      // Response format: { success: true, data: {...} }
      const data = response.data;
      if (data?.success && data.data) {
        return data.data;
      }
      return data?.data || data;
    } catch (error: any) {
      safeError(error);
    }
  },
  create: async (data: {
    name: string;
    slug?: string;
    type: 'text' | 'color' | 'image' | 'select';
    chartType?: 'none' | 'size' | 'color' | 'measurement' | 'table';
    description?: string;
    imageUrl?: string;
    isActive?: boolean;
    order?: number;
  }) => {
    try {
      const response = await api.post('/attributes', data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (id: string, data: {
    name?: string;
    slug?: string;
    type?: 'text' | 'color' | 'image' | 'select';
    chartType?: 'none' | 'size' | 'color' | 'measurement' | 'table';
    description?: string;
    imageUrl?: string;
    isActive?: boolean;
    order?: number;
  }) => {
    try {
      const response = await api.put(`/attributes/${id}`, data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (id: string) => {
    try {
      const response = await api.delete(`/attributes/${id}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
};

// Attribute Values API - Uses existing backend routes: /attributes/:id/values
export const attributeValuesAPI = {
  // Get values by attribute slug (public endpoint)
  // Backend route: GET /api/v1/attributes/:slug/values
  getByAttributeSlug: async (attributeSlug: string, params?: { isActive?: boolean }) => {
    try {
      const queryParams: any = {};
      if (params?.isActive !== undefined) {
        queryParams.isActive = params.isActive;
      }
      const response = await api.get(`/attributes/${attributeSlug}/values`, { params: queryParams });
      // Response format: { success: true, data: [...] } or array
      const data = response.data;
      if (data?.success && Array.isArray(data.data)) {
        return data.data;
      }
      return Array.isArray(data) ? data : (data?.data || []);
    } catch (error: any) {
      console.error('Failed to fetch attribute values:', error);
      safeError(error);
      return [];
    }
  },
  // Get values by attribute ID (for admin - needs to find attribute first)
  getAll: async (params?: { attributeId?: string | any; isActive?: boolean }) => {
    try {
      // Backend doesn't have direct /attribute-values endpoint
      // We need to get attribute slug first, then use getByAttributeSlug
      if (!params?.attributeId) {
        throw new Error('attributeId is required');
      }

      // Normalize attributeId to string (handles MongoDB ObjectId buffers/objects)
      let normalizedAttributeId: string;
      if (typeof params.attributeId === 'string') {
        normalizedAttributeId = params.attributeId.trim();
      } else if (params.attributeId && typeof params.attributeId === 'object') {
        // Handle MongoDB ObjectId objects (buffer or object with toString)
        if (params.attributeId.toString && typeof params.attributeId.toString === 'function') {
          normalizedAttributeId = params.attributeId.toString();
        } else if (params.attributeId._id) {
          normalizedAttributeId = String(params.attributeId._id);
        } else if (params.attributeId.id) {
          normalizedAttributeId = String(params.attributeId.id);
        } else {
          throw new Error('Invalid attributeId format');
        }
      } else {
        normalizedAttributeId = String(params.attributeId);
      }

      if (!normalizedAttributeId) {
        throw new Error('Invalid attributeId');
      }

      // Get attribute to find its slug
      const attrResponse = await attributesAPI.getById(normalizedAttributeId);
      const attribute = attrResponse?.data || attrResponse;
      if (!attribute || !attribute.slug) {
        throw new Error('Attribute not found or missing slug');
      }

      // Use the slug-based endpoint
      return await attributeValuesAPI.getByAttributeSlug(attribute.slug, { isActive: params.isActive });
    } catch (error: any) {
      console.error('Failed to fetch attribute values:', error);
      safeError(error);
      return [];
    }
  },
  create: async (attributeId: string | any, data: {
    name: string;
    slug?: string;
    value?: string;
    description?: string;
    imageUrl?: string;
    sizeChart?: string;
    isActive?: boolean;
    order?: number;
  }) => {
    try {
      // Normalize attributeId to string (handles MongoDB ObjectId buffers/objects)
      let normalizedId: string;
      if (typeof attributeId === 'string') {
        normalizedId = attributeId.trim();
      } else if (attributeId && typeof attributeId === 'object') {
        if (attributeId.toString && typeof attributeId.toString === 'function') {
          normalizedId = attributeId.toString();
        } else if (attributeId._id) {
          normalizedId = String(attributeId._id);
        } else if (attributeId.id) {
          normalizedId = String(attributeId.id);
        } else {
          normalizedId = String(attributeId);
        }
      } else {
        normalizedId = String(attributeId);
      }

      // Backend route: POST /api/v1/attributes/:id/values
      const response = await api.post(`/attributes/${normalizedId}/values`, data);
      // Response format: { success: true, message: "...", data: {...} }
      const responseData = response.data;
      if (responseData?.success && responseData.data) {
        return responseData.data;
      }
      return responseData?.data || responseData;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (attributeId: string | any, valueId: string | any, data: {
    name?: string;
    slug?: string;
    value?: string;
    description?: string;
    imageUrl?: string;
    sizeChart?: string;
    isActive?: boolean;
    order?: number;
  }) => {
    try {
      // Normalize IDs to strings (handles MongoDB ObjectId buffers/objects)
      let normalizedAttributeId: string;
      let normalizedValueId: string;

      // Normalize attributeId
      if (typeof attributeId === 'string') {
        normalizedAttributeId = attributeId.trim();
      } else if (attributeId && typeof attributeId === 'object') {
        if (attributeId.toString && typeof attributeId.toString === 'function') {
          normalizedAttributeId = attributeId.toString();
        } else if (attributeId._id) {
          normalizedAttributeId = String(attributeId._id);
        } else if (attributeId.id) {
          normalizedAttributeId = String(attributeId.id);
        } else {
          normalizedAttributeId = String(attributeId);
        }
      } else {
        normalizedAttributeId = String(attributeId);
      }

      // Normalize valueId
      if (typeof valueId === 'string') {
        normalizedValueId = valueId.trim();
      } else if (valueId && typeof valueId === 'object') {
        if (valueId.toString && typeof valueId.toString === 'function') {
          normalizedValueId = valueId.toString();
        } else if (valueId._id) {
          normalizedValueId = String(valueId._id);
        } else if (valueId.id) {
          normalizedValueId = String(valueId.id);
        } else {
          normalizedValueId = String(valueId);
        }
      } else {
        normalizedValueId = String(valueId);
      }

      // Backend route: PUT /api/v1/attributes/:id/values/:valueId
      const response = await api.put(`/attributes/${normalizedAttributeId}/values/${normalizedValueId}`, data);
      // Response format: { success: true, message: "...", data: {...} }
      const responseData = response.data;
      if (responseData?.success && responseData.data) {
        return responseData.data;
      }
      return responseData?.data || responseData;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (attributeId: string | any, valueId: string | any) => {
    try {
      // Normalize IDs to strings (handles MongoDB ObjectId buffers/objects)
      let normalizedAttributeId: string;
      let normalizedValueId: string;

      // Normalize attributeId
      if (typeof attributeId === 'string') {
        normalizedAttributeId = attributeId.trim();
      } else if (attributeId && typeof attributeId === 'object') {
        if (attributeId.toString && typeof attributeId.toString === 'function') {
          normalizedAttributeId = attributeId.toString();
        } else if (attributeId._id) {
          normalizedAttributeId = String(attributeId._id);
        } else if (attributeId.id) {
          normalizedAttributeId = String(attributeId.id);
        } else {
          normalizedAttributeId = String(attributeId);
        }
      } else {
        normalizedAttributeId = String(attributeId);
      }

      // Normalize valueId
      if (typeof valueId === 'string') {
        normalizedValueId = valueId.trim();
      } else if (valueId && typeof valueId === 'object') {
        if (valueId.toString && typeof valueId.toString === 'function') {
          normalizedValueId = valueId.toString();
        } else if (valueId._id) {
          normalizedValueId = String(valueId._id);
        } else if (valueId.id) {
          normalizedValueId = String(valueId.id);
        } else {
          normalizedValueId = String(valueId);
        }
      } else {
        normalizedValueId = String(valueId);
      }

      // Backend route: DELETE /api/v1/attributes/:id/values/:valueId
      const response = await api.delete(`/attributes/${normalizedAttributeId}/values/${normalizedValueId}`);
      // Response format: { success: true, message: "...", data: {...} }
      const responseData = response.data;
      if (responseData?.success && responseData.data) {
        return responseData.data;
      }
      return responseData?.data || responseData;
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
    startDate?: string;
    endDate?: string;
    search?: string;
  }) => {
    const response = await api.get('/orders', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/orders/${id}`);
    return response.data;
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
  getTimeline: async (id: string) => {
    const response = await api.get(`/orders/${id}/timeline`);
    return response.data;
  },
  cancelOrder: async (id: string, reason?: string) => {
    const response = await api.post(`/orders/${id}/cancel`, { reason });
    return response.data;
  },
  exportOrders: async (params?: { status?: string; startDate?: string; endDate?: string }) => {
    const response = await api.get('/orders/export', { params, responseType: 'blob' });
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

// Upload API (tenant-specific, images optimized server-side)
export const uploadAPI = {
  listFiles: async () => {
    const response = await api.get('/upload/files');
    return Array.isArray(response.data) ? response.data : response.data?.data ?? [];
  },
  deleteFile: async (key: string) => {
    await api.delete('/upload/files', { data: { key } });
  },
  optimizeAll: async () => {
    const response = await api.post('/upload/optimize-all');
    return response.data;
  },
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
    // Backend returns: { data: reviews[], pagination: {...} }
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
  getCourierRates: async (
    orderId: string,
    warehouseId?: string,
    options?: { weight?: number; length?: number; breadth?: number; height?: number }
  ) => {
    const params = new URLSearchParams({ orderId });
    if (warehouseId) {
      const warehouseIdStr = typeof warehouseId === 'object'
        ? (warehouseId as any)?._id || String(warehouseId)
        : String(warehouseId);
      if (warehouseIdStr && warehouseIdStr !== 'undefined' && warehouseIdStr !== '[object Object]') {
        params.append('warehouseId', warehouseIdStr);
      }
    }
    if (options?.weight && options.weight > 0) params.append('weight', String(options.weight));
    if (options?.length && options.length > 0) params.append('length', String(options.length));
    if (options?.breadth && options.breadth > 0) params.append('breadth', String(options.breadth));
    if (options?.height && options.height > 0) params.append('height', String(options.height));
    const response = await api.get(`/shipping/courier-rates?${params.toString()}`);
    return response.data;
  },
  getDelhiveryRates: async (
    orderId: string,
    warehouseId?: string,
    serviceType?: 'express' | 'surface',
    options?: { weight?: number; length?: number; breadth?: number; height?: number }
  ) => {
    const params = new URLSearchParams({ orderId });
    if (warehouseId) {
      const warehouseIdStr = typeof warehouseId === 'object'
        ? (warehouseId as any)?._id || String(warehouseId)
        : String(warehouseId);
      if (warehouseIdStr && warehouseIdStr !== 'undefined' && warehouseIdStr !== '[object Object]') {
        params.append('warehouseId', warehouseIdStr);
      }
    }
    if (serviceType) params.append('serviceType', serviceType);
    if (options?.weight && options.weight > 0) params.append('weight', String(options.weight));
    if (options?.length && options.length > 0) params.append('length', String(options.length));
    if (options?.breadth && options.breadth > 0) params.append('breadth', String(options.breadth));
    if (options?.height && options.height > 0) params.append('height', String(options.height));
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
      responseType: 'blob',
      headers: { 'Accept': 'application/pdf' },
    });
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
  downloadManifest: async (id: string) => {
    const response = await api.get(`/shipments/${id}/download-manifest`, {
      responseType: 'blob',
      headers: { 'Accept': 'application/pdf' },
    });
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    const contentDisposition = response.headers['content-disposition'];
    const filename = contentDisposition
      ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || `manifest-${id}.pdf`
      : `manifest-${id}.pdf`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  syncStatusAll: async () => {
    const response = await api.post('/shipments/fetch-status-updates');
    return response.data;
  },
};

// Warehouses API
export const warehousesAPI = {
  getAll: async () => {
    const response = await api.get('/warehouses');
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
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/coupons/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/coupons', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/coupons/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/coupons/${id}`);
    return response.data;
  },
};

export const smsTemplatesAPI = {
  list: async () => {
    const response = await api.get('/sms-templates');
    return response.data;
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
    return response.data;
  },
};

export const smsConfigAPI = {
  get: async () => {
    const response = await api.get('/sms-config');
    return response.data;
  },
  update: async (data: {
    baseUrl?: string;
    route?: string;
    senderId?: string;
    isEnabled?: boolean;
    apiKey?: string;
  }) => {
    const response = await api.put('/sms-config', data);
    return response.data;
  },
};

export const gstSettingsAPI = {
  get: async () => {
    const response = await api.get('/settings/gst');
    return response.data;
  },
  update: async (data: {
    showPriceIncludingGst?: boolean;
    showGstOnCheckout?: boolean;
    taxBrackets?: Array<{ name: string; rate: number; isActive: boolean }>;
    stores?: Array<{ name: string; address: string; pincode: string; state: string; gstin?: string; isActive: boolean }>;
  }) => {
    const response = await api.put('/settings/gst', data);
    return response.data;
  },
};

export const bundlesAPI = {
  list: async (params?: { active?: boolean; search?: string }) => {
    const response = await api.get('/product-bundles', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/product-bundles/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/product-bundles', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/product-bundles/${id}`, data);
    return response.data;
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
    return response.data;
  },
  update: async (productId: string, bundles: any[]) => {
    const response = await api.put(`/product-bundles/product/${productId}/quantity`, { bundles });
    return response.data;
  },
  delete: async (productId: string) => {
    const response = await api.delete(`/product-bundles/product/${productId}/quantity`);
    return response.data;
  },
};

export const cartsAPI = {
  listAdmin: async (params?: { status?: string; search?: string }) => {
    const response = await api.get('/carts/admin', { params });
    return response.data;
  },
  exportAdmin: async () => {
    const response = await api.get('/carts/admin/export');
    return response.data;
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
    // Backend returns: { success: true, data: { logs: [], total: number, file: string, exists: boolean, filters: {} } }
    // Return as-is, let frontend handle normalization
    return response.data;
  },
  getLogFiles: async () => {
    const response = await api.get('/logs/files');
    // Backend returns: { success: true, data: { files: [], filesByType: {}, total: number } }
    // Return as-is, let frontend handle normalization
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

// Specifications API
export const specificationsAPI = {
  getAll: async (params?: { productId?: string; shared?: boolean; active?: boolean }) => {
    // Backend route: GET /api/v1/specifications
    const response = await api.get('/specifications', { params });
    // Response format: { success: true, data: [...], count: number }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getById: async (id: string) => {
    // Backend route: GET /api/v1/specifications/:id
    const response = await api.get(`/specifications/${id}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getByProductId: async (productId: string) => {
    // Backend route: GET /api/v1/specifications/product/:productId
    const response = await api.get(`/specifications/product/${productId}`);
    // Response format: { success: true, data: { type: "inline"|"linked", sections: [...] } }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  create: async (data: {
    name: string;
    slug?: string;
    productId?: string;
    sections: Array<{
      heading: string;
      items: Array<{ key: string; value: string }>;
    }>;
    isActive?: boolean;
  }) => {
    // Backend route: POST /api/v1/specifications
    const response = await api.post('/specifications', data);
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  update: async (id: string, data: {
    name?: string;
    slug?: string;
    sections?: Array<{
      heading: string;
      items: Array<{ key: string; value: string }>;
    }>;
    isActive?: boolean;
  }) => {
    // Backend route: PUT /api/v1/specifications/:id
    const response = await api.put(`/specifications/${id}`, data);
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  delete: async (id: string) => {
    // Backend route: DELETE /api/v1/specifications/:id
    const response = await api.delete(`/specifications/${id}`);
    // Response format: { success: true, message: "..." }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  assignToProduct: async (id: string, productId: string) => {
    // Backend route: POST /api/v1/specifications/:id/assign-to-product
    const response = await api.post(`/specifications/${id}/assign-to-product`, { productId });
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
};

// Tags API
export const tagsAPI = {
  getAll: async (params?: { active?: boolean; search?: string; limit?: number }) => {
    // Backend route: GET /api/v1/tags
    const response = await api.get('/tags', { params });
    // Response format: { success: true, data: [...], count: number }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getById: async (id: string) => {
    // Backend route: GET /api/v1/tags/:id
    const response = await api.get(`/tags/${id}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getBySlug: async (slug: string) => {
    // Backend route: GET /api/v1/tags/slug/:slug
    const response = await api.get(`/tags/slug/${slug}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  create: async (data: {
    name: string;
    slug?: string;
    description?: string;
    isActive?: boolean;
  }) => {
    // Backend route: POST /api/v1/tags
    const response = await api.post('/tags', data);
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  bulkCreate: async (names: string[]) => {
    // Backend route: POST /api/v1/tags/bulk-create
    const response = await api.post('/tags/bulk-create', { names });
    // Response format: { success: true, message: "...", data: [...] }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  update: async (id: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
  }) => {
    // Backend route: PUT /api/v1/tags/:id
    const response = await api.put(`/tags/${id}`, data);
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  delete: async (id: string) => {
    // Backend route: DELETE /api/v1/tags/:id
    const response = await api.delete(`/tags/${id}`);
    // Response format: { success: true, message: "..." }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
};

// ─── MODULES API ────────────────────────────────────────────────────────────
export const modulesAPI = {
  list: async () => {
    const response = await api.get('/modules');
    return response.data;
  },
  getRegistry: async () => {
    const response = await api.get('/modules/registry');
    return response.data;
  },
  toggle: async (key: string, enabled: boolean) => {
    const response = await api.put(`/modules/${key}`, { enabled });
    return response.data;
  },
  updateConfig: async (key: string, enabled: boolean, config: any) => {
    const response = await api.put(`/modules/${key}`, { enabled, config });
    return response.data;
  },
  bulkUpdate: async (modules: Array<{ key: string; enabled: boolean }>) => {
    const response = await api.post('/modules/bulk', { modules });
    return response.data;
  },
  initialize: async () => {
    const response = await api.post('/modules/initialize');
    return response.data;
  },
};

// ─── BILLING API ─────────────────────────────────────────────────────────────
export const billingAPI = {
  getInvoices: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get('/billing/invoices', { params });
    return response.data;
  },
  getInvoiceById: async (id: string) => {
    const response = await api.get(`/billing/invoices/${id}`);
    return response.data;
  },
  getUsage: async (params?: { period?: 'current' | 'last' }) => {
    const response = await api.get('/billing/usage', { params });
    return response.data;
  },
  initiatePayment: async (invoiceId: string) => {
    const response = await api.post(`/billing/pay/${invoiceId}/initiate`);
    return response.data;
  },
  verifyPayment: async (invoiceId: string, data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
    const response = await api.post(`/billing/pay/${invoiceId}/verify`, data);
    return response.data;
  },
};

// ─── B2B API ──────────────────────────────────────────────────────────────────
export const b2bAPI = {
  getAccounts: async (params?: { page?: number; limit?: number; search?: string; isActive?: boolean }) => {
    const response = await api.get('/b2b/accounts', { params });
    return response.data;
  },
  getAccountById: async (id: string) => {
    const response = await api.get(`/b2b/accounts/${id}`);
    return response.data;
  },
  createAccount: async (data: any) => {
    const response = await api.post('/b2b/accounts', data);
    return response.data;
  },
  updateAccount: async (id: string, data: any) => {
    const response = await api.put(`/b2b/accounts/${id}`, data);
    return response.data;
  },
  deleteAccount: async (id: string) => {
    const response = await api.delete(`/b2b/accounts/${id}`);
    return response.data;
  },
  getQuotes: async (params?: { page?: number; limit?: number; status?: string; accountId?: string }) => {
    const response = await api.get('/b2b/quotes', { params });
    return response.data;
  },
  getQuoteById: async (id: string) => {
    const response = await api.get(`/b2b/quotes/${id}`);
    return response.data;
  },
  createQuote: async (data: any) => {
    const response = await api.post('/b2b/quotes', data);
    return response.data;
  },
  updateQuote: async (id: string, data: any) => {
    const response = await api.put(`/b2b/quotes/${id}`, data);
    return response.data;
  },
  convertQuoteToOrder: async (id: string) => {
    const response = await api.post(`/b2b/quotes/${id}/convert-order`);
    return response.data;
  },
  // Price Lists
  getPriceLists: async () => {
    const response = await api.get('/b2b/price-lists');
    return response.data;
  },
  createPriceList: async (data: any) => {
    const response = await api.post('/b2b/price-lists', data);
    return response.data;
  },
  updatePriceList: async (id: string, data: any) => {
    const response = await api.put(`/b2b/price-lists/${id}`, data);
    return response.data;
  },
  deletePriceList: async (id: string) => {
    const response = await api.delete(`/b2b/price-lists/${id}`);
    return response.data;
  },
  // Price Rules
  getPriceRules: async (priceListId: string) => {
    const response = await api.get(`/b2b/price-lists/${priceListId}/rules`);
    return response.data;
  },
  createPriceRule: async (priceListId: string, data: any) => {
    const response = await api.post(`/b2b/price-lists/${priceListId}/rules`, data);
    return response.data;
  },
  updatePriceRule: async (priceListId: string, ruleId: string, data: any) => {
    const response = await api.put(`/b2b/price-lists/${priceListId}/rules/${ruleId}`, data);
    return response.data;
  },
  deletePriceRule: async (priceListId: string, ruleId: string) => {
    const response = await api.delete(`/b2b/price-lists/${priceListId}/rules/${ruleId}`);
    return response.data;
  },
  // MOQ Rules
  getMOQRules: async (priceListId: string) => {
    const response = await api.get(`/b2b/price-lists/${priceListId}/moq`);
    return response.data;
  },
  createMOQRule: async (priceListId: string, data: any) => {
    const response = await api.post(`/b2b/price-lists/${priceListId}/moq`, data);
    return response.data;
  },
};

// ─── MARKETING API ────────────────────────────────────────────────────────────
export const marketingAPI = {
  getCampaigns: async (params?: { page?: number; limit?: number; status?: string; channel?: string }) => {
    const response = await api.get('/marketing/campaigns', { params });
    return response.data;
  },
  getCampaignById: async (id: string) => {
    const response = await api.get(`/marketing/campaigns/${id}`);
    return response.data;
  },
  createCampaign: async (data: any) => {
    const response = await api.post('/marketing/campaigns', data);
    return response.data;
  },
  updateCampaign: async (id: string, data: any) => {
    const response = await api.put(`/marketing/campaigns/${id}`, data);
    return response.data;
  },
  deleteCampaign: async (id: string) => {
    const response = await api.delete(`/marketing/campaigns/${id}`);
    return response.data;
  },
  sendCampaign: async (id: string) => {
    const response = await api.post(`/marketing/campaigns/${id}/send`);
    return response.data;
  },
  getAbandonedCarts: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get('/marketing/abandoned-carts', { params });
    return response.data;
  },
  recoverAbandonedCart: async (id: string, channel: 'whatsapp' | 'sms' | 'email') => {
    const response = await api.post(`/marketing/abandoned-carts/recover/${id}`, { channel });
    return response.data;
  },
};

// ─── CRM API ──────────────────────────────────────────────────────────────────
export const crmAPI = {
  getContacts: async (params?: { page?: number; limit?: number; search?: string; tag?: string }) => {
    const response = await api.get('/crm/contacts', { params });
    return response.data;
  },
  getContactById: async (id: string) => {
    const response = await api.get(`/crm/contacts/${id}`);
    return response.data;
  },
  createContact: async (data: any) => {
    const response = await api.post('/crm/contacts', data);
    return response.data;
  },
  updateContact: async (id: string, data: any) => {
    const response = await api.put(`/crm/contacts/${id}`, data);
    return response.data;
  },
  deleteContact: async (id: string) => {
    const response = await api.delete(`/crm/contacts/${id}`);
    return response.data;
  },
  getInteractions: async (contactId: string) => {
    const response = await api.get(`/crm/contacts/${contactId}/interactions`);
    return response.data;
  },
  addInteraction: async (contactId: string, data: any) => {
    const response = await api.post(`/crm/contacts/${contactId}/interactions`, data);
    return response.data;
  },
};

// ─── PACKAGE BOXES API ────────────────────────────────────────────────────────
export const packageBoxesAPI = {
  getAll: async () => {
    const response = await api.get('/packages');
    return response.data;
  },
  create: async (data: { name: string; length: number; breadth: number; height: number; weight?: number; description?: string }) => {
    const response = await api.post('/packages', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/packages/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/packages/${id}`);
    return response.data;
  },
};

// ─── INVENTORY API ────────────────────────────────────────────────────────────
export const inventoryAPI = {
  list: async (params?: { page?: number; limit?: number; search?: string; lowStock?: boolean; outOfStock?: boolean }) => {
    const response = await api.get('/inventory', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/inventory/${id}`);
    return response.data;
  },
  updateStock: async (id: string, data: { stock?: number; variationIndex?: number; variationStock?: number; reason?: string }) => {
    const response = await api.put(`/inventory/${id}`, data);
    return response.data;
  },
  bulkUpdate: async (updates: Array<{ productId: string; stock: number }>) => {
    const response = await api.post('/inventory/bulk-update', { updates });
    return response.data;
  },
  getLowStock: async (threshold?: number) => {
    const response = await api.get('/inventory/low-stock', { params: { threshold } });
    return response.data;
  },
  getHistory: async (productId: string) => {
    const response = await api.get(`/inventory/${productId}/history`);
    return response.data;
  },
};

// ─── TAX RULES API ────────────────────────────────────────────────────────────
export const taxRulesAPI = {
  getAll: async () => {
    const response = await api.get('/tax');
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/tax', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/tax/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/tax/${id}`);
    return response.data;
  },
};

// ─── PAYMENT RULES API ───────────────────────────────────────────────────────
export const paymentRulesAPI = {
  getAll: async () => {
    const response = await api.get('/payment/rules');
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/payment/rules', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/payment/rules/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/payment/rules/${id}`);
    return response.data;
  },
};

// ─── SHIPPING ZONES API ──────────────────────────────────────────────────────
export const shippingZonesAPI = {
  getAll: async () => {
    const response = await api.get('/shipping/zones');
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/shipping/zones', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/shipping/zones/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/shipping/zones/${id}`);
    return response.data;
  },
};

// ─── PINCODE ZONES API ───────────────────────────────────────────────────────
export const pincodeZonesAPI = {
  getAll: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await api.get('/shipping/pincode-zones', { params });
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/shipping/pincode-zones', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/shipping/pincode-zones/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/shipping/pincode-zones/${id}`);
    return response.data;
  },
  bulkImport: async (zones: any[]) => {
    const response = await api.post('/shipping/pincode-zones/bulk', { zones });
    return response.data;
  },
};

// ─── VARIANT GROUPS API ──────────────────────────────────────────────────────
export const variantGroupsAPI = {
  getAll: async () => {
    const response = await api.get('/variant-groups');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/variant-groups/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/variant-groups', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/variant-groups/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/variant-groups/${id}`);
    return response.data;
  },
};

// ─── SEO API ─────────────────────────────────────────────────────────────────
export const seoAPI = {
  get: async () => {
    const response = await api.get('/seo');
    return response.data;
  },
  update: async (data: any) => {
    const response = await api.put('/seo', data);
    return response.data;
  },
  getRedirects: async () => {
    const response = await api.get('/seo/redirects');
    return response.data;
  },
  createRedirect: async (data: { from: string; to: string; type?: 301 | 302 }) => {
    const response = await api.post('/seo/redirects', data);
    return response.data;
  },
  deleteRedirect: async (id: string) => {
    const response = await api.delete(`/seo/redirects/${id}`);
    return response.data;
  },
  generateSitemap: async () => {
    const response = await api.post('/seo/sitemap/generate');
    return response.data;
  },
};

// ─── PLUGINS API ─────────────────────────────────────────────────────────────
export const pluginsAPI = {
  getAll: async () => {
    const response = await api.get('/plugins');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/plugins/${id}`);
    return response.data;
  },
  install: async (data: { name: string; source?: string }) => {
    const response = await api.post('/plugins', data);
    return response.data;
  },
  toggle: async (id: string, enabled: boolean) => {
    const response = await api.put(`/plugins/${id}/toggle`, { enabled });
    return response.data;
  },
  configure: async (id: string, config: Record<string, any>) => {
    const response = await api.put(`/plugins/${id}/config`, { config });
    return response.data;
  },
  uninstall: async (id: string) => {
    const response = await api.delete(`/plugins/${id}`);
    return response.data;
  },
};

export default api;
