// content.js - Enhanced with comprehensive error handling and performance monitoring
console.log('🔍 GTM Consent Inspector: Content script loading...ENHANCED');

// Error handling and performance monitoring
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

let isInjected = false;
let messageId = 0;
let pendingMessages = new Map();

// Inject the script into page context
function injectPageScript() {
  if (isInjected) {
    console.log('🔧 Page script already injected, skipping...');
    return;
  }
  
  console.log('🔧 Injecting page context script...');
  
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected-script.js');
  script.onload = function() {
    console.log('✅ Page context script injected successfully');
    script.remove();
    isInjected = true;
    
    // Run initial GTM detection
    setTimeout(() => {
      checkGTMStatus();
    }, 500);
  };
  script.onerror = function() {
    console.error('❌ Failed to inject page context script');
  };
  
  (document.head || document.documentElement).appendChild(script);
}

// Message passing between page context and content script
// content.js - Add better timeout handling and debugging
// Replace the sendMessageToPage function:

function sendMessageToPage(action, data = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    
    PerformanceTracker.startOperation(`message-${action}`);
    console.log(`📤 Sending message to page: ${action} (ID: ${id})`);
    
    try {
      // Store the promise resolver
      pendingMessages.set(id, { resolve, reject });
      
      // Send message to page
      window.postMessage({
        source: 'gtm-inspector-content',
        action: action,
        data: data,
        id: id
      }, '*');
      
      // Timeout after 8 seconds (increased from 5)
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

// Also update the message listener to add better logging:
window.addEventListener('message', function(event) {
  if (event.data.source === 'gtm-inspector-page-response') {
    const { id, data } = event.data;
    
    console.log(`📥 Received response for ID: ${id}`, data);
    
    if (pendingMessages.has(id)) {
      const { resolve } = pendingMessages.get(id);
      pendingMessages.delete(id);
      resolve(data);
    } else {
      console.warn(`⚠️ Recdeived response for unknown message ID: ${id}`);
    }
  }
});

// Listen for responses from page context
window.addEventListener('message', function(event) {
  if (event.data.source === 'gtm-inspector-page-response') {
    const { id, data } = event.data;
    
    console.log(`📥 Received response for ID: ${id}`, data);
    
    if (pendingMessages.has(id)) {
      const { resolve } = pendingMessages.get(id);
      pendingMessages.delete(id);
      
      // Track performance
      const action = data?.action || 'unknown';
      PerformanceTracker.endOperation(`message-${action}`);
      
      resolve(data);
    } else {
      console.warn(`⚠️ Received response for unknown message ID: ${id}`);
      ErrorTracker.addError(new Error(`Unknown message ID: ${id}`), 'message-handler');
    }
  }
});

// Enhanced GTM detection
async function checkGTMStatus() {
  try {
    console.log('🔍 Checking GTM status...');
    const result = await sendMessageToPage('detectGTM');
    
    if (result) {
      console.log('📊 GTM Detection Result:', result);
      
      if (result.hasGTM) {
        console.log(`✅ GTM Found: ${result.gtmId}`);
        
        // Get additional tag information
        const tags = await sendMessageToPage('getTagInfo');
        const events = await sendMessageToPage('getEvents');
        
        // Store results for popup
        chrome.runtime.sendMessage({
          action: 'storeData',
          data: {
            gtm: result,
            tags: tags || [],
            events: events || []
          }
        });
      } else {
        console.log('❌ No GTM detected');
      }
    }
  } catch (error) {
    console.error('❌ Error checking GTM:', error);
  }
}

// Message handlers for popup communication
const messageHandlers = {
  ping: () => ({ success: true }),
  
  getErrors: () => {
    return ErrorTracker.getErrors();
  },
  
  getPerformanceMetrics: () => {
    return PerformanceTracker.getMetrics();
  },
  
  checkGTM: async () => {
    try {
      PerformanceTracker.startOperation('checkGTM');
      
      const gtmResult = await sendMessageToPage('detectGTM');
      const tags = await sendMessageToPage('getTagInfo');
      const events = await sendMessageToPage('getEvents');
      
      PerformanceTracker.endOperation('checkGTM');
      
      return {
        hasGTM: gtmResult?.hasGTM || false,
        gtmId: gtmResult?.gtmId || '',
        containers: gtmResult?.containers || [],
        primaryContainer: gtmResult?.primaryContainer || null,
        hasConsentMode: gtmResult?.hasConsentMode || false,
        consentState: gtmResult?.consentState || {},
        tags: tags || [],
        events: events || []
      };
    } catch (error) {
      ErrorTracker.addError(error, 'checkGTM');
      return { error: error.message };
    }
  },
  
  applyConsent: async (data) => {
    try {
      const result = await sendMessageToPage('updateConsent', data);
      
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
  
  toggleOverlay: () => {
    return toggleOverlay();
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

// Chrome runtime message listener
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

// Simple overlay toggle
function toggleOverlay() {
  let overlay = document.getElementById('gtm-consent-inspector-overlay');
  
  if (overlay) {
    overlay.remove();
    return { success: true, action: 'removed' };
  }
  
  // Create minimal overlay
  overlay = document.createElement('div');
  overlay.id = 'gtm-consent-inspector-overlay';
  overlay.innerHTML = `
    <div style="position: fixed; top: 10px; right: 10px; width: 320px; 
                background: white; border: 1px solid #ddd; border-radius: 6px; 
                padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
                z-index: 9999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px; line-height: 1.4;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 16px; color: #202124;">🔍 GTM Inspector</h3>
        <button onclick="this.closest('#gtm-consent-inspector-overlay').remove()" 
                style="background: none; border: none; font-size: 18px; color: #5f6368; cursor: pointer;">×</button>
      </div>
      <div style="margin-bottom: 12px;">
        <strong>Status:</strong> <span id="overlay-gtm-status">Checking...</span>
      </div>
      <div style="margin-bottom: 12px;">
        <strong>Console Access:</strong> Try <code>ConsentInspector.status()</code>
      </div>
      <div style="font-size: 11px; color: #5f6368; text-align: center;">
        Use browser extension popup for full controls
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Update overlay status
  sendMessageToPage('detectGTM').then(result => {
    const statusEl = overlay.querySelector('#overlay-gtm-status');
    if (statusEl && result) {
      if (result.hasGTM) {
        if (result.containers && result.containers.length > 1) {
          statusEl.textContent = `✅ ${result.containers.length} GTM Containers (${result.gtmId})`;
        } else {
          statusEl.textContent = `✅ GTM Active (${result.gtmId})`;
        }
      } else {
        statusEl.textContent = '❌ No GTM';
      }
    }
  });
  
  return { success: true, action: 'created' };
}

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectPageScript);
} else {
  injectPageScript();
}

// Remove the second injection attempt
// setTimeout(injectPageScript, 2000);

console.log('✅ GTM Consent Inspector: Content script ready');