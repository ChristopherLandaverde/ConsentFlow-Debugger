// injected-script.js - Enhanced with consent persistence and performance optimizations
console.log('🔍 GTM Inspector: Injected script loading in page context...');

// Performance monitoring
const PerformanceMonitor = {
  startTime: Date.now(),
  metrics: {
    detectionTime: 0,
    memoryUsage: 0,
    dataLayerSize: 0,
    triggerCount: 0,
    variableCount: 0
  },
  
  startTimer: function(name) {
    this[`${name}Start`] = Date.now();
  },
  
  endTimer: function(name) {
    if (this[`${name}Start`]) {
      this.metrics[name] = Date.now() - this[`${name}Start`];
      console.log(`⏱️ ${name} took ${this.metrics[name]}ms`);
    }
  },
  
  getMemoryUsage: function() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  },
  
  getMetrics: function() {
    return {
      ...this.metrics,
      totalTime: Date.now() - this.startTime,
      memory: this.getMemoryUsage()
    };
  }
};

// Error handling utilities
const ErrorHandler = {
  wrapFunction: function(fn, context = 'unknown') {
    return function(...args) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        console.error(`❌ Error in ${context}:`, error);
        return { error: error.message, context };
      }
    };
  },
  
  safeExecute: function(fn, fallback = null, context = 'unknown') {
    try {
      return fn();
    } catch (error) {
      console.error(`❌ Error in ${context}:`, error);
      return fallback;
    }
  },
  
  retry: function(fn, maxAttempts = 3, delay = 100, context = 'unknown') {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      
      const attempt = () => {
        attempts++;
        try {
          const result = fn();
          resolve(result);
        } catch (error) {
          console.warn(`⚠️ Attempt ${attempts} failed in ${context}:`, error);
          
          if (attempts >= maxAttempts) {
            reject(error);
          } else {
            setTimeout(attempt, delay * attempts);
          }
        }
      };
      
      attempt();
    });
  }
};

// Lazy loading manager
const LazyLoader = {
  loadedModules: new Set(),
  
  loadModule: function(moduleName, loader) {
    if (this.loadedModules.has(moduleName)) {
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      try {
        const result = loader();
        this.loadedModules.add(moduleName);
        console.log(`📦 Lazy loaded module: ${moduleName}`);
        resolve(result);
      } catch (error) {
        console.error(`❌ Failed to load module ${moduleName}:`, error);
        reject(error);
      }
    });
  },
  
  isLoaded: function(moduleName) {
    return this.loadedModules.has(moduleName);
  }
};

