// consent-simulator.js - Consent simulation UI

// Initialize consent simulator
export function initializeConsentSimulator(contentScriptInterface) {
  // Initialize consent presets dropdown
  initializeConsentPresets();
  
  // Add event listener to apply button
  document.getElementById('applyConsent').addEventListener('click', function() {
    applyCurrentConsentSettings(contentScriptInterface);
  });
}

// Initialize consent presets
function initializeConsentPresets() {
  const presetItems = document.querySelectorAll('.dropdown-item[data-preset]');
  
  presetItems.forEach(item => {
    item.addEventListener('click', function() {
      const preset = this.getAttribute('data-preset');
      applyConsentPreset(preset);
    });
  });
}

// Apply consent preset
export function applyConsentPreset(preset) {
  let settings = {};
  
  switch (preset) {
    case 'all-granted':
      settings = {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'granted',
        security_storage: 'granted'
      };
      break;
    case 'all-denied':
      settings = {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        functionality_storage: 'denied',
        personalization_storage: 'denied',
        security_storage: 'denied'
      };
      break;
    case 'analytics-only':
      settings = {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      };
      break;
    case 'ads-only':
      settings = {
        analytics_storage: 'denied',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      };
      break;
    case 'functional-only':
      settings = {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      };
      break;
  }
  
  // Update the UI
  updateConsentToggles(settings);
  
  // Apply the settings
  document.getElementById('applyConsent').click();
}

// Apply current consent settings
function applyCurrentConsentSettings(contentScriptInterface) {
  const consentSettings = {
    analytics_storage: document.getElementById('analytics_storage').value,
    ad_storage: document.getElementById('ad_storage').value,
    functionality_storage: document.getElementById('functionality_storage').value,
    personalization_storage: document.getElementById('personalization_storage').value,
    security_storage: document.getElementById('security_storage').value
  };
  
  contentScriptInterface.executeInPage(applyConsentSettings, [consentSettings], function(result) {
    if (result) {
      // After applying consent, refresh the tag status
      setTimeout(() => refreshTagStatus(contentScriptInterface), 500);
    }
  });
}

// Update consent toggles
export function updateConsentToggles(consentState) {
  for (const [key, value] of Object.entries(consentState)) {
    const element = document.getElementById(key);
    if (element) {
      element.value = value;
    }
  }
}

// Content script function - Apply consent settings 
function applyConsentSettings(consentSettings) {
  if (!window.gtag) {
    console.error('gtag not found');
    return false;
  }
  
  try {
    // Log the event before applying
    if (window.gtmConsentInspector) {
      window.gtmConsentInspector.events.push({
        timestamp: new Date().getTime(),
        type: 'Simulated Consent',
        category: 'consent',
        details: `Updated settings: ${JSON.stringify(consentSettings)}`
      });
    }
    
    // Apply the consent settings
    window.gtag('consent', 'update', consentSettings);
    
    // Update overlay if visible
    if (typeof updateOverlay === 'function') {
      updateOverlay();
    }
    
    return true;
  } catch (e) {
    console.error('Error applying consent settings:', e);
    return false;
  }
}