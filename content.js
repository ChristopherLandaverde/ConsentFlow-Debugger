// content.js - Clean CSP-compliant version
(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.gtmInspectorContentLoaded) {
    return;
  }
  window.gtmInspectorContentLoaded = true;
  
  let scriptInjected = false;
  
  // Real Event Logger Class
  class RealEventLogger {
    constructor() {
      this.maxEvents = 100;
      this.initializeEventCapture();
    }
    
    async initializeEventCapture() {
      // Set up Cookiebot event listeners
      this.setupCookiebotListeners();
      
      // Override dataLayer.push to capture real events
      this.overrideDataLayerPush();
      
      // Override gtag to capture consent mode changes
      this.overrideGtag();
      
      // Set up periodic cleanup
      setInterval(() => this.cleanupOldEvents(), 60000); // Every minute
    }
    
    setupCookiebotListeners() {
      // Listen for Cookiebot consent events
      window.addEventListener('CookiebotOnAccept', (event) => {
        this.logEvent({
          id: this.generateUUID(),
          type: 'cookiebot_accept',
          timestamp: Date.now(),
          isSimulated: false,
          source: 'cookiebot_native',
          url: window.location.href,
          data: {
            consent: event.detail || 'all'
          }
        });
      });
      
      window.addEventListener('CookiebotOnDecline', (event) => {
        this.logEvent({
          id: this.generateUUID(),
          type: 'cookiebot_decline',
          timestamp: Date.now(),
          isSimulated: false,
          source: 'cookiebot_native',
          url: window.location.href,
          data: {
            consent: event.detail || 'none'
          }
        });
      });
      
      window.addEventListener('CookiebotOnConsentReady', (event) => {
        this.logEvent({
          id: this.generateUUID(),
          type: 'cookiebot_consent_ready',
          timestamp: Date.now(),
          isSimulated: false,
          source: 'cookiebot_native',
          url: window.location.href,
          data: {
            consent: event.detail || {}
          }
        });
      });
      
      window.addEventListener('CookiebotOnDialogDisplay', (event) => {
        this.logEvent({
          id: this.generateUUID(),
          type: 'cookiebot_dialog_display',
          timestamp: Date.now(),
          isSimulated: false,
          source: 'cookiebot_native',
          url: window.location.href,
          data: {
            dialogType: event.detail || 'preferences'
          }
        });
      });
    }
    
    overrideDataLayerPush() {
      if (!window.dataLayer) {
        window.dataLayer = [];
      }
      
      const originalPush = window.dataLayer.push;
      window.dataLayer.push = (...args) => {
        // Call original push first
        const result = originalPush.apply(window.dataLayer, args);
        
        // Log the event
        const eventData = args[0];
        if (eventData && typeof eventData === 'object') {
          this.logEvent({
            id: this.generateUUID(),
            type: 'datalayer_push',
            timestamp: Date.now(),
            isSimulated: false,
            source: 'datalayer',
            url: window.location.href,
            data: eventData
          });
        }
        
        return result;
      };
    }
    
    overrideGtag() {
      if (window.gtag) {
        const originalGtag = window.gtag;
        window.gtag = (...args) => {
          // Call original gtag first
          const result = originalGtag.apply(window, args);
          
          // Check if this is a consent mode update
          if (args.length >= 2 && args[0] === 'consent' && args[1] === 'update') {
            this.logEvent({
              id: this.generateUUID(),
              type: 'gtag_consent_update',
              timestamp: Date.now(),
              isSimulated: false,
              source: 'gtag',
              url: window.location.href,
              data: {
                consent: args[2] || {}
              }
            });
          }
          
          return result;
        };
      }
    }
    
    async logEvent(event) {
      try {
        // Get existing events
        const result = await chrome.storage.local.get(['gtmInspectorEvents']);
        let events = result.gtmInspectorEvents || [];
        
        // Add new event
        events.push(event);
        
        // Keep only the latest maxEvents
        if (events.length > this.maxEvents) {
          events = events.slice(-this.maxEvents);
        }
        
        // Store events
        await chrome.storage.local.set({ gtmInspectorEvents: events });
      } catch (error) {
        console.error('Error logging real event:', error);
      }
    }
    
    async cleanupOldEvents() {
      try {
        const result = await chrome.storage.local.get(['gtmInspectorEvents']);
        let events = result.gtmInspectorEvents || [];
        
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        events = events.filter(event => event.timestamp > twentyFourHoursAgo);
        
        await chrome.storage.local.set({ gtmInspectorEvents: events });
      } catch (error) {
        console.error('Error cleaning up old events:', error);
      }
    }
    
    generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }
  
  // Initialize real event logger
  const realEventLogger = new RealEventLogger();
  
  // Inject external script file (CSP compliant)
  async function injectScript() {
    if (scriptInjected) {
      return true;
    }
    
    try {
      // Check if document is ready
      if (!document.head && !document.documentElement) {
        console.warn('Document not ready for script injection');
        return false;
      }
      
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected-script.js');
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
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
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
          reject(new Error('Script loading failed'));
        };
        
        // Find the best insertion point
        const insertionPoint = document.head || document.documentElement;
        try {
          if (insertionPoint && document.contains(insertionPoint)) {
            insertionPoint.appendChild(script);
          } else {
            (document.head || document.documentElement).appendChild(script);
          }
        } catch (error) {
          console.error('Script injection fallback:', error);
          document.documentElement.appendChild(script);
        }
      });
      
    } catch (error) {
      console.error('Script injection error:', error);
      return false;
    }
  }
  
  // Input validation utilities
  const InputValidator = {
    // Validate message origin
    isValidOrigin(origin) {
      if (!origin) return false;
      
      // Allow same origin
      if (origin === window.location.origin) return true;
      
      // Allow extension origin
      if (origin.startsWith('chrome-extension://')) return true;
      
      // Allow specific trusted domains (if needed)
      const trustedDomains = [
        'https://vermillion-zuccutto-ed1811.netlify.app',
        'https://cookiebot.com',
        'https://consent.cookiebot.com'
      ];
      
      return trustedDomains.some(domain => origin.startsWith(domain));
    },
    
    // Validate message structure
    isValidMessage(message) {
      if (!message || typeof message !== 'object') return false;
      
      // Check for required fields
      if (!message.source || !message.action) return false;
      
      // Validate source
      const validSources = ['gtm-inspector-content', 'gtm-inspector-page'];
      if (!validSources.includes(message.source)) return false;
      
      // Validate action
      const validActions = [
        'detectGTM', 'getTagStatus', 'getEvents', 'updateConsent',
        'updateSimulationMode', 'clearEventLog', 'runDiagnostics',
        'getTagManagerInteractions', 'ping'
      ];
      if (!validActions.includes(message.action)) return false;
      
      return true;
    },
    
    // Validate consent data
    isValidConsentData(consent) {
      if (!consent || typeof consent !== 'object') return false;
      
      const requiredFields = [
        'analytics_storage', 'ad_storage', 'functionality_storage',
        'personalization_storage', 'security_storage'
      ];
      
      const validValues = ['granted', 'denied'];
      
      for (const field of requiredFields) {
        if (!(field in consent)) return false;
        if (!validValues.includes(consent[field])) return false;
      }
      
      return true;
    },
    
    // Validate event data
    isValidEventData(event) {
      if (!event || typeof event !== 'object') return false;
      
      // Check required fields
      if (!event.type || !event.timestamp) return false;
      
      // Validate timestamp
      if (typeof event.timestamp !== 'number' || event.timestamp <= 0) return false;
      
      // Validate type
      const validTypes = [
        'consent_change', 'tag_fired', 'tag_blocked', 'gtm_event',
        'cookiebot_event', 'simulation_event', 'real_event'
      ];
      if (!validTypes.includes(event.type)) return false;
      
      return true;
    },
    
    // Validate simulation data
    isValidSimulationData(data) {
      if (!data || typeof data !== 'object') return false;
      
      // Check for required fields
      if (typeof data.enabled !== 'boolean') return false;
      
      // If consent data is provided, validate it
      if (data.consent && !this.isValidConsentData(data.consent)) return false;
      
      return true;
    },
    
    // Sanitize string input
    sanitizeString(input, maxLength = 1000) {
      if (typeof input !== 'string') return '';
      
      // Remove potentially dangerous characters
      let sanitized = input
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/data:/gi, '') // Remove data: protocol
        .trim();
      
      // Limit length
      if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
      }
      
      return sanitized;
    },
    
    // Sanitize object input
    sanitizeObject(obj, maxDepth = 3) {
      if (!obj || typeof obj !== 'object') return {};
      
      const sanitized = {};
      
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize key
        const sanitizedKey = this.sanitizeString(key, 50);
        
        if (sanitizedKey) {
          // Sanitize value based on type
          if (typeof value === 'string') {
            sanitized[sanitizedKey] = this.sanitizeString(value);
          } else if (typeof value === 'number') {
            // Validate number
            if (isFinite(value) && value >= 0) {
              sanitized[sanitizedKey] = value;
            }
          } else if (typeof value === 'boolean') {
            sanitized[sanitizedKey] = value;
          } else if (Array.isArray(value)) {
            // Sanitize array (limit length)
            sanitized[sanitizedKey] = value.slice(0, 100).map(item => 
              typeof item === 'string' ? this.sanitizeString(item) : item
            );
          } else if (typeof value === 'object' && maxDepth > 0) {
            // Recursively sanitize object (with depth limit)
            sanitized[sanitizedKey] = this.sanitizeObject(value, maxDepth - 1);
          }
        }
      }
      
      return sanitized;
    }
  };
  
  // Message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    const handleMessage = async () => {
      try {
        // Validate request structure
        if (!request || typeof request !== 'object') {
          sendResponse({ error: 'Invalid request structure' });
          return;
        }
        
        // Validate action
        if (!request.action || typeof request.action !== 'string') {
          sendResponse({ error: 'Invalid action specified' });
          return;
        }
        
        // Sanitize request data
        const sanitizedRequest = InputValidator.sanitizeObject(request);
        
        switch (sanitizedRequest.action) {
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
            const tagResult = await sendMessageToPage('getTagStatus');
            sendResponse(tagResult);
            break;
            
          case 'applyConsent':
            // Validate consent data
            if (!sanitizedRequest.data || !InputValidator.isValidConsentData(sanitizedRequest.data)) {
              sendResponse({ error: 'Invalid consent data provided' });
              return;
            }
            
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const consentResult = await sendMessageToPage('updateConsent', sanitizedRequest.data);
            sendResponse(consentResult);
            break;
            
          case 'getEvents':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            
            try {
              // Get real events from chrome storage
              const result = await chrome.storage.local.get(['gtmInspectorEvents']);
              const realEvents = result.gtmInspectorEvents || [];
              
              // Also get events from page context (for backward compatibility)
              const pageEvents = await sendMessageToPage('getEvents');
              
              // Combine real events with page events, ensuring no duplicates
              const allEvents = [...realEvents];
              
              if (Array.isArray(pageEvents)) {
                pageEvents.forEach(pageEvent => {
                  // Only add if not already present (check by id or timestamp + type)
                  const exists = allEvents.some(realEvent => 
                    (realEvent.id && pageEvent.id && realEvent.id === pageEvent.id) ||
                    (realEvent.timestamp === pageEvent.timestamp && 
                     realEvent.type === pageEvent.type &&
                     realEvent.source === pageEvent.source)
                  );
                  
                  if (!exists) {
                    allEvents.push(pageEvent);
                  }
                });
              }
              
              // Sort by timestamp (newest first)
              allEvents.sort((a, b) => b.timestamp - a.timestamp);
              
              sendResponse(allEvents);
            } catch (error) {
              console.error('Error getting events:', error);
              sendResponse([]);
            }
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
            
          case 'clearEventLog':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const clearResult = await sendMessageToPage('clearEventLog');
            sendResponse(clearResult);
            break;
            
          case 'runDiagnostics':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const diagnosticResult = await sendMessageToPage('runDiagnostics');
            sendResponse(diagnosticResult);
            break;
            
          case 'exportLog':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const exportResult = await sendMessageToPage('exportLog');
            sendResponse(exportResult);
            break;
            
          case 'updateSimulationMode':
            // Ensure script is injected first
            if (!scriptInjected) {
              await injectScript();
            }
            // Use postMessage to communicate with page context
            const simulationResult = await sendMessageToPage('updateSimulationMode', request.data);
            sendResponse(simulationResult);
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
      
      // Send message to page context with specific origin
      window.postMessage({
        source: 'gtm-inspector-content',
        action: action,
        data: data,
        id: messageId
      }, window.location.origin);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', messageListener);
        console.error('Message timeout for action:', action);
        reject(new Error('Message timeout'));
      }, 5000);
    });
  }
  
  // Handle Cookiebot consent change notifications
  function setupCookiebotListeners() {
    // Listen for postMessage from website integration
    window.addEventListener('message', (event) => {
      // Validate origin
      if (!InputValidator.isValidOrigin(event.origin)) {
        console.warn('Rejected message from untrusted origin:', event.origin);
        return;
      }
      
      // Validate message structure
      if (!event.data || typeof event.data !== 'object') {
        console.warn('Invalid message structure received');
        return;
      }
      
      // Validate specific message types
      if (event.data.type === 'COOKIEBOT_CONSENT_CHANGE') {
        // Sanitize and validate consent data
        const sanitizedData = InputValidator.sanitizeObject(event.data.data);
        if (sanitizedData && Object.keys(sanitizedData).length > 0) {
          handleCookiebotConsentChange(sanitizedData);
        }
      }
    });
    
    // Listen for custom events from website integration
    window.addEventListener('cookiebotConsentChange', (event) => {
      handleCookiebotConsentChange(event.detail);
    });
    
    // Listen for actual Cookiebot events
    window.addEventListener('CookiebotOnAccept', (event) => {
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
            
            logTagEventToEventLog(event);
          }
        }
        
        return result;
      };
    }
  }
  
  // Set up immediate monitoring of gtag and dataLayer consent calls
  function setupImmediateMonitoring() {
    // Monitor gtag consent calls immediately
    if (window.gtag && typeof window.gtag === 'function') {
      const originalGtag = window.gtag;
      window.gtag = function(...args) {
        // Check if this is a consent call
        if (args[0] === 'consent') {
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
      console.error('Background script not available:', error);
    });
  }
  
  // Log consent change to event log
  function logConsentChangeToEventLog(consentData) {
    // Use postMessage to communicate with page context
    sendMessageToPage('logConsentChange', {
      action: consentData.action,
      consentData: consentData
    }).catch(error => {
      console.error('Could not log consent change to event log:', error);
    });
  }
  
  // Enhanced monitoring of Tag Manager interaction with Cookiebot
  function monitorTagManagerInteraction(consentData) {
    // Monitor gtag consent calls
    if (window.gtag && typeof window.gtag === 'function') {
      const originalGtag = window.gtag;
      window.gtag = function(...args) {
        // Check if this is a consent call
        if (args[0] === 'consent') {
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
    
    // Send to background script for storage
    chrome.runtime.sendMessage({
      action: 'logTagManagerInteraction',
      data: interaction
    }).catch(error => {
      console.error('Could not send interaction to background:', error);
    });
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
        setTimeout(() => {
          if (document.head || document.documentElement) {
            injectScript();
          }
        }, 1000);
      });
    } else {
      setTimeout(() => {
        if (document.head || document.documentElement) {
          injectScript();
        }
      }, 1000);
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
    },
    
    // Get current interaction data
    getInteractions: function() {
      return window.gtmInspectorInteractions || [];
    },
    
    // Clear interaction data
    clearInteractions: function() {
      window.gtmInspectorInteractions = [];
    },
    
    // Test gtag consent call
    testGtagConsent: function() {
      if (window.gtag) {
        window.gtag('consent', 'update', {
          analytics_storage: 'granted',
          ad_storage: 'denied'
        });
      }
    },
    
    // Test dataLayer consent event
    testDataLayerConsent: function() {
      if (window.dataLayer) {
        window.dataLayer.push(['consent', 'update', {
          analytics_storage: 'granted',
          ad_storage: 'denied'
        }]);
      }
    }
  };
})();