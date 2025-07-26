// content.js - Clean CSP-compliant version
(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.gtmInspectorContentLoaded) {
    return;
  }
  window.gtmInspectorContentLoaded = true;
  
  let scriptInjected = false;
  
  // Inject external script file (CSP compliant)
  async function injectScript() {
    if (scriptInjected) {
      return true;
    }
    
    try {
      
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected-script.js');
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          script.remove();
          reject(new Error('Script injection timeout'));
        }, 10000);
        
        script.onload = () => {
          clearTimeout(timeout);
          scriptInjected = true;
          
          // Clean up script element
          setTimeout(() => {
            if (script.parentNode) {
              script.parentNode.removeChild(script);
            }
          }, 100);
          
          resolve(true);
        };
        
        script.onerror = (error) => {
          clearTimeout(timeout);
          script.remove();
          reject(new Error('Script loading failed'));
        };
        
        (document.head || document.documentElement).appendChild(script);
      });
      
    } catch (error) {
      return false;
    }
  }
  
    // Message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    const handleMessage = async () => {
      try {
        switch (request.action) {
          case 'ping':
            sendResponse({ 
              success: true, 
              timestamp: Date.now(),
              url: window.location.href,
              scriptInjected: scriptInjected
            });
            break;
            
          case 'checkGTM':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const gtmResult = await sendMessageToPage('detectGTM');
            sendResponse(gtmResult);
            break;
            
          case 'getTagStatus':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const tagResult = await sendMessageToPage('getTagInfo');
            sendResponse(Array.isArray(tagResult) ? tagResult : []);
            break;
            
          case 'applyConsent':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const consentResult = await sendMessageToPage('updateConsent', request.data);
            sendResponse(consentResult);
            break;
            
          case 'getEventLog':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const eventResult = await sendMessageToPage('getEvents');
            sendResponse(Array.isArray(eventResult) ? eventResult : []);
            break;
            
          default:
            sendResponse({ error: 'Unknown action: ' + request.action });
        }
      } catch (error) {
        sendResponse({ error: error.message });
      }
    };
    
    handleMessage();
    return true; // Keep message channel open for async operations
  });
  
  // Function to send messages to page context
  function sendMessageToPage(action, data = {}) {
    return new Promise((resolve, reject) => {
      const messageId = Date.now() + Math.random();
      
      console.log('📤 Sending message to page:', { action, data, messageId });
      
      // Listen for response from page
      const messageListener = (event) => {
        console.log('📥 Received message from page:', event.data);
        if (event.data && event.data.source === 'gtm-inspector-page' && event.data.id === messageId) {
          window.removeEventListener('message', messageListener);
          console.log('✅ Message matched, resolving with:', event.data.result);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };
      
      window.addEventListener('message', messageListener);
      
      // Send message to page context
      window.postMessage({
        source: 'gtm-inspector-content',
        action: action,
        data: data,
        id: messageId
      }, '*');
      
      console.log('📤 Message sent, waiting for response...');
      
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', messageListener);
        console.error('⏰ Message timeout for action:', action);
        reject(new Error('Message timeout'));
      }, 5000);
    });
  }
  
  // Initialize script injection
  function initialize() {
    
    // Inject script when page is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(injectScript, 500);
      });
    } else {
      setTimeout(injectScript, 500);
    }
  }
  
  // Start initialization
  initialize();
})();