// Create ConsentInspector in the REAL page context
window.ConsentInspector = {
  // Store our override state
  _overrideActive: false,
  _overrideState: null,
  _originalGtag: null,
  _originalDataLayerPush: null,
  _performanceMonitor: PerformanceMonitor,
  _errorHandler: ErrorHandler,
  _lazyLoader: LazyLoader,
  
  // Performance monitoring methods
  getPerformanceMetrics: function() {
    return this._performanceMonitor.getMetrics();
  },
  
  // Enhanced error handling wrapper
  safeExecute: function(fn, fallback = null, context = 'ConsentInspector') {
    return this._errorHandler.safeExecute(fn, fallback, context);
  },
  
  // Lazy loading for heavy operations
  _loadTriggerDetection: function() {
    return this._lazyLoader.loadModule('triggerDetection', () => {
      // This will be loaded only when needed
      return this.detectTriggersAndVariables();
    });
  },
  
  _loadVariableDetection: function() {
    return this._lazyLoader.loadModule('variableDetection', () => {
      // This will be loaded only when needed
      return this.detectTriggersAndVariables();
    });
  },
  
  // IAB TCF Framework detection
  detectIABTCF: function() {
    console.log('🔍 Detecting IAB TCF Framework...');
    this._performanceMonitor.startTimer('tcfDetection');
    
    const tcfInfo = {
      version: null,
      consentString: null,
      vendorConsents: {},
      purposeConsents: {},
      cmpId: null,
      cmpVersion: null,
      gdprApplies: false,
      detected: false
    };
    
    // Check for TCF v2.2 (most common) - prioritize this
    if (window.__tcfapi) {
      console.log('🎯 TCF v2.2 API detected');
      tcfInfo.version = '2.2';
      tcfInfo.detected = true;
      
      // Try to get current consent info
      try {
        window.__tcfapi('getTCData', 2, (tcData, success) => {
          if (success && tcData) {
            tcfInfo.consentString = tcData.tcString;
            tcfInfo.cmpId = tcData.cmpId;
            tcfInfo.cmpVersion = tcData.cmpVersion;
            tcfInfo.gdprApplies = tcData.gdprApplies;
            
            if (tcData.purpose && tcData.purpose.consents) {
              tcfInfo.purposeConsents = tcData.purpose.consents;
            }
            
            if (tcData.vendor && tcData.vendor.consents) {
              tcfInfo.vendorConsents = tcData.vendor.consents;
            }
          }
        });
        console.log('✅ TCF v2.2 data retrieved');
      } catch (e) {
        console.log('⚠️ Error getting TCF v2.2 data:', e);
      }
    }
    // Only check v1.1 if v2.2 is not present
    else if (window.__cmp) {
      console.log('🎯 TCF v1.1 API detected');
      tcfInfo.version = '1.1';
      tcfInfo.detected = true;
      
      // Try to get consent string
      try {
        window.__cmp('getConsentData', null, (consentData) => {
          if (consentData && consentData.consentData) {
            tcfInfo.consentString = consentData.consentData;
            tcfInfo.gdprApplies = consentData.gdprApplies;
          }
        });
      } catch (e) {
        console.log('⚠️ Error getting TCF v1.1 data:', e);
      }
    }
    
    // Check for common CMP implementations
    const cmpDetection = this.detectCMP();
    if (cmpDetection.detected && !tcfInfo.cmpId) {
      tcfInfo.cmpId = cmpDetection.cmpId;
      tcfInfo.cmpVersion = cmpDetection.version;
    }
    
    // Check for consent string in cookies
    if (!tcfInfo.consentString) {
      const consentCookie = this.findConsentCookie();
      if (consentCookie) {
        tcfInfo.consentString = consentCookie;
      }
    }
    
    this._performanceMonitor.endTimer('tcfDetection');
    console.log('🎯 IAB TCF detection result:', tcfInfo);
    return tcfInfo;
  },
  
  // Enhanced CMP detection
  detectCMP: function() {
    console.log('🔍 Detecting Consent Management Platform...');
    this._performanceMonitor.startTimer('cmpDetection');
    
    const cmps = [
      {
        name: 'OneTrust',
        check: () => window.OneTrust || document.querySelector('[data-domain-script*="cdn.cookielaw.org"]'),
        version: () => window.OneTrust ? window.OneTrust.version : null,
        cmpId: 5
      },
      {
        name: 'Cookiebot',
        check: () => window.Cookiebot || document.querySelector('[data-cookieconsent]'),
        version: () => window.Cookiebot ? window.Cookiebot.version : null,
        cmpId: 14
      },
      {
        name: 'TrustArc',
        check: () => window.truste || document.querySelector('[data-truste]'),
        version: () => window.truste ? window.truste.version : null,
        cmpId: 21
      },
      {
        name: 'Quantcast',
        check: () => window.__tcfapi || document.querySelector('[data-quantcast]'),
        version: () => null,
        cmpId: 22
      },
      {
        name: 'Sourcepoint',
        check: () => window.__spapi || document.querySelector('[data-sp-cc]'),
        version: () => null,
        cmpId: 24
      },
      {
        name: 'Didomi',
        check: () => window.didomi || document.querySelector('[data-didomi]'),
        version: () => window.didomi ? window.didomi.version : null,
        cmpId: 7
      },
      {
        name: 'Usercentrics',
        check: () => window.UC_UI || document.querySelector('[data-usercentrics]'),
        version: () => null,
        cmpId: 11
      },
      {
        name: 'Ebay',
        check: () => window.ebay || document.querySelector('[data-ebay-consent]'),
        version: () => null,
        cmpId: 28
      }
    ];
    
    // Check each CMP and return the first one found
    for (const cmp of cmps) {
      if (cmp.check()) {
        console.log(`🎯 CMP detected: ${cmp.name}`);
        return {
          detected: true,
          name: cmp.name,
          version: cmp.version(),
          cmpId: cmp.cmpId
        };
      }
    }
    
    this._performanceMonitor.endTimer('cmpDetection');
    console.log('❌ No known CMP detected');
    return {
      detected: false,
      name: null,
      version: null,
      cmpId: null
    };
  },
  
  // Find consent cookie
  findConsentCookie: function() {
    const consentCookies = [
      'euconsent',
      'euconsent-v2',
      'consent-string',
      'tcf_consent',
      'gdpr_consent',
      'cookieconsent_status',
      'OptanonAlertBoxClosed',
      'CookieConsent'
    ];
    
    for (const cookieName of consentCookies) {
      const cookie = this.getCookie(cookieName);
      if (cookie) {
        console.log(`🎯 Found consent cookie: ${cookieName}`);
        return cookie;
      }
    }
    
    return null;
  },
  
  // Helper to get cookie value
  getCookie: function(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  },
  
  // Parse TCF consent string
  parseTCFConsentString: function(consentString) {
    if (!consentString || typeof consentString !== 'string') {
      console.log('⚠️ Invalid consent string provided:', consentString);
      return null;
    }
    
    try {
      // Basic TCF v2 consent string parsing
      // Format: Base64 encoded string with specific structure
      const decoded = atob(consentString);
      
      // This is a simplified parser - full TCF parsing is complex
      return {
        raw: consentString,
        decoded: decoded,
        length: consentString.length,
        version: this.extractTCFVersion(decoded)
      };
    } catch (e) {
      console.log('⚠️ Error parsing TCF consent string:', e);
      return null;
    }
  },
  
  // Extract TCF version from consent string
  extractTCFVersion: function(decoded) {
    // Simplified version extraction
    // In practice, this would parse the binary structure
    return '2.2'; // Default assumption
  },
  
  // Detection methods
  detectGTM: function() {
    console.log('🔍 Running GTM detection...');
    
    const containers = [];
    
    // Method 1: Check window.google_tag_manager for all containers
    if (window.google_tag_manager) {
      const gtmKeys = Object.keys(window.google_tag_manager);
      gtmKeys.forEach(key => {
        if (key.startsWith('GTM-')) {
          const container = window.google_tag_manager[key];
          const dataLayer = (container.dataLayer && Array.isArray(container.dataLayer)) ? container.dataLayer : [];
          
          containers.push({
            id: key,
            method: 'window.google_tag_manager',
            dataLayer: dataLayer.length, // Just send the count, not the actual array
            hasConsentMode: this.detectConsentModeForContainer(key)
          });
        }
      });
    }
    
    // Method 2: Check all GTM script tags
    const gtmScripts = document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]');
    gtmScripts.forEach(script => {
      const src = script.src;
      const match = src.match(/[?&]id=([^&]+)/);
      if (match && match[1].startsWith('GTM-')) {
        const containerId = match[1];
        
        // Check if we already found this container
        const existing = containers.find(c => c.id === containerId);
        if (!existing) {
          containers.push({
            id: containerId,
            method: 'script_tag',
            dataLayer: (window.dataLayer && Array.isArray(window.dataLayer)) ? window.dataLayer.length : 0,
            hasConsentMode: this.detectConsentModeForContainer(containerId)
          });
        }
      }
    });
    
    // Method 3: Check for gtag configurations (GA4)
    if (window.gtag && typeof window.gtag === 'function') {
      // Look for gtag config calls that might indicate additional containers
      const gtagConfigs = this.findGtagConfigs();
      gtagConfigs.forEach(config => {
        if (config.startsWith('GTM-') && !containers.find(c => c.id === config)) {
          containers.push({
            id: config,
            method: 'gtag_config',
            dataLayer: (window.dataLayer && Array.isArray(window.dataLayer)) ? window.dataLayer.length : 0,
            hasConsentMode: this.detectConsentModeForContainer(config)
          });
        }
      });
    }
    
    // Get overall consent state (from primary container or global)
    const primaryContainer = containers[0] || null;
    const overallConsentState = this.getCurrentConsentState();
    
    // Enhanced with IAB TCF detection
    const tcfInfo = this.detectIABTCF();
    const cmpInfo = this.detectCMP();
    
    return {
      hasGTM: containers.length > 0,
      containers: containers,
      primaryContainer: primaryContainer,
      gtmId: primaryContainer ? primaryContainer.id : '', // Backward compatibility
      hasConsentMode: this.detectConsentMode(),
      consentState: overallConsentState,
      overrideActive: this._overrideActive,
      timestamp: Date.now(),
      // NEW: IAB TCF information
      tcfInfo: tcfInfo,
      cmpInfo: cmpInfo
    };
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
  
  // NEW: Detect consent mode for a specific container
  detectConsentModeForContainer: function(containerId) {
    // Check if this specific container has consent mode
    if (window.google_tag_manager && window.google_tag_manager[containerId]) {
      const container = window.google_tag_manager[containerId];
      if (container.dataLayer && Array.isArray(container.dataLayer)) {
        return container.dataLayer.some(item => 
          Array.isArray(item) && item[0] === 'consent'
        );
      }
    }
    
    // Fallback to global detection
    return this.detectConsentMode();
  },
  
  // NEW: Find gtag configurations
  findGtagConfigs: function() {
    const configs = [];
    
    // Look for gtag config calls in the page
    if (window.gtag && typeof window.gtag === 'function') {
      // We can't directly inspect gtag calls, but we can look for common patterns
      // This is a simplified approach - in practice, you might need to monitor gtag calls
      try {
        // Check if there are any GTM IDs in the page source
        const pageSource = document.documentElement.outerHTML;
        const gtmMatches = pageSource.match(/GTM-[A-Z0-9]+/g);
        if (gtmMatches) {
          configs.push(...gtmMatches);
        }
      } catch (e) {
        console.log('Could not search page source for GTM configs:', e);
      }
    }
    
    return [...new Set(configs)]; // Remove duplicates
  },
  
  getCurrentConsentState: function() {
    // If we have an active override, return our override state
    if (this._overrideActive && this._overrideState) {
      console.log('🎯 Returning override consent state:', this._overrideState);
      return this._overrideState;
    }
    
    // Otherwise, read the actual page state
    console.log('🔍 Reading actual page consent state...');
    
    let consentFromDataLayer = null;
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      for (let i = window.dataLayer.length - 1; i >= 0; i--) {
        const item = window.dataLayer[i];
        if (Array.isArray(item) && item[0] === 'consent' && 
            (item[1] === 'default' || item[1] === 'update') && item[2]) {
          consentFromDataLayer = item[2];
          console.log('🎯 Found consent in dataLayer:', item);
          break;
        }
      }
    }
    
    const finalState = consentFromDataLayer || {
      analytics_storage: this.detectConsentMode() ? 'denied' : 'granted',
      ad_storage: this.detectConsentMode() ? 'denied' : 'granted', 
      functionality_storage: 'granted',
      personalization_storage: this.detectConsentMode() ? 'denied' : 'granted',
      security_storage: 'granted'
    };
    
    console.log('🎯 Final consent state:', finalState);
    return finalState;
  },
  
  // ENHANCED: Consent override with persistence
  updateConsent: function(settings) {
    console.log('🔧 Updating consent with OVERRIDE:', settings);
    
    // Store our override state
    this._overrideState = { ...settings };
    this._overrideActive = true;
    
    // Set up monitoring to maintain our override
    this._maintainConsentOverride();
    
    let success = false;
    let method = '';
    
    // Apply the consent using available methods
    if (window.gtag && typeof window.gtag === 'function') {
      try {
        console.log('🔧 Applying via gtag...');
        window.gtag('consent', 'update', settings);
        success = true;
        method = 'gtag';
      } catch (e) {
        console.error('❌ gtag failed:', e);
      }
    }
    
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      try {
        console.log('🔧 Applying via dataLayer...');
        window.dataLayer.push(['consent', 'update', settings]);
        success = true;
        method = method ? method + '+dataLayer' : 'dataLayer';
      } catch (e) {
        console.error('❌ dataLayer failed:', e);
      }
    }
    
    // Force trigger event
    if (success && window.dataLayer) {
      try {
        window.dataLayer.push({
          'event': 'gtm_consent_inspector_override',
          'consent_settings': settings
        });
      } catch (e) {
        console.log('⚠️ Could not trigger event:', e);
      }
    }
    
    if (success) {
      console.log(`✅ Consent override activated via ${method}`);
      return { success: true, method: method, override: true };
    } else {
      this._overrideActive = false;
      this._overrideState = null;
      return { success: false, error: 'No consent mechanism available' };
    }
  },
  
  // NEW: Maintain consent override against site changes
  _maintainConsentOverride: function() {
    if (this._overrideActive) {
      console.log('🛡️ Setting up consent override protection...');
      
      // Re-apply our override every 2 seconds
      const overrideInterval = setInterval(() => {
        if (!this._overrideActive) {
          clearInterval(overrideInterval);
          return;
        }
        
        console.log('🔄 Re-applying consent override...');
        
        if (window.gtag) {
          window.gtag('consent', 'update', this._overrideState);
        }
        if (window.dataLayer) {
          window.dataLayer.push(['consent', 'update', this._overrideState]);
        }
      }, 2000);
      
      // Stop override after 30 seconds
      setTimeout(() => {
        console.log('⏰ Consent override timeout - stopping protection');
        this._overrideActive = false;
        clearInterval(overrideInterval);
      }, 30000);
    }
  },
  
  // NEW: Stop consent override
  stopOverride: function() {
    console.log('🛑 Stopping consent override');
    this._overrideActive = false;
    this._overrideState = null;
    return { success: true, message: 'Override stopped' };
  },
  
  // Enhanced tag detection
  getTagInfo: function() {
    const tags = [];
    const consentState = this.getCurrentConsentState();
    
    console.log('🔍 Analyzing tags with consent state:', consentState);
    
    const tagChecks = [
      {
        check: () => window.gtag || document.querySelector('script[src*="gtag/js"]'),
        name: 'Google Analytics 4',
        type: 'analytics',
        consentType: 'analytics_storage'
      },
      {
        check: () => window.ga || document.querySelector('script[src*="google-analytics.com/analytics.js"]'),
        name: 'Universal Analytics',
        type: 'analytics',
        consentType: 'analytics_storage'
      },
      {
        check: () => document.querySelector('script[src*="googleadservices.com"]') || 
                     document.querySelector('script[src*="googlesyndication.com"]'),
        name: 'Google Ads',
        type: 'advertising',
        consentType: 'ad_storage'
      },
      {
        check: () => window.fbq || document.querySelector('script[src*="connect.facebook.net"]'),
        name: 'Facebook Pixel',
        type: 'advertising',
        consentType: 'ad_storage'
      },
      {
        check: () => window.hj || document.querySelector('script[src*="hotjar.com"]'),
        name: 'Hotjar',
        type: 'personalization',
        consentType: 'functionality_storage'
      }
    ];
    
    tagChecks.forEach((tagDef, index) => {
      if (tagDef.check()) {
        const isAllowed = consentState[tagDef.consentType] === 'granted';
        
        tags.push({
          id: `tag_${index}`,
          name: tagDef.name,
          type: tagDef.type,
          allowed: isAllowed,
          reason: isAllowed ? 
            `${tagDef.consentType} granted` : 
            `${tagDef.consentType} denied`,
          consentType: tagDef.consentType,
          overridden: this._overrideActive
        });
      }
    });
    
    return tags;
  },
  
  // Helper methods
  status: function() {
    const result = this.detectGTM();
    console.table({
      'GTM Detected': result.hasGTM,
      'GTM ID': result.gtmId || 'None',
      'Consent Mode': result.hasConsentMode,
      'Override Active': this._overrideActive,
      'Analytics Storage': result.consentState.analytics_storage,
      'Ad Storage': result.consentState.ad_storage
    });
    return result;
  },
  
  allowAll: function() {
    console.log('🎯 ConsentInspector.allowAll() called');
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
  },
  
  analyticsOnly: function() {
    return this.updateConsent({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'denied',
      security_storage: 'granted'
    });
  },
  
  // NEW: Enhanced trigger and variable detection
  detectTriggersAndVariables: function() {
    console.log('🔍 Detecting GTM triggers and variables...');
    this._performanceMonitor.startTimer('triggerDetection');
    
    const result = {
      triggers: [],
      variables: [],
      tagTriggerMap: [],
      consentDependencies: [],
      timestamp: Date.now()
    };
    
    // Method 1: Parse GTM container configuration
    if (window.google_tag_manager) {
      const containers = Object.keys(window.google_tag_manager);
      containers.forEach(containerId => {
        try {
          const container = window.google_tag_manager[containerId];
          const containerAnalysis = this.analyzeContainer(containerId, container);
          
          result.triggers.push(...containerAnalysis.triggers);
          result.variables.push(...containerAnalysis.variables);
          result.tagTriggerMap.push(...containerAnalysis.tagTriggerMap);
          result.consentDependencies.push(...containerAnalysis.consentDependencies);
        } catch (error) {
          console.error(`❌ Error analyzing container ${containerId}:`, error);
        }
      });
    }
    
    // Method 2: Parse dataLayer for trigger patterns
    const dataLayerAnalysis = this.safeExecute(() => this.analyzeDataLayer(), { triggers: [], variables: [] }, 'dataLayer analysis');
    result.triggers.push(...dataLayerAnalysis.triggers);
    result.variables.push(...dataLayerAnalysis.variables);
    
    // Method 3: Parse page source for GTM configuration
    const pageAnalysis = this.safeExecute(() => this.analyzePageSource(), { triggers: [], variables: [] }, 'page source analysis');
    result.triggers.push(...pageAnalysis.triggers);
    result.variables.push(...pageAnalysis.variables);
    
    // Remove duplicates and sort
    result.triggers = this.deduplicateTriggers(result.triggers);
    result.variables = this.deduplicateVariables(result.variables);
    result.tagTriggerMap = this.deduplicateTagMaps(result.tagTriggerMap);
    
    this._performanceMonitor.endTimer('triggerDetection');
    this._performanceMonitor.metrics.triggerCount = result.triggers.length;
    this._performanceMonitor.metrics.variableCount = result.variables.length;
    console.log('🎯 Trigger/Variable detection result:', result);
    return result;
  },
  
  // Analyze individual GTM container
  analyzeContainer: function(containerId, container) {
    const analysis = {
      triggers: [],
      variables: [],
      tagTriggerMap: [],
      consentDependencies: []
    };
    
    // Extract container-level variables
    if (container.dataLayer && Array.isArray(container.dataLayer)) {
      const dataLayerVars = this.extractDataLayerVariables(container.dataLayer);
      analysis.variables.push(...dataLayerVars.map(v => ({
        ...v,
        container: containerId,
        source: 'dataLayer'
      })));
    }
    
    // Look for GTM configuration in the container
    if (container.dataLayer) {
      const configEvents = container.dataLayer.filter(item => 
        Array.isArray(item) && 
        (item[0] === 'config' || item[0] === 'set' || item[0] === 'event')
      );
      
      configEvents.forEach(event => {
        if (event[0] === 'config') {
          // GA4 configuration
          analysis.variables.push({
            name: 'measurement_id',
            value: event[1],
            type: 'config',
            container: containerId,
            source: 'gtag_config'
          });
        } else if (event[0] === 'set') {
          // Custom variables
          analysis.variables.push({
            name: event[1],
            value: event[2],
            type: 'custom',
            container: containerId,
            source: 'gtag_set'
          });
        }
      });
    }
    
    return analysis;
  },
  
  // Analyze dataLayer for trigger patterns
  analyzeDataLayer: function() {
    const analysis = {
      triggers: [],
      variables: []
    };
    
    if (!window.dataLayer || !Array.isArray(window.dataLayer)) {
      return analysis;
    }
    
    // Extract variables from dataLayer
    analysis.variables = this.extractDataLayerVariables(window.dataLayer);
    
    // Detect trigger patterns
    const triggerPatterns = [
      {
        name: 'Page View',
        pattern: item => Array.isArray(item) && item[0] === 'config',
        consentType: 'analytics_storage'
      },
      {
        name: 'Custom Event',
        pattern: item => Array.isArray(item) && item[0] === 'event' && item[1] !== 'gtm.js',
        consentType: 'analytics_storage'
      },
      {
        name: 'Consent Update',
        pattern: item => Array.isArray(item) && item[0] === 'consent',
        consentType: 'security_storage'
      },
      {
        name: 'E-commerce',
        pattern: item => Array.isArray(item) && item[0] === 'event' && 
                        (item[1] === 'purchase' || item[1] === 'add_to_cart' || item[1] === 'view_item'),
        consentType: 'analytics_storage'
      },
      {
        name: 'User Engagement',
        pattern: item => Array.isArray(item) && item[0] === 'event' && 
                        (item[1] === 'scroll' || item[1] === 'click' || item[1] === 'form_submit'),
        consentType: 'analytics_storage'
      }
    ];
    
    // Check each dataLayer item against trigger patterns
    window.dataLayer.forEach((item, index) => {
      triggerPatterns.forEach(pattern => {
        if (pattern.pattern(item)) {
          analysis.triggers.push({
            name: pattern.name,
            event: item[1] || 'unknown',
            timestamp: Date.now(),
            dataLayerIndex: index,
            consentType: pattern.consentType,
            data: item
          });
        }
      });
    });
    
    return analysis;
  },
  
  // Extract variables from dataLayer
  extractDataLayerVariables: function(dataLayer) {
    const variables = [];
    
    dataLayer.forEach((item, index) => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        // Extract all properties as variables
        Object.keys(item).forEach(key => {
          const value = item[key];
          if (value !== undefined && value !== null) {
            variables.push({
              name: key,
              value: typeof value === 'object' ? JSON.stringify(value) : String(value),
              type: 'dataLayer',
              dataLayerIndex: index,
              dataType: typeof value
            });
          }
        });
      }
    });
    
    return variables;
  },
  
  // Analyze page source for GTM configuration
  analyzePageSource: function() {
    const analysis = {
      triggers: [],
      variables: []
    };
    
    try {
      const pageSource = document.documentElement.outerHTML;
      
      // Look for GTM configuration in script tags
      const gtmScripts = document.querySelectorAll('script');
      gtmScripts.forEach(script => {
        if (script.textContent) {
          const content = script.textContent;
          
          // Extract GTM configuration
          const gtmConfig = this.extractGTMConfig(content);
          if (gtmConfig) {
            analysis.variables.push(...gtmConfig.variables);
            analysis.triggers.push(...gtmConfig.triggers);
          }
          
          // Extract gtag configuration
          const gtagConfig = this.extractGtagConfig(content);
          if (gtagConfig) {
            analysis.variables.push(...gtagConfig.variables);
            analysis.triggers.push(...gtagConfig.triggers);
          }
        }
      });
      
      // Look for data attributes that might indicate triggers
      const triggerElements = document.querySelectorAll('[data-gtm-trigger], [data-gtm-event], [onclick*="gtag"]');
      triggerElements.forEach(element => {
        const trigger = this.extractElementTrigger(element);
        if (trigger) {
          analysis.triggers.push(trigger);
        }
      });
      
    } catch (e) {
      console.log('⚠️ Error analyzing page source:', e);
    }
    
    return analysis;
  },
  
  // Extract GTM configuration from script content
  extractGTMConfig: function(content) {
    const config = {
      variables: [],
      triggers: []
    };
    
    // Look for GTM configuration patterns
    const gtmPatterns = [
      {
        name: 'GTM ID',
        regex: /GTM-[A-Z0-9]+/g,
        type: 'container_id'
      },
      {
        name: 'Measurement ID',
        regex: /G-[A-Z0-9]+/g,
        type: 'measurement_id'
      },
      {
        name: 'Conversion ID',
        regex: /AW-[0-9]+/g,
        type: 'conversion_id'
      }
    ];
    
    gtmPatterns.forEach(pattern => {
      const matches = content.match(pattern.regex);
      if (matches) {
        matches.forEach(match => {
          config.variables.push({
            name: pattern.name,
            value: match,
            type: pattern.type,
            source: 'script_content'
          });
        });
      }
    });
    
    return config;
  },
  
  // Extract gtag configuration from script content
  extractGtagConfig: function(content) {
    const config = {
      variables: [],
      triggers: []
    };
    
    // Look for gtag function calls
    const gtagCalls = content.match(/gtag\([^)]+\)/g);
    if (gtagCalls) {
      gtagCalls.forEach(call => {
        // Parse gtag call parameters
        const params = this.parseGtagCall(call);
        if (params) {
          config.variables.push(...params.variables);
          config.triggers.push(...params.triggers);
        }
      });
    }
    
    return config;
  },
  
  // Parse gtag function call
  parseGtagCall: function(call) {
    const params = {
      variables: [],
      triggers: []
    };
    
    try {
      // Extract parameters from gtag call
      const match = call.match(/gtag\(([^)]+)\)/);
      if (match) {
        const args = match[1].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
        
        if (args[0] === 'config') {
          // Configuration call
          params.variables.push({
            name: 'measurement_id',
            value: args[1],
            type: 'gtag_config',
            source: 'script_content'
          });
        } else if (args[0] === 'event') {
          // Event call
          params.triggers.push({
            name: 'Custom Event',
            event: args[1],
            parameters: args.slice(2),
            type: 'gtag_event',
            source: 'script_content'
          });
        }
      }
    } catch (e) {
      console.log('⚠️ Error parsing gtag call:', e);
    }
    
    return params;
  },
  
  // Extract trigger from DOM element
  extractElementTrigger: function(element) {
    const trigger = {
      name: 'Element Interaction',
      element: element.tagName.toLowerCase(),
      type: 'dom_element',
      source: 'page_element'
    };
    
    // Check for data attributes
    if (element.dataset.gtmTrigger) {
      trigger.name = element.dataset.gtmTrigger;
    }
    if (element.dataset.gtmEvent) {
      trigger.event = element.dataset.gtmEvent;
    }
    
    // Check for onclick handlers
    if (element.onclick || element.getAttribute('onclick')) {
      trigger.handler = 'onclick';
      trigger.consentType = 'analytics_storage';
    }
    
    return trigger;
  },
  
  // Deduplicate triggers
  deduplicateTriggers: function(triggers) {
    const seen = new Set();
    return triggers.filter(trigger => {
      const key = `${trigger.name}-${trigger.event}-${trigger.type}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },
  
  // Deduplicate variables
  deduplicateVariables: function(variables) {
    const seen = new Set();
    return variables.filter(variable => {
      const key = `${variable.name}-${variable.value}-${variable.type}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },
  
  // Deduplicate tag maps
  deduplicateTagMaps: function(tagMaps) {
    const seen = new Set();
    return tagMaps.filter(map => {
      const key = `${map.tag}-${map.trigger}-${map.container}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },
  
  // NEW: Get comprehensive tag analysis with triggers and variables
  getComprehensiveTagAnalysis: function() {
    console.log('🔍 Getting comprehensive tag analysis...');
    
    const basicTags = this.getTagInfo();
    const triggersAndVars = this.detectTriggersAndVariables();
    const consentState = this.getCurrentConsentState();
    
    // Enhance basic tags with trigger and variable information
    const enhancedTags = basicTags.map(tag => {
      const relatedTriggers = triggersAndVars.triggers.filter(trigger => 
        trigger.consentType === tag.consentType
      );
      
      const relatedVariables = triggersAndVars.variables.filter(variable => 
        variable.name.toLowerCase().includes(tag.name.toLowerCase()) ||
        variable.type === tag.consentType
      );
      
      return {
        ...tag,
        triggers: relatedTriggers,
        variables: relatedVariables,
        triggerCount: relatedTriggers.length,
        variableCount: relatedVariables.length
      };
    });
    
    return {
      tags: enhancedTags,
      triggers: triggersAndVars.triggers,
      variables: triggersAndVars.variables,
      tagTriggerMap: triggersAndVars.tagTriggerMap,
      consentDependencies: triggersAndVars.consentDependencies,
      consentState: consentState,
      summary: {
        totalTags: enhancedTags.length,
        totalTriggers: triggersAndVars.triggers.length,
        totalVariables: triggersAndVars.variables.length,
        tagsWithTriggers: enhancedTags.filter(tag => tag.triggers.length > 0).length,
        tagsWithVariables: enhancedTags.filter(tag => tag.variables.length > 0).length
      }
    };
  },
};

// Initialize event monitoring
window.ConsentInspector._events = [];
window.ConsentInspector._maxEvents = 50;

window.ConsentInspector.getEvents = function() {
  return this._events.slice(-20);
};

// Enhanced dataLayer monitoring
if (window.dataLayer && Array.isArray(window.dataLayer)) {
  const originalPush = window.dataLayer.push;
  
  window.dataLayer.push = function() {
    const result = originalPush.apply(this, arguments);
    
    try {
      const event = arguments[0];
      
      if (typeof event === 'object' && event !== null) {
        if (Array.isArray(event) && event[0] === 'consent') {
          // Log all consent changes
          window.ConsentInspector._events.push({
            timestamp: Date.now(),
            type: 'Consent Update',
            category: 'consent',
            details: `${event[1]}: ${JSON.stringify(event[2])}`
          });
          
          // If site is trying to override our override, re-apply ours
          if (window.ConsentInspector._overrideActive && event[1] === 'update') {
            console.log('🛡️ Site tried to override our consent - re-applying override in 100ms');
            setTimeout(() => {
              if (window.ConsentInspector._overrideActive) {
                originalPush.call(this, ['consent', 'update', window.ConsentInspector._overrideState]);
              }
            }, 100);
          }
        } else if (event.event && !event.event.startsWith('gtm.')) {
          window.ConsentInspector._events.push({
            timestamp: Date.now(),
            type: 'DataLayer Event',
            category: 'gtm',
            details: event.event
          });
        }
      }
      
      if (window.ConsentInspector._events.length > window.ConsentInspector._maxEvents) {
        window.ConsentInspector._events = window.ConsentInspector._events.slice(-30);
      }
    } catch (e) {
      // Fail silently
    }
    
    return result;
  };
}

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
        case 'stopOverride':
          response = window.ConsentInspector.stopOverride();
          break;
        case 'detectIABTCF':
          response = window.ConsentInspector.detectIABTCF();
          break;
        case 'detectCMP':
          response = window.ConsentInspector.detectCMP();
          break;
        case 'parseTCFConsentString':
          response = window.ConsentInspector.parseTCFConsentString(data);
          break;
              case 'detectTriggersAndVariables':
        response = window.ConsentInspector.detectTriggersAndVariables();
        break;
      case 'getPerformanceMetrics':
        response = window.ConsentInspector.getPerformanceMetrics();
        break;
        case 'getComprehensiveTagAnalysis':
          response = window.ConsentInspector.getComprehensiveTagAnalysis();
          break;
        default:
          response = { error: 'Unknown action: ' + action };
      }
    } catch (error) {
      response = { error: error.message };
    }
    
    // Create a safe, serializable version of the response
    const safeResponse = (() => {
      try {
        // Try to serialize and deserialize to ensure it's safe
        return JSON.parse(JSON.stringify(response));
      } catch (e) {
        // If serialization fails, create a safe fallback
        console.warn('Response serialization failed, creating safe fallback:', e);
        if (response && typeof response === 'object') {
          const safe = {};
          for (const [key, value] of Object.entries(response)) {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
              safe[key] = value;
            } else if (Array.isArray(value)) {
              safe[key] = value.map(item => 
                (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null) ? item : '[Complex Object]'
              );
            } else if (typeof value === 'object') {
              safe[key] = '[Object]';
            }
          }
          return safe;
        }
        return { error: 'Response could not be serialized' };
      }
    })();
    
    window.postMessage({
      source: 'gtm-inspector-page-response',
      id: id,
      data: safeResponse
    }, '*');
  }
});

console.log('✅ GTM Inspector: ConsentInspector created with override protection!');
console.log('💡 Try: ConsentInspector.allowAll() - it will maintain the override');

// Initial detection
setTimeout(() => {
  try {
    const result = window.ConsentInspector.detectGTM();
    if (result.hasGTM) {
      console.log(`🎯 GTM Found: ${result.gtmId}`);
      console.log('📊 Initial consent state:', result.consentState);
      
      if (result.consentState.analytics_storage === 'denied') {
        console.log('⚠️ Site has consent denied by default - use ConsentInspector.allowAll() to override');
      }
    }
  } catch (error) {
    console.error('❌ Error in initial GTM detection:', error);
  }
}, 1000);