// injected-script.js - WORKING MINIMAL VERSION
console.log('🔍 GTM Inspector: Injected script loading...');

// Create ConsentInspector in the page context
window.ConsentInspector = {
  detectGTM: function() {
    console.log('🔍 Running GTM detection...');
    
    const result = {
      hasGTM: false,
      gtmId: '',
      containers: [],
      primaryContainer: null,
      hasConsentMode: false,
      consentState: {},
      overrideActive: false,
      timestamp: Date.now()
    };
    
    // Check for GTM
    if (window.google_tag_manager) {
      result.hasGTM = true;
      const containerIds = Object.keys(window.google_tag_manager);
      result.gtmId = containerIds[0] || '';
      
      containerIds.forEach(id => {
        const container = window.google_tag_manager[id];
        result.containers.push({
          id: id,
          method: 'window.google_tag_manager',
          dataLayer: (container.dataLayer && Array.isArray(container.dataLayer)) ? container.dataLayer.length : 0,
          hasConsentMode: this.detectConsentMode()
        });
      });
      
      result.primaryContainer = result.containers[0] || null;
    }
    
    // Check for consent mode
    result.hasConsentMode = this.detectConsentMode();
    result.consentState = this.getCurrentConsentState();
    
    console.log('🎯 GTM Detection result:', result);
    return result;
  },
  
  detectConsentMode: function() {
    if (window.gtag) return true;
    
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      return window.dataLayer.some(item => 
        Array.isArray(item) && item[0] === 'consent'
      );
    }
    
    return false;
  },
  
  getCurrentConsentState: function() {
    const defaultState = {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted'
    };
    
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      for (let i = window.dataLayer.length - 1; i >= 0; i--) {
        const item = window.dataLayer[i];
        if (Array.isArray(item) && item[0] === 'consent' && 
            (item[1] === 'default' || item[1] === 'update') && item[2]) {
          return { ...defaultState, ...item[2] };
        }
      }
    }
    
    return defaultState;
  },
  
  updateConsent: function(settings) {
    console.log('🔧 Updating consent:', settings);
    
    if (window.gtag && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', settings);
      return { success: true, method: 'gtag' };
    }
    
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      window.dataLayer.push(['consent', 'update', settings]);
      return { success: true, method: 'dataLayer' };
    }
    
    return { success: false, error: 'No consent mechanism available' };
  },
  
  getTagInfo: function() {
    const tags = [];
    const consentState = this.getCurrentConsentState();
    
    // Check for various tags
    if (window.gtag || document.querySelector('script[src*="gtag/js"]')) {
      tags.push({
        name: 'Google Analytics 4',
        type: 'analytics',
        allowed: consentState.analytics_storage === 'granted',
        reason: `analytics_storage ${consentState.analytics_storage}`,
        consentType: 'analytics_storage'
      });
    }
    
    if (window.ga || document.querySelector('script[src*="analytics.js"]')) {
      tags.push({
        name: 'Universal Analytics',
        type: 'analytics',
        allowed: consentState.analytics_storage === 'granted',
        reason: `analytics_storage ${consentState.analytics_storage}`,
        consentType: 'analytics_storage'
      });
    }
    
    if (window.fbq || document.querySelector('script[src*="connect.facebook.net"]')) {
      tags.push({
        name: 'Facebook Pixel',
        type: 'advertising',
        allowed: consentState.ad_storage === 'granted',
        reason: `ad_storage ${consentState.ad_storage}`,
        consentType: 'ad_storage'
      });
    }
    
    console.log('🏷️ Detected tags:', tags);
    return tags;
  },
  
  getPerformanceMetrics: function() {
    return {
      totalTime: Date.now() - (this._startTime || Date.now()),
      memory: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null,
      triggerCount: 0,
      variableCount: 0,
      timestamp: Date.now()
    };
  },
  
  getEvents: function() {
    return this._events || [];
  },
  
  _events: [],
  _startTime: Date.now(),
  
  // Helper methods
  allowAll: function() {
    return this.updateConsent({
      analytics_storage: 'granted',
      ad_storage: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted'
    });
  },
  
  denyAll: function() {
    return this.updateConsent({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'denied'
    });
  }
};

// Listen for messages from content script
window.addEventListener('message', function(event) {
  if (event.data.source === 'gtm-inspector-content') {
    const { action, data, id } = event.data;
    let response = null;
    
    try {
      switch (action) {
        case 'detectGTM':
          response = window.ConsentInspector.detectGTM();
          break;
        case 'updateConsent':
          response = window.ConsentInspector.updateConsent(data);
          break;
        case 'getTagInfo':
          response = window.ConsentInspector.getTagInfo();
          break;
        case 'getEvents':
          response = window.ConsentInspector.getEvents();
          break;
        case 'getPerformanceMetrics':
          response = window.ConsentInspector.getPerformanceMetrics();
          break;
        default:
          response = { error: 'Unknown action: ' + action };
      }
    } catch (error) {
      response = { error: error.message };
    }
    
    // Send response back
    window.postMessage({
      source: 'gtm-inspector-page-response',
      id: id,
      data: response
    }, '*');
  }
});

console.log('✅ GTM Inspector: ConsentInspector created successfully!');
console.log('💡 Try: ConsentInspector.detectGTM()');