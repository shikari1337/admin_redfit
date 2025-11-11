/**
 * Admin-Backend Integration Test Script
 * Tests all admin components and their integration with backend APIs
 */

const API_BASE_URL = process.env.VITE_API_SERVER_URL || 'http://localhost:3000';
const API_VERSION = process.env.VITE_API_VERSION || 'v1';
const API_URL = `${API_BASE_URL}/api/${API_VERSION}`;

let authToken = null;

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper functions
const log = (message, type = 'info') => {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[type]}${message}${colors.reset}`);
};

const test = async (name, fn) => {
  try {
    log(`\n🧪 Testing: ${name}`, 'info');
    await fn();
    results.passed.push(name);
    log(`✅ PASSED: ${name}`, 'success');
  } catch (error) {
    results.failed.push({ name, error: error.message });
    log(`❌ FAILED: ${name} - ${error.message}`, 'error');
  }
};

const warn = (message) => {
  results.warnings.push(message);
  log(`⚠️  WARNING: ${message}`, 'warning');
};

// API request helper
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken && { Authorization: `Bearer ${authToken}` }),
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
  }

  return response.json();
};

// Test 1: Health Check
test('Backend Health Check', async () => {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error('Backend health check failed');
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error('Backend health check returned unsuccessful');
  }
});

// Test 2: Authentication
test('Admin Login', async () => {
  const testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@redfit.in';
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';
  
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });

  if (!response.success || !response.data?.token) {
    throw new Error('Login failed - invalid credentials or response format');
  }

  authToken = response.data.token;
  log(`   Token received: ${authToken.substring(0, 20)}...`);
});

// Test 3: Get Current User
test('Get Current User (Auth Me)', async () => {
  const response = await apiRequest('/auth/me');
  if (!response.success || !response.data) {
    throw new Error('Failed to get current user');
  }
  log(`   User: ${response.data.email || 'N/A'}`);
});

// Test 4: Products API
test('Products - List All', async () => {
  const response = await apiRequest('/products');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid products response format');
  }
  const products = response.data || response;
  log(`   Found ${products.length} products`);
});

test('Products - Get by ID (if exists)', async () => {
  const listResponse = await apiRequest('/products');
  const products = listResponse.data || listResponse;
  if (products.length > 0) {
    const productId = products[0]._id || products[0].id;
    const response = await apiRequest(`/products/${productId}`);
    if (!response.success && !response.data) {
      throw new Error('Failed to get product by ID');
    }
    log(`   Product: ${response.data?.name || response.name || 'N/A'}`);
  } else {
    warn('No products found to test get by ID');
  }
});

// Test 5: Categories API
test('Categories - List All', async () => {
  const response = await apiRequest('/categories');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid categories response format');
  }
  const categories = response.data || response;
  log(`   Found ${categories.length} categories`);
});

// Test 6: Size Charts API
test('Size Charts - List All', async () => {
  const response = await apiRequest('/size-charts');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid size charts response format');
  }
  const sizeCharts = response.data || response;
  log(`   Found ${sizeCharts.length} size charts`);
});

// Test 7: Orders API
test('Orders - List All', async () => {
  const response = await apiRequest('/orders');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid orders response format');
  }
  const orders = response.data || response;
  log(`   Found ${orders.length} orders`);
});

// Test 8: Coupons API
test('Coupons - Admin List', async () => {
  const response = await apiRequest('/coupons/admin');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid coupons response format');
  }
  const coupons = response.data || response;
  log(`   Found ${coupons.length} coupons`);
});

// Test 9: Product Bundles API
test('Product Bundles - List All', async () => {
  const response = await apiRequest('/product-bundles');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid bundles response format');
  }
  const bundles = response.data || response;
  log(`   Found ${bundles.length} bundles`);
});

// Test 10: Carts API
test('Carts - Admin List', async () => {
  const response = await apiRequest('/carts/admin');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid carts response format');
  }
  const carts = response.data || response;
  log(`   Found ${carts.length} carts`);
});

// Test 11: Reviews API
test('Reviews - List All', async () => {
  const response = await apiRequest('/reviews');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid reviews response format');
  }
  const reviews = response.data || response;
  log(`   Found ${reviews.length} reviews`);
});

// Test 12: SMS Templates API
test('SMS Templates - List All', async () => {
  const response = await apiRequest('/sms-templates');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid SMS templates response format');
  }
  const templates = response.data || response;
  log(`   Found ${templates.length} SMS templates`);
});

// Test 13: SMS Config API
test('SMS Config - Get', async () => {
  const response = await apiRequest('/sms-config');
  if (!response.success && !response.data) {
    throw new Error('Invalid SMS config response format');
  }
  log(`   SMS Config exists`);
});

// Test 14: Upload API (Test endpoint exists)
test('Upload - Endpoint Check', async () => {
  // Just check if endpoint exists (will fail without file, but that's expected)
  try {
    await apiRequest('/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  } catch (error) {
    // Expected to fail without file, but should be 400/422, not 404
    if (error.message.includes('404')) {
      throw new Error('Upload endpoint not found');
    }
    // Other errors are acceptable (validation, etc.)
  }
  log(`   Upload endpoint exists`);
});

// Test 15: Settings API
test('Settings - Get', async () => {
  const response = await apiRequest('/settings');
  // Settings might not exist, so just check it doesn't 404
  log(`   Settings endpoint accessible`);
});

// Test 16: FAQs API
test('FAQs - List All', async () => {
  const response = await apiRequest('/faqs');
  if (!response.success && !Array.isArray(response.data)) {
    throw new Error('Invalid FAQs response format');
  }
  const faqs = response.data || response;
  log(`   Found ${faqs.length} FAQs`);
});

// Run all tests
const runTests = async () => {
  log('\n🚀 Starting Admin-Backend Integration Tests', 'info');
  log(`API URL: ${API_URL}`, 'info');
  log(`API Base: ${API_BASE_URL}`, 'info');
  log('='.repeat(60), 'info');

  // Run all tests sequentially
  await test('Backend Health Check', async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) throw new Error('Backend health check failed');
    const data = await response.json();
    if (!data.success) throw new Error('Backend health check returned unsuccessful');
  });

  await test('Admin Login', async () => {
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@redfit.in';
    const testPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';
    
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });

    if (!response.success || !response.data?.token) {
      throw new Error('Login failed - invalid credentials or response format');
    }

    authToken = response.data.token;
    log(`   Token received: ${authToken.substring(0, 20)}...`);
  });

  if (!authToken) {
    log('\n❌ Authentication failed. Skipping authenticated tests.', 'error');
    return;
  }

  // Continue with authenticated tests...
  await test('Get Current User (Auth Me)', async () => {
    const response = await apiRequest('/auth/me');
    if (!response.success || !response.data) {
      throw new Error('Failed to get current user');
    }
    log(`   User: ${response.data.email || 'N/A'}`);
  });

  await test('Products - List All', async () => {
    const response = await apiRequest('/products');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid products response format');
    }
    const products = response.data || response;
    log(`   Found ${products.length} products`);
  });

  await test('Categories - List All', async () => {
    const response = await apiRequest('/categories');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid categories response format');
    }
    const categories = response.data || response;
    log(`   Found ${categories.length} categories`);
  });

  await test('Size Charts - List All', async () => {
    const response = await apiRequest('/size-charts');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid size charts response format');
    }
    const sizeCharts = response.data || response;
    log(`   Found ${sizeCharts.length} size charts`);
  });

  await test('Orders - List All', async () => {
    const response = await apiRequest('/orders');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid orders response format');
    }
    const orders = response.data || response;
    log(`   Found ${orders.length} orders`);
  });

  await test('Coupons - Admin List', async () => {
    const response = await apiRequest('/coupons/admin');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid coupons response format');
    }
    const coupons = response.data || response;
    log(`   Found ${coupons.length} coupons`);
  });

  await test('Product Bundles - List All', async () => {
    const response = await apiRequest('/product-bundles');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid bundles response format');
    }
    const bundles = response.data || response;
    log(`   Found ${bundles.length} bundles`);
  });

  await test('Carts - Admin List', async () => {
    const response = await apiRequest('/carts/admin');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid carts response format');
    }
    const carts = response.data || response;
    log(`   Found ${carts.length} carts`);
  });

  await test('Reviews - List All', async () => {
    const response = await apiRequest('/reviews');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid reviews response format');
    }
    const reviews = response.data || response;
    log(`   Found ${reviews.length} reviews`);
  });

  await test('SMS Templates - List All', async () => {
    const response = await apiRequest('/sms-templates');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid SMS templates response format');
    }
    const templates = response.data || response;
    log(`   Found ${templates.length} SMS templates`);
  });

  await test('SMS Config - Get', async () => {
    const response = await apiRequest('/sms-config');
    if (!response.success && !response.data) {
      throw new Error('Invalid SMS config response format');
    }
    log(`   SMS Config exists`);
  });

  await test('FAQs - List All', async () => {
    const response = await apiRequest('/faqs');
    if (!response.success && !Array.isArray(response.data)) {
      throw new Error('Invalid FAQs response format');
    }
    const faqs = response.data || response;
    log(`   Found ${faqs.length} FAQs`);
  });

  // Print summary
  log('\n' + '='.repeat(60), 'info');
  log('\n📊 Test Summary', 'info');
  log(`✅ Passed: ${results.passed.length}`, 'success');
  log(`❌ Failed: ${results.failed.length}`, results.failed.length > 0 ? 'error' : 'info');
  log(`⚠️  Warnings: ${results.warnings.length}`, results.warnings.length > 0 ? 'warning' : 'info');

  if (results.failed.length > 0) {
    log('\n❌ Failed Tests:', 'error');
    results.failed.forEach(({ name, error }) => {
      log(`   - ${name}: ${error}`, 'error');
    });
  }

  if (results.warnings.length > 0) {
    log('\n⚠️  Warnings:', 'warning');
    results.warnings.forEach(warning => {
      log(`   - ${warning}`, 'warning');
    });
  }

  log('\n' + '='.repeat(60), 'info');
  
  if (results.failed.length === 0) {
    log('\n🎉 All tests passed!', 'success');
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'error');
    process.exit(1);
  }
};

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    log(`\n💥 Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

export { runTests, test, apiRequest };

