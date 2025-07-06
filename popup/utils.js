// utils.js - Fixed all syntax errors

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
    checkForGTM,
    getCurrentConsentState,
    initEventLogger
  };
}