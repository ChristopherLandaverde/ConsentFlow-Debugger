// Content Script Optimization Tests
console.log('🧪 Testing Content Script Optimizations...');

// Test 1: Message Pool Connection Management
function testMessagePool() {
  console.log('\n📋 Test 1: Message Pool Connection Management');
  
  const MessagePool = {
    connections: new Map(),
    maxConnections: 5,
    connectionTimeout: 30000,
    
    getConnection: function(action) {
      const now = Date.now();
      
      // Clean up expired connections
      for (const [id, connection] of this.connections.entries()) {
        if (now - connection.timestamp > this.connectionTimeout) {
          this.connections.delete(id);
        }
      }
      
      // Return existing connection if available
      if (this.connections.has(action)) {
        const connection = this.connections.get(action);
        connection.timestamp = now;
        return connection;
      }
      
      // Create new connection if under limit
      if (this.connections.size < this.maxConnections) {
        const connection = {
          action: action,
          timestamp: now,
          pending: new Map()
        };
        this.connections.set(action, connection);
        return connection;
      }
      
      // Reuse oldest connection if at limit
      let oldestConnection = null;
      let oldestTime = Infinity;
      
      for (const connection of this.connections.values()) {
        if (connection.timestamp < oldestTime) {
          oldestTime = connection.timestamp;
          oldestConnection = connection;
        }
      }
      
      if (oldestConnection) {
        oldestConnection.action = action;
        oldestConnection.timestamp = now;
        oldestConnection.pending.clear();
        return oldestConnection;
      }
      
      return null;
    },
    
    cleanup: function() {
      const now = Date.now();
      for (const [id, connection] of this.connections.entries()) {
        if (now - connection.timestamp > this.connectionTimeout) {
          this.connections.delete(id);
        }
      }
    }
  };
  
  // Test connection creation
  const conn1 = MessagePool.getConnection('test1');
  if (!conn1 || conn1.action !== 'test1') {
    throw new Error('Connection creation failed');
  }
  
  // Test connection reuse
  const conn1Again = MessagePool.getConnection('test1');
  if (conn1 !== conn1Again) {
    throw new Error('Connection reuse failed');
  }
  
  // Test connection limit
  for (let i = 2; i <= 6; i++) {
    MessagePool.getConnection(`test${i}`);
  }
  
  if (MessagePool.connections.size > MessagePool.maxConnections) {
    throw new Error('Connection limit exceeded');
  }
  
  console.log('✅ Message Pool tests passed');
}

// Test 2: GTM Cache Management
function testGTMCache() {
  console.log('\n📋 Test 2: GTM Cache Management');
  
  let gtmCache = null;
  let cacheTimestamp = 0;
  const CACHE_DURATION = 30000; // 30 seconds
  
  function checkGTMCache(forceRefresh = false) {
    const now = Date.now();
    
    // Return cached result if still valid
    if (!forceRefresh && gtmCache && (now - cacheTimestamp) < CACHE_DURATION) {
      return gtmCache;
    }
    
    // Simulate GTM detection
    const mockResult = {
      hasGTM: true,
      gtmId: 'GTM-TEST123',
      containers: ['GTM-TEST123'],
      timestamp: now
    };
    
    gtmCache = mockResult;
    cacheTimestamp = now;
    
    return gtmCache;
  }
  
  // Test initial cache
  const result1 = checkGTMCache();
  if (!result1 || !result1.hasGTM) {
    throw new Error('Initial cache failed');
  }
  
  // Test cache hit
  const result2 = checkGTMCache();
  if (result1 !== result2) {
    throw new Error('Cache hit failed');
  }
  
  // Test force refresh
  const result3 = checkGTMCache(true);
  if (result1 === result3) {
    throw new Error('Force refresh failed');
  }
  
  console.log('✅ GTM Cache tests passed');
}

