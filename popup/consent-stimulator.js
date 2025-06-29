// consent-simulator.js - Fixed UI update flow
const ConsentSimulator = (function() {
  let contentScriptInterface = null;

  // Consent presets configuration  
  const CONSENT_PRESETS = {
    'all-granted': {
      name: 'All Granted',
      description: 'Allow all tracking and analytics',
      settings: {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'granted',
        security_storage: 'granted'
      }
    },
    'all-denied': {
      name: 'All Denied',
      description: 'Block all tracking (privacy-first)',
      settings: {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        functionality_storage: 'denied',
        personalization_storage: 'denied',
        security_storage: 'denied'
      }
    },
    'analytics-only': {
      name: 'Analytics Only',
      description: 'Allow analytics but block advertising',
      settings: {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      }
    },
    'ads-only': {
      name: 'Ads Only',
      description: 'Allow advertising but block analytics',
      settings: {
        analytics_storage: 'denied',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      }
    },
    'functional-only': {
      name: 'Functional Only',
      description: 'Essential functionality only',
      settings: {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      }
    }
  };

  function initialize(contentInterface) {
    console.log('⚙️ Initializing ConsentSimulator...');
    contentScriptInterface = contentInterface;
    
    initializeConsentPresets();
    initializeApplyButton();
    
    // Load current consent state on initialization
    loadCurrentConsentState();
  }

  async function loadCurrentConsentState() {
    try {
      const result = await contentScriptInterface.sendMessage('checkGTM');
      if (result && result.consentState) {
        console.log('📊 Loading current consent state:', result.consentState);
        updateConsentToggles(result.consentState);
      } else {
        console.log('⚠️ No consent state available, using privacy-first defaults');
        const defaultPreset = CONSENT_PRESETS['functional-only'];
        updateConsentToggles(defaultPreset.settings);
      }
    } catch (error) {
      console.error('❌ Error loading consent state:', error);
    }
  }

  function initializeConsentPresets() {
    const presetItems = document.querySelectorAll('.dropdown-item[data-preset]');
    console.log('🎛️ Found preset buttons:', presetItems.length);
    
    presetItems.forEach(item => {
      item.addEventListener('click', function() {
        const preset = this.getAttribute('data-preset');
        console.log('🎯 Preset clicked:', preset);
        applyConsentPreset(preset);
      });
    });
  }

  function initializeApplyButton() {
    const applyBtn = document.getElementById('applyConsent');
    if (!applyBtn) {
      console.error('❌ Apply consent button not found');
      return;
    }

    applyBtn.addEventListener('click', async function() {
      console.log('⚡ Apply consent clicked');
      this.disabled = true;
      this.textContent = '⚡ Applying...';
      
      try {
        const settings = getConsentSettings();
        console.log('📤 Applying consent settings:', settings);
        
        const result = await contentScriptInterface.sendMessage('applyConsent', settings);
        
        if (result && result.success) {
          console.log('✅ Consent applied successfully');
          showNotification('✅ Consent applied!', 'success');
          
          // CRITICAL: Wait longer then force refresh the consent state
          setTimeout(async () => {
            await forceRefreshConsentState();
          }, 1500); // Increased delay
        } else {
          console.error('❌ Consent application failed:', result?.error);
          showNotification('❌ Failed: ' + (result?.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        console.error('❌ Apply consent error:', error);
        showNotification('❌ Error applying consent', 'error');
      } finally {
        this.disabled = false;
        this.textContent = '⚡ Apply Settings';
      }
    });
  }

  // NEW: Force refresh consent state after changes
  async function forceRefreshConsentState() {
    try {
      console.log('🔄 Force refreshing consent state...');
      
      // Get fresh consent state from page
      const freshResult = await contentScriptInterface.sendMessage('checkGTM');
      console.log('🔄 Fresh consent state received:', freshResult);
      
      if (freshResult && freshResult.consentState) {
        // Update our UI to match the actual page state
        updateConsentToggles(freshResult.consentState);
      }
      
      // Refresh other components
      if (window.TagList) {
        await window.TagList.refresh();
      }
      
      // Update main status display
      if (window.updateGTMStatusDisplay) {
        window.updateGTMStatusDisplay(freshResult);
      }
      
    } catch (error) {
      console.error('❌ Failed to force refresh consent state:', error);
    }
  }

  function applyConsentPreset(preset) {
    const presetConfig = CONSENT_PRESETS[preset];
    if (!presetConfig) {
      console.warn('⚠️ Unknown preset:', preset);
      return;
    }
    
    console.log(`🎯 Applying: ${presetConfig.name} - ${presetConfig.description}`);
    console.log('Settings:', presetConfig.settings);
    
    // IMMEDIATELY update the UI toggles to show intended state
    updateConsentToggles(presetConfig.settings);
    
    // Apply the settings automatically after a brief delay
    setTimeout(() => {
      const applyBtn = document.getElementById('applyConsent');
      if (applyBtn && !applyBtn.disabled) {
        applyBtn.click();
      }
    }, 100);
  }

  function getConsentSettings() {
    const settings = {
      analytics_storage: getSelectValue('analytics_storage', 'denied'),
      ad_storage: getSelectValue('ad_storage', 'denied'),
      functionality_storage: getSelectValue('functionality_storage', 'granted'),
      personalization_storage: getSelectValue('personalization_storage', 'denied'),
      security_storage: getSelectValue('security_storage', 'granted')
    };
    
    console.log('📋 Current consent settings from UI:', settings);
    return settings;
  }

  function getSelectValue(id, defaultValue) {
    const element = document.getElementById(id);
    return element ? element.value : defaultValue;
  }

  function updateConsentToggles(consentState) {
    console.log('🔄 Updating consent toggles with state:', consentState);
    
    for (const [key, value] of Object.entries(consentState)) {
      const element = document.getElementById(key);
      if (element) {
        const oldValue = element.value;
        element.value = value;
        
        console.log(`✅ Updated ${key}: ${oldValue} → ${value}`);
        
        // Add visual feedback for ANY change (not just different values)
        element.style.backgroundColor = value === 'granted' ? '#d4edda' : '#f8d7da';
        element.style.transition = 'background-color 0.3s ease';
        
        setTimeout(() => {
          element.style.backgroundColor = '';
        }, 2000);
      } else {
        console.warn(`⚠️ Element not found for ${key}`);
      }
    }
  }

  function showNotification(message, type = 'info') {
    console.log(`📢 Notification [${type}]: ${message}`);
    
    // Enhanced visual feedback
    const applyBtn = document.getElementById('applyConsent');
    if (applyBtn) {
      const originalText = applyBtn.textContent;
      const originalBg = applyBtn.style.backgroundColor;
      
      if (type === 'success') {
        applyBtn.textContent = '✅ Applied!';
        applyBtn.style.backgroundColor = '#28a745';
        applyBtn.style.color = 'white';
      } else {
        applyBtn.textContent = '❌ Failed';
        applyBtn.style.backgroundColor = '#dc3545';
        applyBtn.style.color = 'white';
      }
      
      setTimeout(() => {
        applyBtn.textContent = originalText;
        applyBtn.style.backgroundColor = originalBg;
        applyBtn.style.color = '';
      }, 2000);
    }
  }

  // Utility functions
  function getAvailablePresets() {
    return Object.keys(CONSENT_PRESETS).map(key => ({
      key,
      ...CONSENT_PRESETS[key]
    }));
  }

  function getPreset(presetKey) {
    return CONSENT_PRESETS[presetKey] || null;
  }

  // Public API
  return {
    initialize,
    updateConsentToggles,
    applyConsentPreset,
    loadCurrentConsentState,
    forceRefreshConsentState, // NEW: Expose for external calls
    getAvailablePresets,
    getPreset
  };
})();

// Make available globally
window.ConsentSimulator = ConsentSimulator;