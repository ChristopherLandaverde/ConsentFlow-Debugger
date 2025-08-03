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
    // Validate consent data
    if (!InputValidator.isValidConsentData(sanitizedRequest.data)) {
      sendResponse({ error: 'Invalid consent data provided' });
      return;
    }
    
    // Store the consent change data
    chrome.storage.local.set({
      lastCookiebotConsentChange: {
        ...sanitizedRequest.data,
        timestamp: Date.now()
      }
    });
    
    // Show notification to user
    showCookiebotNotification(sanitizedRequest.data);
    
    sendResponse({ success: true });
    return true;
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

