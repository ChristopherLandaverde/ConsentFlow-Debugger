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
    return { 
      success: false, 
      error: error.message,
      stack: error.stack
    };
  }
}

// Enhanced message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === 'ensureContentScript') {
    const tabId = request.tabId;
    
    ensureContentScriptWithDiagnostics(tabId).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ 
        success: false, 
        error: error.message,
        stack: error.stack 
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
            url: tab.url,
            status: tab.status,
            title: tab.title
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
  if (request.action === 'cookiebotConsentChange') {
    console.log('🍪 Cookiebot consent change received in background:', request.data);
    
    // Store the consent change data
    chrome.storage.local.set({
      lastCookiebotConsentChange: {
        ...request.data,
        timestamp: Date.now()
      }
    });
    
    // Show notification to user
    showCookiebotNotification(request.data);
    
    sendResponse({ success: true });
    return true;
  }
  
  // Handle popup opening request
  if (request.action === 'openPopup') {
    // This will be handled by the popup when it opens
    sendResponse({ success: true });
    return true;
  }
});

// Show notification for Cookiebot consent changes
function showCookiebotNotification(consentData) {
  const actionText = consentData.action === 'accept' ? 'accepted' : 'rejected';
  const icon = consentData.action === 'accept' ? '✅' : '❌';
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png', // You'll need to add this icon
    title: 'GTM Consent Inspector',
    message: `${consentData.website}: Cookies ${actionText} ${icon}`,
    priority: 1
  });
}

