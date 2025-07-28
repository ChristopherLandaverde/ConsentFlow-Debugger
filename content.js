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
            
          case 'getTagManagerInteractions':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const interactionResult = await sendMessageToPage('getTagManagerInteractions');
            sendResponse(Array.isArray(interactionResult) ? interactionResult : []);
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
  
  // Handle Cookiebot consent change notifications
  function setupCookiebotListeners() {
    // Listen for postMessage from website integration
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'COOKIEBOT_CONSENT_CHANGE') {
        console.log('🍪 Cookiebot consent change detected:', event.data.data);
        handleCookiebotConsentChange(event.data.data);
      }
    });
    
    // Listen for custom events from website integration
    window.addEventListener('cookiebotConsentChange', (event) => {
      console.log('🍪 Cookiebot consent change event detected:', event.detail);
      handleCookiebotConsentChange(event.detail);
    });
    
    // Listen for actual Cookiebot events
    window.addEventListener('CookiebotOnAccept', (event) => {
      console.log('🍪 Cookiebot accept event fired:', event);
      const consentData = {
        action: 'accept',
        website: document.title || window.location.hostname,
        url: window.location.href,
        consent: window.Cookiebot?.consent || {},
        timestamp: Date.now()
      };
      handleCookiebotConsentChange(consentData);
    });
    
    window.addEventListener('CookiebotOnDecline', (event) => {
      console.log('🍪 Cookiebot decline event fired:', event);
      const consentData = {
        action: 'decline',
        website: document.title || window.location.hostname,
        url: window.location.href,
        consent: window.Cookiebot?.consent || {},
        timestamp: Date.now()
      };
      handleCookiebotConsentChange(consentData);
    });
    
    window.addEventListener('CookiebotOnConsentReady', (event) => {
      console.log('🍪 Cookiebot consent ready event fired:', event);
      const consentData = {
        action: 'ready',
        website: document.title || window.location.hostname,
        url: window.location.href,
        consent: window.Cookiebot?.consent || {},
        timestamp: Date.now()
      };
      handleCookiebotConsentChange(consentData);
    });
    
    // Set up immediate monitoring of gtag and dataLayer
    setupImmediateMonitoring();
    // Listen for dataLayer events
    if (window.dataLayer) {
      const originalPush = window.dataLayer.push;
      window.dataLayer.push = function(...args) {
        const result = originalPush.apply(this, args);
        
        // Check if this is a cookiebot consent change event
        if (args[0] && args[0].event === 'cookiebot_consent_change') {
          console.log('🍪 Cookiebot consent change in dataLayer:', args[0]);
          handleCookiebotConsentChange(args[0].consent_data);
        }
        
        // Monitor for tag firing events
        if (args[0] && typeof args[0] === 'object' && args[0].event) {
          const event = args[0];
          
          // Check for common tag events
          if (event.event === 'gtm.js' || 
              event.event === 'gtm.dom' || 
              event.event === 'gtm.load' ||
              event.event === 'page_view' ||
              event.event === 'purchase' ||
              event.event === 'add_to_cart' ||
              event.event === 'begin_checkout' ||
              event.event === 'view_item' ||
              event.event === 'select_item' ||
              event.event === 'add_to_wishlist' ||
              event.event === 'view_cart' ||
              event.event === 'remove_from_cart' ||
              event.event === 'add_shipping_info' ||
              event.event === 'add_payment_info' ||
              event.event === 'purchase' ||
              event.event === 'refund' ||
              event.event === 'login' ||
              event.event === 'sign_up' ||
              event.event === 'search' ||
              event.event === 'view_search_results' ||
              event.event === 'select_content' ||
              event.event === 'share' ||
              event.event === 'generate_lead' ||
              event.event === 'download' ||
              event.event === 'file_download' ||
              event.event === 'video_start' ||
              event.event === 'video_progress' ||
              event.event === 'video_complete' ||
              event.event === 'scroll' ||
              event.event === 'timer' ||
              event.event === 'exception' ||
              event.event === 'user_engagement' ||
              event.event === 'form_start' ||
              event.event === 'form_submit' ||
              event.event === 'form_progress' ||
              event.event === 'click' ||
              event.event === 'custom_event') {
            
            console.log('🏷️ Tag event detected:', event);
            logTagEventToEventLog(event);
          }
        }
        
        return result;
      };
    }
  }
  
  // Set up immediate monitoring of gtag and dataLayer consent calls
  function setupImmediateMonitoring() {
    console.log('🔍 Setting up immediate monitoring of Tag Manager consent calls...');
    
    // Monitor gtag consent calls immediately
    if (window.gtag && typeof window.gtag === 'function') {
      const originalGtag = window.gtag;
      window.gtag = function(...args) {
        // Check if this is a consent call
        if (args[0] === 'consent') {
          console.log('🍪 GTM Consent call detected:', args);
          logTagManagerInteraction('gtag_consent_call', {
            method: 'gtag',
            action: args[1],
            settings: args[2],
            timestamp: Date.now(),
            trigger: 'immediate_monitoring'
          });
        }
        
        return originalGtag.apply(this, args);
      };
    }
    
    // Enhanced dataLayer monitoring for consent events immediately
    if (window.dataLayer) {
      const originalPush = window.dataLayer.push;
      window.dataLayer.push = function(...args) {
        const result = originalPush.apply(this, args);
        
        // Check for consent-related events
        if (args[0] && typeof args[0] === 'object') {
          const event = args[0];
          
          // Check for consent events
          if (event.event === 'consent' || 
              (Array.isArray(args) && args[0] === 'consent')) {
            console.log('🍪 DataLayer consent event detected:', args);
            logTagManagerInteraction('datalayer_consent_event', {
              method: 'dataLayer',
              event: event,
              args: args,
              timestamp: Date.now(),
              trigger: 'immediate_monitoring'
            });
          }
          
          // Check for tag firing events that might be consent-dependent
          if (event.event && (event.event.includes('gtm.') || event.event.includes('consent'))) {
            console.log('🍪 Potential consent-dependent tag event:', event);
            logTagManagerInteraction('potential_consent_tag', {
              method: 'dataLayer',
              event: event,
              timestamp: Date.now(),
              trigger: 'immediate_monitoring'
            });
          }
        }
        
        // Also check for array format consent events
        if (Array.isArray(args) && args[0] === 'consent') {
          console.log('🍪 DataLayer consent event (array format) detected:', args);
          logTagManagerInteraction('datalayer_consent_event', {
            method: 'dataLayer',
            args: args,
            timestamp: Date.now(),
            trigger: 'immediate_monitoring'
          });
        }
        
        return result;
      };
    }
  }
  
  // Handle Cookiebot consent changes
  function handleCookiebotConsentChange(consentData) {
    // Show notification to user
    showConsentChangeNotification(consentData);
    
    // Update extension state
    updateExtensionState(consentData);
    
    // Log consent change to event log
    logConsentChangeToEventLog(consentData);
    
    // Enhanced monitoring: Track Tag Manager interaction
    monitorTagManagerInteraction(consentData);
    
    // Send notification to background script
    chrome.runtime.sendMessage({
      action: 'cookiebotConsentChange',
      data: consentData
    }).catch(error => {
      console.log('Background script not available:', error);
    });
  }
  
  // Log consent change to event log
  function logConsentChangeToEventLog(consentData) {
    // Use postMessage to communicate with page context
    sendMessageToPage('logConsentChange', {
      action: consentData.action,
      consentData: consentData
    }).catch(error => {
      console.log('Could not log consent change to event log:', error);
    });
  }
  
  // Enhanced monitoring of Tag Manager interaction with Cookiebot
  function monitorTagManagerInteraction(consentData) {
    console.log('🔍 Monitoring Tag Manager interaction with Cookiebot consent change:', consentData);
    
    // Monitor gtag consent calls
    if (window.gtag && typeof window.gtag === 'function') {
      const originalGtag = window.gtag;
      window.gtag = function(...args) {
        // Check if this is a consent call
        if (args[0] === 'consent') {
          console.log('🍪 GTM Consent call detected:', args);
          logTagManagerInteraction('gtag_consent_call', {
            method: 'gtag',
            action: args[1],
            settings: args[2],
            cookiebotTrigger: consentData,
            timestamp: Date.now()
          });
        }
        
        return originalGtag.apply(this, args);
      };
    }
    
    // Enhanced dataLayer monitoring for consent events
    if (window.dataLayer) {
      const originalPush = window.dataLayer.push;
      window.dataLayer.push = function(...args) {
        const result = originalPush.apply(this, args);
        
        // Check for consent-related events
        if (args[0] && typeof args[0] === 'object') {
          const event = args[0];
          
          // Check for consent events
          if (event.event === 'consent' || 
              (Array.isArray(args) && args[0] === 'consent')) {
            console.log('🍪 DataLayer consent event detected:', args);
            logTagManagerInteraction('datalayer_consent_event', {
              method: 'dataLayer',
              event: event,
              args: args,
              cookiebotTrigger: consentData,
              timestamp: Date.now()
            });
          }
          
          // Check for tag firing events that might be consent-dependent
          if (event.event && (event.event.includes('gtm.') || event.event.includes('consent'))) {
            console.log('🍪 Potential consent-dependent tag event:', event);
            logTagManagerInteraction('potential_consent_tag', {
              method: 'dataLayer',
              event: event,
              cookiebotTrigger: consentData,
              timestamp: Date.now()
            });
          }
        }
        
        return result;
      };
    }
    
    // Monitor for Google Tag Manager object changes
    if (window.google_tag_manager) {
      // Store initial state
      const initialGTMState = {
        containers: Object.keys(window.google_tag_manager || {}),
        timestamp: Date.now()
      };
      
      // Check for changes after a delay
      setTimeout(() => {
        const currentGTMState = {
          containers: Object.keys(window.google_tag_manager || {}),
          timestamp: Date.now()
        };
        
        if (JSON.stringify(initialGTMState.containers) !== JSON.stringify(currentGTMState.containers)) {
          console.log('🍪 GTM container state changed after consent:', {
            before: initialGTMState,
            after: currentGTMState
          });
          logTagManagerInteraction('gtm_container_change', {
            before: initialGTMState,
            after: currentGTMState,
            cookiebotTrigger: consentData,
            timestamp: Date.now()
          });
        }
      }, 2000);
    }
  }
  
  // Log Tag Manager interactions for analysis
  function logTagManagerInteraction(type, data) {
    // Store interaction data
    if (!window.gtmInspectorInteractions) {
      window.gtmInspectorInteractions = [];
    }
    
    const interaction = {
      id: Date.now() + Math.random(),
      type: type,
      data: data,
      url: window.location.href,
      timestamp: Date.now()
    };
    
    window.gtmInspectorInteractions.push(interaction);
    
    // Keep only last 50 interactions
    if (window.gtmInspectorInteractions.length > 50) {
      window.gtmInspectorInteractions = window.gtmInspectorInteractions.slice(-50);
    }
    
    console.log('📊 Tag Manager Interaction Logged:', interaction);
    
    // Send to background script for storage
    chrome.runtime.sendMessage({
      action: 'logTagManagerInteraction',
      data: interaction
    }).catch(error => {
      console.log('Could not send interaction to background:', error);
    });
  }
  
  // Show notification to user
  function showConsentChangeNotification(consentData) {
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'gtm-inspector-consent-notification';
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 350px;
      animation: gtmInspectorSlideIn 0.4s ease-out;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
    `;
    
    const actionIcon = consentData.action === 'accept' ? '✅' : '❌';
    const actionText = consentData.action === 'accept' ? 'Accepted' : 'Rejected';
    
    notification.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="font-size: 24px;">🍪</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px; font-size: 16px;">
            ${consentData.website}
          </div>
          <div style="margin-bottom: 8px; opacity: 0.9;">
            Cookies ${actionText} ${actionIcon}
          </div>
          <div style="font-size: 12px; opacity: 0.8; margin-bottom: 12px;">
            GTM Consent Inspector detected this change
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="gtm-inspector-view-details" style="
              background: rgba(255,255,255,0.2);
              border: 1px solid rgba(255,255,255,0.3);
              color: white;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
              transition: all 0.2s;
            ">View Details</button>
            <button id="gtm-inspector-dismiss" style="
              background: transparent;
              border: 1px solid rgba(255,255,255,0.3);
              color: white;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
              transition: all 0.2s;
            ">Dismiss</button>
          </div>
        </div>
      </div>
    `;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes gtmInspectorSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes gtmInspectorSlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Add event listeners
    document.getElementById('gtm-inspector-view-details').addEventListener('click', () => {
      // Open extension popup or show detailed view
      chrome.runtime.sendMessage({
        action: 'openPopup',
        data: consentData
      }).catch(error => {
        console.log('Could not open popup:', error);
        // Fallback: show details in console
        console.log('🍪 Cookiebot Consent Details:', consentData);
      });
    });
    
    document.getElementById('gtm-inspector-dismiss').addEventListener('click', () => {
      notification.style.animation = 'gtmInspectorSlideOut 0.3s ease-in';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    });
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'gtmInspectorSlideOut 0.3s ease-in';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 10000);
  }
  
  // Update extension state
  function updateExtensionState(consentData) {
    // Store consent data for popup access
    window.gtmInspectorLastConsentChange = consentData;
    
    // Update any existing UI elements
    if (window.ConsentInspector) {
      // Trigger a refresh of the consent inspector
      setTimeout(() => {
        if (window.ConsentInspector.getCurrentConsentState) {
          window.ConsentInspector.getCurrentConsentState();
        }
      }, 1000);
    }
  }
  
  // Initialize script injection
  function initialize() {
    
    // Setup Cookiebot listeners
    setupCookiebotListeners();
    
    // Start periodic consent monitoring
    startPeriodicConsentMonitoring();
    
    // Inject script when page is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(injectScript, 500);
      });
    } else {
      setTimeout(injectScript, 500);
    }
  }
  
  // Periodic monitoring of consent changes
  function startPeriodicConsentMonitoring() {
    let lastConsentState = null;
    
    // Check for initial consent state
    if (window.Cookiebot && window.Cookiebot.consent) {
      lastConsentState = JSON.stringify(window.Cookiebot.consent);
    }
    
    // Monitor every 2 seconds
    setInterval(() => {
      if (window.Cookiebot && window.Cookiebot.consent) {
        const currentConsentState = JSON.stringify(window.Cookiebot.consent);
        
        if (lastConsentState !== null && lastConsentState !== currentConsentState) {
          console.log('🍪 Consent state change detected via periodic monitoring');
          const consentData = {
            action: 'periodic_detection',
            website: document.title || window.location.hostname,
            url: window.location.href,
            consent: window.Cookiebot.consent,
            timestamp: Date.now()
          };
          handleCookiebotConsentChange(consentData);
        }
        
        lastConsentState = currentConsentState;
      }
    }, 2000);
  }
  
  // Start initialization
  initialize();
  
  // Expose manual testing functions globally
  window.GTMInspectorTest = {
    // Manually trigger consent change detection
    triggerConsentChange: function(action = 'manual_test') {
      const consentData = {
        action: action,
        website: document.title || window.location.hostname,
        url: window.location.href,
        consent: window.Cookiebot?.consent || {},
        timestamp: Date.now()
      };
      handleCookiebotConsentChange(consentData);
      console.log('🍪 Manual consent change triggered:', consentData);
    },
    
    // Get current interaction data
    getInteractions: function() {
      return window.gtmInspectorInteractions || [];
    },
    
    // Clear interaction data
    clearInteractions: function() {
      window.gtmInspectorInteractions = [];
      console.log('🍪 Interaction data cleared');
    },
    
    // Test gtag consent call
    testGtagConsent: function() {
      if (window.gtag) {
        window.gtag('consent', 'update', {
          analytics_storage: 'granted',
          ad_storage: 'denied'
        });
        console.log('🍪 Test gtag consent call made');
      } else {
        console.log('❌ gtag not available');
      }
    },
    
    // Test dataLayer consent event
    testDataLayerConsent: function() {
      if (window.dataLayer) {
        window.dataLayer.push(['consent', 'update', {
          analytics_storage: 'granted',
          ad_storage: 'denied'
        }]);
        console.log('🍪 Test dataLayer consent event pushed');
      } else {
        console.log('❌ dataLayer not available');
      }
    }
  };
  
  console.log('🔧 GTM Inspector initialized with manual testing functions available at window.GTMInspectorTest');
})();