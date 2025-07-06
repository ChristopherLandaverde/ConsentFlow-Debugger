// content.js - Optimized with enhanced performance and memory management
console.log('🔍 GTM Consent Inspector: Content script loading...OPTIMIZED');

// Enhanced error handling and performance monitoring
const ErrorTracker = {
  errors: [],
  maxErrors: 50,
  
  addError: function(error, context = 'content-script') {
    const errorEntry = {
      message: error.message || error,
      context: context,
      timestamp: Date.now(),
      stack: error.stack
    };
    
    this.errors.push(errorEntry);
    
    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
    
    console.error(`❌ Error in ${context}:`, error);
  },
  
  getErrors: function() {
    return this.errors;
  },
  
  clearErrors: function() {
    this.errors = [];
  }
};

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
      console.log(`⏱️ ${name} took ${duration}ms`);
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

// Connection pooling for message passing
const MessagePool = {
  connections: new Map(),
  maxConnections: 5,
  connectionTimeout: 30000, // 30 seconds
  
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

// State management
let isInjected = false;
let messageId = 0;
let pendingMessages = new Map();
let isInitialized = false;
let gtmCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 seconds

// Optimized script injection with retry logic
function injectPageScript() {
  if (isInjected) {
    console.log('🔧 Page script already injected, skipping...');
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    console.log('🔧 Injecting page context script...');
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected-script.js');
    
    const timeout = setTimeout(() => {
      script.remove();
      reject(new Error('Script injection timeout'));
    }, 10000);
    
    script.onload = function() {
      clearTimeout(timeout);
      console.log('✅ Page context script injected successfully');
      script.remove();
      isInjected = true;
      resolve();
    };
    
    script.onerror = function() {
      clearTimeout(timeout);
      console.error('❌ Failed to inject page context script');
      reject(new Error('Script injection failed'));
    };
    
    (document.head || document.documentElement).appendChild(script);
  });
}

// Optimized message passing with connection pooling
function sendMessageToPage(action, data = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    
    PerformanceTracker.startOperation(`message-${action}`);
    console.log(`📤 Sending message to page: ${action} (ID: ${id})`);
    
    try {
      // Get or create connection
      const connection = MessagePool.getConnection(action);
      if (!connection) {
        throw new Error('No available message connections');
      }
      
      // Store the promise resolver
      pendingMessages.set(id, { resolve, reject, action, timestamp: Date.now() });
      
      // Send message to page
      window.postMessage({
        source: 'gtm-inspector-content',
        action: action,
        data: data,
        id: id
      }, '*');
      
      // Timeout after 8 seconds
      setTimeout(() => {
        if (pendingMessages.has(id)) {
          pendingMessages.delete(id);
          const error = new Error(`Message timeout for action: ${action}`);
          ErrorTracker.addError(error, `message-timeout-${action}`);
          reject(error);
        }
      }, 8000);
    } catch (error) {
      ErrorTracker.addError(error, `message-send-${action}`);
      reject(error);
    }
  });
}

// Single optimized message listener
window.addEventListener('message', function(event) {
  if (event.data.source === 'gtm-inspector-page-response') {
    const { id, data } = event.data;
    
    console.log(`📥 Received response for ID: ${id}`, data);
    
    if (pendingMessages.has(id)) {
      const { resolve, action } = pendingMessages.get(id);
      pendingMessages.delete(id);
      
      // Track performance
      PerformanceTracker.endOperation(`message-${action}`);
      
      resolve(data);
    } else {
      console.warn(`⚠️ Received response for unknown message ID: ${id}`);
      ErrorTracker.addError(new Error(`Unknown message ID: ${id}`), 'message-handler');
    }
  }
});

// Cached GTM detection with intelligent refresh
async function checkGTMStatus(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached result if still valid
  if (!forceRefresh && gtmCache && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📊 Returning cached GTM status');
    return gtmCache;
  }
  
  try {
    console.log('🔍 Checking GTM status...');
    const result = await sendMessageToPage('detectGTM');
    
    if (result) {
      console.log('📊 GTM Detection Result:', result);
      
      // Cache the result
      gtmCache = result;
      cacheTimestamp = now;
      
      if (result.hasGTM) {
        console.log(`✅ GTM Found: ${result.gtmId}`);
        
        // Get additional tag information only if needed
        if (!result.tags || !result.events) {
          const [tags, events] = await Promise.all([
            sendMessageToPage('getTagInfo'),
            sendMessageToPage('getEvents')
          ]);
          
          gtmCache.tags = tags || [];
          gtmCache.events = events || [];
        }
        
        // Store results for popup
        chrome.runtime.sendMessage({
          action: 'storeData',
          data: {
            gtm: gtmCache,
            tags: gtmCache.tags || [],
            events: gtmCache.events || []
          }
        });
      } else {
        console.log('❌ No GTM detected');
      }
      
      return gtmCache;
    }
  } catch (error) {
    console.error('❌ Error checking GTM:', error);
    ErrorTracker.addError(error, 'checkGTM');
    return null;
  }
}