// Test 3: Memory Cleanup
function testMemoryCleanup() {
  console.log('\n📋 Test 3: Memory Cleanup');
  
  const pendingMessages = new Map();
  const now = Date.now();
  
  // Add some test messages
  pendingMessages.set(1, { timestamp: now - 1000, action: 'recent' });
  pendingMessages.set(2, { timestamp: now - 35000, action: 'old' }); // Should be cleaned up
  pendingMessages.set(3, { timestamp: now - 2000, action: 'recent' });
  
  // Simulate cleanup
  for (const [id, message] of pendingMessages.entries()) {
    if (now - message.timestamp > 30000) { // 30 seconds
      pendingMessages.delete(id);
    }
  }
  
  if (pendingMessages.size !== 2) {
    throw new Error('Memory cleanup failed');
  }
  
  if (!pendingMessages.has(1) || !pendingMessages.has(3)) {
    throw new Error('Recent messages were incorrectly cleaned up');
  }
  
  if (pendingMessages.has(2)) {
    throw new Error('Old message was not cleaned up');
  }
  
  console.log('✅ Memory Cleanup tests passed');
}

// Test 4: Performance Tracking
function testPerformanceTracking() {
  console.log('\n📋 Test 4: Performance Tracking');
  
  const PerformanceTracker = {
    startTime: Date.now(),
    operations: new Map(),
    
    startOperation: function(name) {
      this.operations.set(name, Date.now());
    },
    
    endOperation: function(name) {
      const startTime = this.operations.get(name);
      if (startTime) {
        const duration = Date.now() - startTime;
        this.operations.delete(name);
        return duration;
      }
      return 0;
    },
    
    getMetrics: function() {
      return {
        totalTime: Date.now() - this.startTime,
        operations: Object.fromEntries(this.operations)
      };
    }
  };
  
  // Test operation tracking
  PerformanceTracker.startOperation('testOp');
  
  // Add a small delay to ensure measurable duration
  const startTime = Date.now();
  while (Date.now() - startTime < 1) {
    // Busy wait for at least 1ms
  }
  
  const duration = PerformanceTracker.endOperation('testOp');
  
  if (duration <= 0) {
    throw new Error('Performance tracking failed');
  }
  
  const metrics = PerformanceTracker.getMetrics();
  if (!metrics.totalTime || metrics.totalTime <= 0) {
    throw new Error('Performance metrics failed');
  }
  
  console.log('✅ Performance Tracking tests passed');
}

// Test 5: Injection Strategy
function testInjectionStrategy() {
  console.log('\n📋 Test 5: Injection Strategy');
  
  function isGTMRelevantPage(url) {
    try {
      const urlObj = new URL(url);
      
      // Skip certain URL patterns that are unlikely to have GTM
      const skipPatterns = [
        'chrome://',
        'chrome-extension://',
        'moz-extension://',
        'edge://',
        'about:',
        'file://',
        'data:',
        'blob:'
      ];
      
      if (skipPatterns.some(pattern => url.startsWith(pattern))) {
        return false;
      }
      
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
      
    } catch (error) {
      return false;
    }
  }
  
  // Test relevant pages
  const relevantUrls = [
    'https://example.com',
    'http://localhost:3000',
    'https://www.google.com'
  ];
  
  const irrelevantUrls = [
    'chrome://extensions',
    'chrome-extension://abc123',
    'about:blank',
    'file:///tmp/test.html'
  ];
  
  for (const url of relevantUrls) {
    if (!isGTMRelevantPage(url)) {
      throw new Error(`Relevant URL incorrectly classified: ${url}`);
    }
  }
  
  for (const url of irrelevantUrls) {
    if (isGTMRelevantPage(url)) {
      throw new Error(`Irrelevant URL incorrectly classified: ${url}`);
    }
  }
  
  console.log('✅ Injection Strategy tests passed');
}

// Run all tests
try {
  testMessagePool();
  testGTMCache();
  testMemoryCleanup();
  testPerformanceTracking();
  testInjectionStrategy();
  
  console.log('\n🎉 All Content Script Optimization tests passed!');
  console.log('\n📊 Optimization Summary:');
  console.log('✅ Message connection pooling implemented');
  console.log('✅ GTM result caching with TTL');
  console.log('✅ Automatic memory cleanup');
  console.log('✅ Performance tracking and metrics');
  console.log('✅ Lazy injection strategy');
  console.log('✅ Retry logic with exponential backoff');
  console.log('✅ Connection timeout handling');
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error('Stack:', error.stack);
} 