// utils.js - Fixed all syntax errors

// Toggle overlay in the page
function toggleOverlay() {
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
function updateOverlay() {
  const overlay = document.getElementById('gtm-consent-inspector-overlay');
  if (overlay) {
    overlay.innerHTML = '<p>GTM Inspector Overlay Active</p>';
  }
}

// Check for GTM on the page
function checkForGTM() {
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
function getCurrentConsentState() {
  const consentState = {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted'
  };
  
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
function initEventLogger() {
  if (!window.gtmConsentInspector) {
    window.gtmConsentInspector = {
      events: [],
      originalDataLayerPush: null,
      originalGtagFunction: null
    };
  }
  
  return true;
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window.GTMUtils = {
    toggleOverlay,
    createOverlay,
    updateOverlay,
    checkForGTM,
    getCurrentConsentState,
    initEventLogger
  };
}