// Optimized message handlers with caching
const messageHandlers = {
  ping: () => ({ success: true }),
  
  getErrors: () => {
    return ErrorTracker.getErrors();
  },
  
  getPerformanceMetrics: () => {
    return PerformanceTracker.getMetrics();
  },
  
  checkGTM: async (data) => {
    try {
      PerformanceTracker.startOperation('checkGTM');
      
      const forceRefresh = data?.forceRefresh || false;
      const result = await checkGTMStatus(forceRefresh);
      
      PerformanceTracker.endOperation('checkGTM');
      
      return {
        hasGTM: result?.hasGTM || false,
        gtmId: result?.gtmId || '',
        containers: result?.containers || [],
        primaryContainer: result?.primaryContainer || null,
        hasConsentMode: result?.hasConsentMode || false,
        consentState: result?.consentState || {},
        tags: result?.tags || [],
        events: result?.events || []
      };
    } catch (error) {
      ErrorTracker.addError(error, 'checkGTM');
      return { error: error.message };
    }
  },
  
  applyConsent: async (data) => {
    try {
      const result = await sendMessageToPage('updateConsent', data);
      
      // Invalidate cache since consent changed
      gtmCache = null;
      cacheTimestamp = 0;
      
      // Wait a bit then refresh tag status
      setTimeout(() => {
        sendMessageToPage('getTagInfo').then(tags => {
          chrome.runtime.sendMessage({
            action: 'storeData',
            data: { tags: tags || [] }
          });
        });
      }, 500);
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  getEventLog: async () => {
    try {
      const events = await sendMessageToPage('getEvents');
      return events || [];
    } catch (error) {
      return [];
    }
  },
  
  clearEventLog: async () => {
    // Clear events in page context
    window.postMessage({
      source: 'gtm-inspector-content',
      action: 'clearEvents'
    }, '*');
    return { success: true };
  },
  
  getTagStatus: async () => {
    try {
      const tags = await sendMessageToPage('getTagInfo');
      return tags || [];
    } catch (error) {
      return [];
    }
  },
  
  getTriggersAndVariables: async () => {
    try {
      const result = await sendMessageToPage('detectTriggersAndVariables');
      return result || { triggers: [], variables: [], tagTriggerMap: [], consentDependencies: [] };
    } catch (error) {
      return { triggers: [], variables: [], tagTriggerMap: [], consentDependencies: [], error: error.message };
    }
  },
  
  getComprehensiveAnalysis: async () => {
    try {
      const result = await sendMessageToPage('getComprehensiveTagAnalysis');
      return result || { tags: [], triggers: [], variables: [], summary: {} };
    } catch (error) {
      return { tags: [], triggers: [], variables: [], summary: {}, error: error.message };
    }
  }
};

// Optimized Chrome runtime message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Received message from popup:', request);
  
  try {
    const handler = messageHandlers[request.action];
    
    if (handler) {
      // Handle async handlers
      const result = handler(request.data || {});
      
      if (result instanceof Promise) {
        result.then(sendResponse).catch(error => {
          ErrorTracker.addError(error, `popup-handler-${request.action}`);
          console.error(`Error handling ${request.action}:`, error);
          sendResponse({ error: error.message });
        });
        return true; // Keep message channel open for async response
      } else {
        sendResponse(result);
      }
    } else {
      const error = new Error(`Unknown action: ${request.action}`);
      ErrorTracker.addError(error, 'popup-handler');
      console.warn('Unknown action:', request.action);
      sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    ErrorTracker.addError(error, `popup-handler-${request.action}`);
    console.error('Handler error:', error);
    sendResponse({ error: error.message });
  }
  
  return true;
});

// Memory cleanup function
function cleanupMemory() {
  // Clean up expired pending messages
  const now = Date.now();
  for (const [id, message] of pendingMessages.entries()) {
    if (now - message.timestamp > 30000) { // 30 seconds
      pendingMessages.delete(id);
    }
  }
  
  // Clean up message pool
  MessagePool.cleanup();
  
  // Clear old errors if too many
  if (ErrorTracker.errors.length > ErrorTracker.maxErrors) {
    ErrorTracker.errors = ErrorTracker.errors.slice(-ErrorTracker.maxErrors);
  }
}

// Initialize with lazy loading
async function initialize() {
  if (isInitialized) {
    return;
  }
  
  try {
    console.log('🚀 Initializing GTM Consent Inspector...');
    
    // Inject page script
    await injectPageScript();
    
    // Run initial GTM detection
    await checkGTMStatus();
    
    // Set up periodic cleanup
    setInterval(cleanupMemory, 60000); // Every minute
    
    isInitialized = true;
    console.log('✅ GTM Consent Inspector initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize:', error);
    ErrorTracker.addError(error, 'initialization');
  }
}

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

console.log('✅ GTM Consent Inspector: Content script ready (OPTIMIZED)');