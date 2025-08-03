// Enhanced injection with detailed error reporting
async function ensureContentScriptWithDiagnostics(tabId) {
  try {
    // Step 1: Get tab info
    const tab = await chrome.tabs.get(tabId);
    
    // Step 2: Check if URL is injectable
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:')) {
      throw new Error(`Cannot inject into system page: ${tab.url}`);
    }
    
    // Step 3: Try to ping existing content script
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response && response.success) {
        return { success: true, alreadyActive: true };
      }
    } catch (error) {
      // No existing content script found
    }
    
    // Step 4: Inject content script
    const injectionResult = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    // Step 5: Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 6: Test communication
    let testSuccess = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!testSuccess && attempts < maxAttempts) {
      attempts++;
      
      try {
        const testResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        
        if (testResponse && testResponse.success) {
          testSuccess = true;
        }
      } catch (error) {
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (testSuccess) {
      return { success: true, injected: true, attempts };
    } else {
      throw new Error(`Communication failed after ${maxAttempts} attempts`);
    }
    
  } catch (error) {
    // Log error safely without exposing sensitive information
    console.error('Content script injection failed:', error.name || 'Unknown error');
    return { 
      success: false, 
      error: 'Content script injection failed. Please refresh the page.',
      errorCode: error.name || 'INJECTION_ERROR'
    };
  }
}

// Encryption utilities for sensitive data
const EncryptionManager = {
  // Generate a secure encryption key (derived from extension ID)
  async getEncryptionKey() {
    const manifest = chrome.runtime.getManifest();
    const extensionId = chrome.runtime.id;
    
    // Create a deterministic key from extension ID
    const encoder = new TextEncoder();
    const data = encoder.encode(extensionId + manifest.version);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const key = hashArray.slice(0, 32); // Use first 32 bytes for AES-256
    
    return crypto.subtle.importKey(
      'raw',
      new Uint8Array(key),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  },
  
  // Encrypt sensitive data
  async encryptData(data) {
    try {
      const key = await this.getEncryptionKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(JSON.stringify(data));
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedData
      );
      
      const encryptedArray = new Uint8Array(encryptedBuffer);
      const combined = new Uint8Array(iv.length + encryptedArray.length);
      combined.set(iv);
      combined.set(encryptedArray, iv.length);
      
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      return null;
    }
  },
  
  // Check if data is encrypted
  isEncrypted(data) {
    return typeof data === 'string' && data.startsWith('ENCRYPTED:');
  },
  
  // Encrypt and mark data
  async encryptAndMark(data) {
    const encrypted = await this.encryptData(data);
    return encrypted ? `ENCRYPTED:${encrypted}` : data;
  }
};

// Helper function to encrypt sensitive data
async function encryptSensitiveData(data) {
  return await EncryptionManager.encryptAndMark(data);
}

// Input validation utilities
const InputValidator = {
  // Validate request structure
  isValidRequest(request) {
    if (!request || typeof request !== 'object') return false;
    if (!request.action || typeof request.action !== 'string') return false;
    
    const validActions = [
      'ensureContentScript', 'diagnoseTab', 'cookiebotConsentChange',
      'openPopup', 'logTagManagerInteraction', 'getTagManagerInteractions'
    ];
    
    return validActions.includes(request.action);
  },
  
  // Validate tab ID
  isValidTabId(tabId) {
    return typeof tabId === 'number' && tabId > 0;
  },
  
  // Validate consent data
  isValidConsentData(data) {
    if (!data || typeof data !== 'object') return false;
    
    // Check for required fields
    if (!data.action || !data.website) return false;
    
    const validActions = ['accept', 'decline', 'ready'];
    if (!validActions.includes(data.action)) return false;
    
    return true;
  },
  
  // Sanitize input
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return {};
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof key === 'string' && key.length <= 50) {
        if (typeof value === 'string') {
          sanitized[key] = value.replace(/[<>]/g, '').substring(0, 1000);
        } else if (typeof value === 'number' && isFinite(value)) {
          sanitized[key] = value;
        } else if (typeof value === 'boolean') {
          sanitized[key] = value;
        } else if (Array.isArray(value)) {
          sanitized[key] = value.slice(0, 100);
        }
      }
    }
    
    return sanitized;
  }
};

// Rate Limiting Implementation
class RateLimiter {
  constructor() {
    this.operations = new Map();
    this.defaultLimits = {
      storage: { max: 10, window: 60000 }, // 10 operations per minute
      messages: { max: 20, window: 60000 }, // 20 messages per minute
      consent: { max: 5, window: 60000 },   // 5 consent changes per minute
      events: { max: 50, window: 60000 }    // 50 events per minute
    };
  }

  isAllowed(operation, key = 'default') {
    const limit = this.defaultLimits[operation] || this.defaultLimits.messages;
    const now = Date.now();
    const keyName = `${operation}_${key}`;
    
    if (!this.operations.has(keyName)) {
      this.operations.set(keyName, []);
    }
    
    const operations = this.operations.get(keyName);
    
    // Remove old operations outside the window
    const validOperations = operations.filter(time => now - time < limit.window);
    this.operations.set(keyName, validOperations);
    
    // Check if we're under the limit
    if (validOperations.length < limit.max) {
      validOperations.push(now);
      this.operations.set(keyName, validOperations);
      return true;
    }
    
    return false;
  }

