// consent-simulator.js - Converted to IIFE pattern
const ConsentSimulator = (function() {
  let contentScriptInterface = null;

  function initialize(contentInterface) {
    console.log('⚙️ Initializing ConsentSimulator...');
    contentScriptInterface = contentInterface;
    
    initializeConsentPresets();
    initializeApplyButton();
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
        
        if (result.success) {
          console.log('✅ Consent applied successfully');
          showNotification('✅ Consent applied!', 'success');
          
          // Refresh tags after applying consent
          setTimeout(async () => {
            if (window.TagList) {
              await window.TagList.refresh();
            }
            
            // Refresh the GTM status display
            try {
              const updatedGTMResult = await contentScriptInterface.sendMessage('checkGTM');
              console.log('🔄 Updated GTM status after consent change:', updatedGTMResult);
              
              // Update the status display if function is available
              if (updatedGTMResult && window.updateGTMStatusDisplay) {
                window.updateGTMStatusDisplay(updatedGTMResult);
              } else {
                console.log('📊 New consent state:', updatedGTMResult?.consentState);
              }
            } catch (error) {
              console.error('❌ Failed to refresh GTM status:', error);
            }
          }, 1000);
        } else {
          console.error('❌ Consent application failed:', result.error);
          showNotification('❌ Failed: ' + (result.error || 'Unknown error'), 'error');
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

  function applyConsentPreset(preset) {
    console.log('🎯 Applying consent preset:', preset);
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
      default:
        console.warn('⚠️ Unknown preset:', preset);
        return;
    }
    
    // Update the UI toggles
    updateConsentToggles(settings);
    
    // Apply the settings automatically
    setTimeout(() => {
      const applyBtn = document.getElementById('applyConsent');
      if (applyBtn) {
        applyBtn.click();
      }
    }, 100);
  }

  function getConsentSettings() {
    const settings = {
      analytics_storage: getSelectValue('analytics_storage', 'granted'),
      ad_storage: getSelectValue('ad_storage', 'granted'),
      functionality_storage: getSelectValue('functionality_storage', 'granted'),
      personalization_storage: getSelectValue('personalization_storage', 'granted'),
      security_storage: getSelectValue('security_storage', 'granted')
    };
    
    console.log('📋 Current consent settings:', settings);
    return settings;
  }

  function getSelectValue(id, defaultValue) {
    const element = document.getElementById(id);
    return element ? element.value : defaultValue;
  }

  function updateConsentToggles(consentState) {
    console.log('🔄 Updating consent toggles:', consentState);
    
    for (const [key, value] of Object.entries(consentState)) {
      const element = document.getElementById(key);
      if (element && element.value !== value) {
        element.value = value;
        console.log(`✅ Updated ${key} to ${value}`);
      }
    }
  }

  function showNotification(message, type = 'info') {
    console.log(`📢 Notification [${type}]: ${message}`);
    
    // Simple visual feedback - could be enhanced later
    const applyBtn = document.getElementById('applyConsent');
    if (applyBtn) {
      const originalText = applyBtn.textContent;
      applyBtn.textContent = type === 'success' ? '✅ Applied!' : '❌ Failed';
      applyBtn.style.backgroundColor = type === 'success' ? '#28a745' : '#dc3545';
      
      setTimeout(() => {
        applyBtn.textContent = originalText;
        applyBtn.style.backgroundColor = '';
      }, 2000);
    }
  }

  // Public API
  return {
    initialize,
    updateConsentToggles,
    applyConsentPreset
  };
})();

// Make available globally
window.ConsentSimulator = ConsentSimulator;