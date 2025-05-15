// utils.js - Shared utility functions

// Toggle overlay in the page
export function toggleOverlay() {
  let overlay = document.getElementById('gtm-consent-inspector-overlay');
  
  if (overlay) {
    overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
  } else {
    createOverlay();
  }
}

// Create overlay in the page
function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'gtm-consent-inspector-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 300px;
    max-height: 80vh;
    overflow-y: auto;
    background-color: rgba(255, 255, 255, 0.95);
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 10px;
    font-family: Arial, sans-serif;
    font-size: 12px;
    z-index: 9999999;
  `;
  
  document.body.appendChild(overlay);
  updateOverlay();
}

// Update overlay content
export function updateOverlay() {
  // Implementation goes here...
}

// Check for GTM on the page
export function checkForGTM() {
  // Check if GTM is loaded
  const hasGTM = window.google_tag_manager !== undefined;
  let gtmId = '';
  let hasConsentMode = false;
  let consentState = {};
  let tags = [];
  let events = [];
  
  if (hasGTM) {
    // Try to get the GTM ID
    for (const key in window.google_tag_manager) {
      if (key.startsWith('GTM-')) {
        gtmId = key;
        break;
      }
    }
    
    // Check for Consent Mode
    if (window.gtag) {
      try {
        // Check if consent properties exist in dataLayer
        const dataLayer = window.dataLayer || [];
        for (let i = 0; i < dataLayer.length; i++) {
          if (Array.isArray(dataLayer[i]) && 
              dataLayer[i][0] === 'consent' && 
              (dataLayer[i][1] === 'default' || dataLayer[i][1] === 'update')) {
            hasConsentMode = true;
            consentState = dataLayer[i][2] || {};
            break;
          }
        }
        
        // Get current tags status
        tags = getTagStatus();
        
        // Get event log
        events = getEventLog();
        
        // If no event logger is set up, initialize it
        if (!window.gtmConsentInspector) {
          initEventLogger();
        }
      } catch (e) {
        console.error('Error checking for Consent Mode:', e);
      }
    }
  }
  
  return {
    hasGTM,
    gtmId,
    hasConsentMode,
    consentState,
    tags,
    events
  };
}

// Get current consent state
export function getCurrentConsentState() {
  const consentState = {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted'
  };
  
  // Try to get current consent state from dataLayer
  const dataLayer = window.dataLayer || [];
  for (let i = dataLayer.length - 1; i >= 0; i--) {
    if (Array.isArray(dataLayer[i]) && 
        (dataLayer[i][0] === 'consent' && (dataLayer[i][1] === 'default' || dataLayer[i][1] === 'update'))) {
      const consentUpdate = dataLayer[i][2] || {};
      for (const key in consentUpdate) {
        consentState[key] = consentUpdate[key];
      }
    }
  }
  
  return consentState;
}

// Initialize event logger in the page
export function initEventLogger() {
  // Create event storage if it doesn't exist
  if (!window.gtmConsentInspector) {
    window.gtmConsentInspector = {
      events: [],
      originalDataLayerPush: null,
      originalGtagFunction: null
    };
  }
  
  // Override dataLayer.push to log events
  if (window.dataLayer && !window.gtmConsentInspector.originalDataLayerPush) {
    window.gtmConsentInspector.originalDataLayerPush = window.dataLayer.push;
    
    window.dataLayer.push = function() {
      // Call the original push method
      const result = window.gtmConsentInspector.originalDataLayerPush.apply(this, arguments);
      
      // Log the event
      try {
        const event = arguments[0];
        
        // Skip internal GTM events
        if (typeof event === 'object' && !Array.isArray(event) && event.event && !event.event.startsWith('gtm.')) {
          window.gtmConsentInspector.events.push({
            timestamp: new Date().getTime(),
            type: 'dataLayer.push',
            category: 'gtm',
            details: `Event: ${event.event}, Data: ${JSON.stringify(event).substring(0, 100)}...`
          });
        }
        
        // Log consent events specifically
        if (Array.isArray(event) && event[0] === 'consent') {
          window.gtmConsentInspector.events.push({
            timestamp: new Date().getTime(),
            type: 'Consent Update',
            category: 'consent',
            details: `Action: ${event[1]}, Settings: ${JSON.stringify(event[2])}`
          });
        }
      } catch (e) {
        console.error('Error logging dataLayer event:', e);
      }
      
      return result;
    };
  }
  
  // Override gtag function to log events
  if (window.gtag && !window.gtmConsentInspector.originalGtagFunction) {
    window.gtmConsentInspector.originalGtagFunction = window.gtag;
    
    window.gtag = function() {
      // Call the original gtag function
      const result = window.gtmConsentInspector.originalGtagFunction.apply(this, arguments);
      
      // Log the event
      try {
        const args = Array.from(arguments);
        
        // Special handling for consent updates
        if (args[0] === 'consent') {
          window.gtmConsentInspector.events.push({
            timestamp: new Date().getTime(),
            type: 'gtag Consent',
            category: 'consent',
            details: `Action: ${args[1]}, Settings: ${JSON.stringify(args[2])}`
          });
        } else if (args[0] === 'event') {
          window.gtmConsentInspector.events.push({
            timestamp: new Date().getTime(),
            type: 'gtag Event',
            category: 'gtm',
            details: `Event: ${args[1]}, Parameters: ${JSON.stringify(args[2])}`
          });
        }
      } catch (e) {
        console.error('Error logging gtag event:', e);
      }
      
      return result;
    };
  }
  
  // Also monitor tag execution
  monitorTagExecution();
  
  return true;
}

// Monitor tag execution
function monitorTagExecution() {
  // Implementation goes here...
}