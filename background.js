// Enhanced injection with detailed error reporting
async function ensureContentScriptWithDiagnostics(tabId) {
  console.log(`🔧 Starting content script injection diagnostics for tab ${tabId}`);
  
  try {
    // Step 1: Get tab info
    const tab = await chrome.tabs.get(tabId);
    console.log(`📋 Tab info:`, {
      id: tab.id,
      url: tab.url,
      status: tab.status,
      title: tab.title
    });
    
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
        console.log(`✅ Content script already active in tab ${tabId}`);
        return { success: true, alreadyActive: true };
      }
    } catch (error) {
      console.log(`🔧 No existing content script found: ${error.message}`);
    }
    
    // Step 4: Inject content script
    console.log(`🚀 Injecting content script into tab ${tabId}`);
    
    const injectionResult = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    console.log(`📤 Injection result:`, injectionResult);
    
    // Step 5: Wait for initialization
    console.log(`⏳ Waiting for content script initialization...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 6: Test communication
    console.log(`🏓 Testing communication with injected script...`);
    
    let testSuccess = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!testSuccess && attempts < maxAttempts) {
      attempts++;
      console.log(`🧪 Communication test attempt ${attempts}/${maxAttempts}`);
      
      try {
        const testResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        
        if (testResponse && testResponse.success) {
          console.log(`✅ Communication test successful:`, testResponse);
          testSuccess = true;
        } else {
          console.log(`⚠️ Unexpected response:`, testResponse);
        }
      } catch (error) {
        console.log(`❌ Communication test ${attempts} failed:`, error.message);
        
        if (attempts < maxAttempts) {
          console.log(`⏳ Waiting 1 second before retry...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (testSuccess) {
      console.log(`✅ Content script injection and communication successful for tab ${tabId}`);
      return { success: true, injected: true, attempts };
    } else {
      throw new Error(`Communication failed after ${maxAttempts} attempts`);
    }
    
  } catch (error) {
    console.error(`❌ Content script injection failed for tab ${tabId}:`, error);
    return { 
      success: false, 
      error: error.message,
      stack: error.stack
    };
  }
}

// Enhanced message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request.action);
  
  if (request.action === 'ensureContentScript') {
    const tabId = request.tabId;
    
    ensureContentScriptWithDiagnostics(tabId).then(result => {
      console.log('🔧 Injection result:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('❌ Error in ensureContentScript:', error);
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
        
        console.log('🔍 Tab diagnosis:', diagnosis);
        sendResponse(diagnosis);
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    
    return true;
  }
});