  getRemainingTime(operation, key = 'default') {
    const limit = this.defaultLimits[operation] || this.defaultLimits.messages;
    const keyName = `${operation}_${key}`;
    const operations = this.operations.get(keyName) || [];
    const now = Date.now();
    
    if (operations.length === 0) return 0;
    
    const oldestOperation = Math.min(...operations);
    return Math.max(0, limit.window - (now - oldestOperation));
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

// Rate-limited storage operations
async function rateLimitedStorageSet(data) {
  if (!rateLimiter.isAllowed('storage')) {
    const remainingTime = rateLimiter.getRemainingTime('storage');
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(remainingTime / 1000)} seconds.`);
  }
  
  return await chrome.storage.local.set(data);
}

// Enhanced message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Validate request structure
  if (!InputValidator.isValidRequest(request)) {
    sendResponse({ error: 'Invalid request structure' });
    return;
  }
  
  // Sanitize request
  const sanitizedRequest = InputValidator.sanitizeObject(request);
  
  if (sanitizedRequest.action === 'ensureContentScript') {
    // Validate tab ID
    if (!InputValidator.isValidTabId(sanitizedRequest.tabId)) {
      sendResponse({ error: 'Invalid tab ID provided' });
      return;
    }
    
    const tabId = sanitizedRequest.tabId;
    
    ensureContentScriptWithDiagnostics(tabId).then(result => {
      sendResponse(result);
    }).catch(error => {
      console.error('Content script ensure failed:', error.name || 'Unknown error');
      sendResponse({ 
        success: false, 
        error: 'Content script initialization failed. Please refresh the page.',
        errorCode: error.name || 'ENSURE_ERROR'
      });
    });
    
    return true; // Keep message channel open
  }
  
  if (request.action === 'diagnoseTab') {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (tabs[0]) {
        const tab = tabs[0];
        
        const diagnosis = {
          tab: {
            id: tab.id,
            // Don't expose full URL - just domain for security
            domain: new URL(tab.url).hostname,
            status: tab.status,
            // Don't expose full title - just first 50 chars
            title: tab.title ? tab.title.substring(0, 50) + (tab.title.length > 50 ? '...' : '') : 'Unknown'
          },
          canInject: !tab.url.startsWith('chrome://') && 
                     !tab.url.startsWith('chrome-extension://') &&
                     !tab.url.startsWith('edge://') &&
                     !tab.url.startsWith('about:'),
          timestamp: Date.now()
        };
        
        sendResponse(diagnosis);
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    
    return true;
  }
  
  // Handle Cookiebot consent change notifications
  if (sanitizedRequest.action === 'cookiebotConsentChange') {
    // Use async handler for rate-limited storage
    (async () => {
      try {
        // Validate consent data
        if (!InputValidator.isValidConsentData(sanitizedRequest.data)) {
          sendResponse({ error: 'Invalid consent data provided' });
          return;
        }
        
        // Encrypt sensitive consent data before storage
        const consentDataToStore = {
          ...sanitizedRequest.data,
          timestamp: Date.now()
        };
        
        // Encrypt the consent data
        const encryptedConsentData = await encryptSensitiveData(consentDataToStore);
        
        // Store the encrypted consent change data with rate limiting
        await rateLimitedStorageSet({
          lastCookiebotConsentChange: encryptedConsentData
        });
        
        // Show notification to user
        showCookiebotNotification(sanitizedRequest.data);
        
        sendResponse({ success: true });
      } catch (error) {
        if (error.message.includes('Rate limit exceeded')) {
          console.warn('Rate limit exceeded for consent storage');
          sendResponse({ error: 'Too many consent changes. Please wait a moment.' });
        } else {
          console.error('Storage error:', error);
          sendResponse({ error: 'Failed to store consent data' });
        }
      }
    })();
    
    return true; // Keep message channel open for async response
  }
  
  // Handle popup opening request
  if (request.action === 'openPopup') {
    sendResponse({ success: true });
    return true;
  }
  
  // Handle Tag Manager interaction logging
  if (request.action === 'logTagManagerInteraction') {
    // Store the interaction data
    chrome.storage.local.get(['tagManagerInteractions'], (result) => {
      const interactions = result.tagManagerInteractions || [];
      interactions.push(request.data);
      
      // Keep only last 100 interactions
      if (interactions.length > 100) {
        interactions.splice(0, interactions.length - 100);
      }
      
      chrome.storage.local.set({
        tagManagerInteractions: interactions
      });
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  // Handle request for Tag Manager interaction history
  if (request.action === 'getTagManagerInteractions') {
    chrome.storage.local.get(['tagManagerInteractions'], (result) => {
      sendResponse({
        success: true,
        interactions: result.tagManagerInteractions || []
      });
    });
    return true;
  }
});

// Show notification for Cookiebot consent changes
function showCookiebotNotification(consentData) {
  try {
    const actionText = consentData.action === 'accept' ? 'accepted' : 'rejected';
    const icon = consentData.action === 'accept' ? '✅' : '❌';
    
    chrome.notifications.create({
      type: 'basic',
      title: 'GTM Consent Inspector',
      message: `${consentData.website}: Cookies ${actionText} ${icon}`,
      priority: 1
    });
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
}

// Handle extension icon click to activate on current tab
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Check if we can access this tab
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:')) {
      console.log('Cannot inject into system page');
      return;
    }
    
    // Inject content script using activeTab permission
    const result = await ensureContentScriptWithDiagnostics(tab.id);
    
    if (result.success) {
      // Send message to content script to start inspection
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'startInspection',
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Failed to start inspection:', error);
      }
    }
  } catch (error) {
    console.error('Failed to activate extension:', error);
  }
});