// content.js - Clean CSP-compliant version
(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.gtmInspectorContentLoaded) {
    console.log('🟡 Content script already loaded, skipping...');
    return;
  }
  window.gtmInspectorContentLoaded = true;
  
  console.log('🟢 GTM Inspector Content Script Loading...');
  console.log('🟢 URL:', window.location.href);
  
  let scriptInjected = false;
  
  // Inject external script file (CSP compliant)
  async function injectScript() {
    if (scriptInjected) {
      console.log('🟢 Script already injected');
      return true;
    }
    
    try {
      console.log('🟢 Injecting external script file...');
      
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected-script.js');
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          script.remove();
          reject(new Error('Script injection timeout'));
        }, 10000);
        
        script.onload = () => {
          clearTimeout(timeout);
          console.log('🟢 External script loaded successfully');
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
          console.error('🔴 Script loading failed:', error);
          script.remove();
          reject(new Error('Script loading failed'));
        };
        
        (document.head || document.documentElement).appendChild(script);
      });
      
    } catch (error) {
      console.error('🔴 Error injecting script:', error);
      return false;
    }
  }
  
    // Message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('🟢 Content script received message:', request.action);
    
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
            console.log('🟢 GTM detection result:', gtmResult);
            sendResponse(gtmResult);
            break;
            
          case 'getTagStatus':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const tagResult = await sendMessageToPage('getTagInfo');
            console.log('🟢 Tag info result:', tagResult);
            sendResponse(Array.isArray(tagResult) ? tagResult : []);
            break;
            
          case 'applyConsent':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const consentResult = await sendMessageToPage('updateConsent', request.data);
            console.log('🟢 Consent update result:', consentResult);
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
            console.log('🔴 Unknown action:', request.action);
            sendResponse({ error: 'Unknown action: ' + request.action });
        }
      } catch (error) {
        console.error('🔴 Error handling message:', error);
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
      
      // Listen for response from page
      const messageListener = (event) => {
        if (event.data && event.data.source === 'gtm-inspector-page' && event.data.id === messageId) {
          window.removeEventListener('message', messageListener);
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
      
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', messageListener);
        reject(new Error('Message timeout'));
      }, 5000);
    });
  }
  
  // Initialize script injection
  function initialize() {
    console.log('🟢 Initializing content script...');
    
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
  
  console.log('🟢 Content script setup complete');
})();