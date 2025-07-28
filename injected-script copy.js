// injected-script.js - Enhanced with bidirectional sync

// Prevent multiple injections
if (window.ConsentInspector) {
  console.log('🔧 ConsentInspector already exists, skipping injection...');
} else {
  console.log('🔧 Creating ConsentInspector with bidirectional sync...');
  
  // Create ConsentInspector in page context with bidirectional sync
  window.ConsentInspector = {
    version: 'bidirectional-v1',
    
    // Shared consent state
    sharedConsentState: {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
      lastUpdatedBy: null,
      timestamp: null
    },
    
    // Initialize bidirectional sync
    initBidirectionalSync: function() {
      console.log('🔄 Initializing bidirectional consent sync...');
      
      // Listen for Cookiebot changes
      this.setupCookiebotListeners();
      
      // Listen for extension changes
      this.setupExtensionListeners();
      
      // Sync initial state
      this.syncInitialState();
      
      // Set up periodic sync check
      this.setupPeriodicSync();
    },
    
    // Setup Cookiebot listeners
    setupCookiebotListeners: function() {
      // Listen for all Cookiebot events
      ['CookiebotOnConsentReady', 'CookiebotOnAccept', 'CookiebotOnDecline', 'CookiebotOnConsentChange'].forEach(eventName => {
        window.addEventListener(eventName, () => {
          console.log(`🍪 Cookiebot event: ${eventName}`);
          this.handleCookiebotChange('cookiebot-event');
        });
      });
      
      // Also monitor Cookiebot object directly
      if (window.Cookiebot) {
        // Override Cookiebot's internal consent update method
        const originalUpdate = window.Cookiebot.updateConsentState;
        if (originalUpdate) {
          window.Cookiebot.updateConsentState = (...args) => {
            const result = originalUpdate.apply(window.Cookiebot, args);
            this.handleCookiebotChange('cookiebot-internal');
            return result;
          };
        }
      }
    },
    
    // Handle Cookiebot consent changes
    handleCookiebotChange: function(source) {
      if (!window.Cookiebot || !window.Cookiebot.consent) return;
      
      const cookiebotConsent = window.Cookiebot.consent;
      const newState = {
        analytics_storage: cookiebotConsent.statistics ? 'granted' : 'denied',
        ad_storage: cookiebotConsent.marketing ? 'granted' : 'denied',
        functionality_storage: cookiebotConsent.necessary ? 'granted' : 'denied',
        personalization_storage: cookiebotConsent.preferences ? 'granted' : 'denied',
        security_storage: 'granted',
        lastUpdatedBy: 'cookiebot',
        timestamp: Date.now()
      };
      
      // Check if state actually changed
      if (!this.isStateEqual(this.sharedConsentState, newState)) {
        console.log('🔄 Cookiebot changed consent, syncing to extension...');
        this.updateSharedState(newState);
        this.notifyExtension('cookiebot-change', newState);
        this.updateGTM(newState);
      }
    },
    
    // Setup extension listeners
    setupExtensionListeners: function() {
      // Listen for consent updates from extension
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'EXTENSION_CONSENT_UPDATE') {
          console.log('📥 Extension consent update received:', event.data);
          this.handleExtensionChange(event.data.consent);
        }
      });
    },
    
    // Handle extension consent changes
    handleExtensionChange: function(newConsent) {
      const newState = {
        ...newConsent,
        lastUpdatedBy: 'extension',
        timestamp: Date.now()
      };
      
      // Update shared state
      this.updateSharedState(newState);
      
      // Sync to Cookiebot
      this.syncToCookiebot(newState);
      
      // Update GTM
      this.updateGTM(newState);
    },
    
    // Sync consent state to Cookiebot
    syncToCookiebot: function(consentState) {
      if (!window.Cookiebot || !window.Cookiebot.consent) {
        console.warn('⚠️ Cookiebot not available for sync');
        return;
      }
      
      console.log('🔄 Syncing to Cookiebot:', consentState);
      
      // Update Cookiebot's consent object
      window.Cookiebot.consent.statistics = consentState.analytics_storage === 'granted';
      window.Cookiebot.consent.marketing = consentState.ad_storage === 'granted';
      window.Cookiebot.consent.preferences = consentState.personalization_storage === 'granted';
      window.Cookiebot.consent.necessary = consentState.functionality_storage === 'granted';
      
      // Update Cookiebot's internal state
      if (window.Cookiebot.updateConsentUI) {
        window.Cookiebot.updateConsentUI();
      }
      
      // Force Cookiebot to save the new consent
      if (window.Cookiebot.submitConsent) {
        window.Cookiebot.submitConsent();
      }
      
      // Update the Cookiebot cookie directly as fallback
      this.updateCookiebotCookie(consentState);
    },
    
    // Update Cookiebot cookie directly
    updateCookiebotCookie: function(consentState) {
      const consentData = {
        stamp: new Date().toISOString(),
        necessary: true,
        preferences: consentState.personalization_storage === 'granted',
        statistics: consentState.analytics_storage === 'granted',
        marketing: consentState.ad_storage === 'granted',
        method: 'explicit',
        ver: 4
      };
      
      // Encode and set the cookie
      const cookieValue = encodeURIComponent(JSON.stringify(consentData));
      document.cookie = `CookieConsent=${cookieValue}; path=/; max-age=31536000; SameSite=Lax`;
    },
    
    // Notify extension of changes
    notifyExtension: function(source, consentState) {
      // Send to content script via postMessage
      window.postMessage({
        type: 'COOKIEBOT_SYNC_UPDATE',
        source: source,
        consent: consentState,
        timestamp: Date.now()
      }, '*');
      
      // Also dispatch custom event
      const event = new CustomEvent('consentSyncUpdate', {
        detail: {
          source: source,
          consent: consentState
        }
      });
      window.dispatchEvent(event);
    },
    
    // Update GTM with new consent state
    updateGTM: function(consentState) {
      if (typeof gtag !== 'undefined') {
        gtag('consent', 'update', {
          analytics_storage: consentState.analytics_storage,
          ad_storage: consentState.ad_storage,
          functionality_storage: consentState.functionality_storage,
          personalization_storage: consentState.personalization_storage,
          security_storage: consentState.security_storage
        });
        console.log('✅ GTM consent updated:', consentState);
      }
    },
    
    // Enhanced updateConsent method for extension control
    updateConsent: function(settings) {
      console.log('🎮 Extension updating consent:', settings);
      
      // Create new state from settings
      const newState = {
        ...this.sharedConsentState,
        ...settings,
        lastUpdatedBy: 'extension',
        timestamp: Date.now()
      };
      
      // Update everything
      this.updateSharedState(newState);
      this.syncToCookiebot(newState);
      this.updateGTM(newState);
      
      return { success: true, state: newState };
    },
    
    // Helper methods
    updateSharedState: function(newState) {
      this.sharedConsentState = { ...newState };
      console.log('📊 Shared state updated:', this.sharedConsentState);
    },
    
    isStateEqual: function(state1, state2) {
      const keys = ['analytics_storage', 'ad_storage', 'functionality_storage', 'personalization_storage'];
      return keys.every(key => state1[key] === state2[key]);
    },
    
    syncInitialState: function() {
      // Try to get initial state from Cookiebot
      if (window.Cookiebot && window.Cookiebot.consent) {
        this.handleCookiebotChange('initial-sync');
      } else {
        // Get from dataLayer if available
        const gtmState = this.getCurrentConsentState();
        this.updateSharedState({
          ...gtmState,
          lastUpdatedBy: 'initial',
          timestamp: Date.now()
        });
      }
    },
    
    setupPeriodicSync: function() {
      // Check for sync issues every 5 seconds
      setInterval(() => {
        this.checkSyncIntegrity();
      }, 5000);
    },
    
    checkSyncIntegrity: function() {
      // Get current states from all sources
      const cookiebotState = this.getCookiebotState();
      const gtmState = this.getGTMState();
      const sharedState = this.sharedConsentState;
      
      // Check if they're in sync
      const inSync = this.isStateEqual(cookiebotState, sharedState) && 
                    this.isStateEqual(gtmState, sharedState);
      
      if (!inSync) {
        console.warn('⚠️ Consent sync mismatch detected, resyncing...');
        // Use shared state as source of truth
        this.syncToCookiebot(sharedState);
        this.updateGTM(sharedState);
      }
    },
    
    getCookiebotState: function() {
      if (!window.Cookiebot || !window.Cookiebot.consent) {
        return this.sharedConsentState;
      }
      
      return {
        analytics_storage: window.Cookiebot.consent.statistics ? 'granted' : 'denied',
        ad_storage: window.Cookiebot.consent.marketing ? 'granted' : 'denied',
        functionality_storage: window.Cookiebot.consent.necessary ? 'granted' : 'denied',
        personalization_storage: window.Cookiebot.consent.preferences ? 'granted' : 'denied',
        security_storage: 'granted'
      };
    },
    
    getGTMState: function() {
      // This is harder to get directly, so we'll use our shared state
      return this.sharedConsentState;
    },
    
    // Get sync status for UI
    getSyncStatus: function() {
      const cookiebotState = this.getCookiebotState();
      const gtmState = this.getGTMState();
      const sharedState = this.sharedConsentState;
      
      const inSync = this.isStateEqual(cookiebotState, sharedState) && 
                    this.isStateEqual(gtmState, sharedState);
      
      return {
        inSync: inSync,
        cookiebot: cookiebotState,
        gtm: gtmState,
        extension: sharedState,
        lastUpdatedBy: sharedState.lastUpdatedBy,
        timestamp: sharedState.timestamp
      };
    },
    
    // Force sync
    forceSync: function() {
      console.log('🔄 Force syncing all consent states...');
      this.syncToCookiebot(this.sharedConsentState);
      this.updateGTM(this.sharedConsentState);
      return { success: true, status: this.getSyncStatus() };
    },
    
    // Original methods (preserved for compatibility)
    detectGTM: function() {
      const result = {
        hasGTM: false,
        gtmId: '',
        containers: [],
        hasConsentMode: false,
        consentState: {},
        detectionMethods: {},
        cmpInfo: {},
        timestamp: Date.now()
      };
    
      // Method 1: Check for GTM script tags
      const gtmScripts = document.querySelectorAll('script[src*="googletagmanager.com"]');
      if (gtmScripts.length > 0) {
        result.hasGTM = true;
        result.detectionMethods.scriptTags = true;
        
        // Extract GTM IDs from script URLs
        gtmScripts.forEach(script => {
          const match = script.src.match(/gtm\.js\?id=([^&]+)/);
          if (match && match[1]) {
            const gtmId = match[1];
            if (!result.containers.includes(gtmId)) {
              result.containers.push(gtmId);
            }
          }
        });
        
        if (result.containers.length > 0) {
          result.gtmId = result.containers[0]; // Use first container as primary
        }
      }
      
      // Method 2: Check for dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        result.hasGTM = true;
        result.detectionMethods.dataLayer = true;
        
        // Look for GTM container ID in dataLayer
        for (let i = 0; i < window.dataLayer.length; i++) {
          const item = window.dataLayer[i];
          if (item && typeof item === 'object' && item.gtm_id) {
            if (!result.containers.includes(item.gtm_id)) {
              result.containers.push(item.gtm_id);
            }
          }
        }
      }
      
      // Method 3: Check for gtag function
      if (window.gtag && typeof window.gtag === 'function') {
        result.hasGTM = true;
        result.detectionMethods.gtag = true;
      }
      
      // Method 4: Check for Google Tag Manager object
      if (window.google_tag_manager) {
        result.hasGTM = true;
        result.detectionMethods.gtmObject = true;
      }
    
      // BETTER consent mode detection
      result.hasConsentMode = this.detectConsentMode();
      
      if (result.hasConsentMode) {
        result.consentState = this.getCurrentConsentState();
        result.cmpInfo = this.detectCMP();
      } else {
        // No consent mode - all storage granted by default
        result.consentState = {
          analytics_storage: 'granted',
          ad_storage: 'granted', 
          functionality_storage: 'granted',
          personalization_storage: 'granted',
          security_storage: 'granted',
          _noConsentMode: true  // Flag to indicate default state
        };
      }
    
      return result;
    },
    
    detectConsentMode: function() {
      console.log('🔍 detectConsentMode called');
      console.log('🔍 dataLayer available:', !!window.dataLayer);
      console.log('🔍 dataLayer length:', window.dataLayer ? window.dataLayer.length : 0);
      console.log('🔍 dataLayer contents:', window.dataLayer ? JSON.stringify(window.dataLayer, null, 2) : 'null');
      
      // Method 1: Check for actual consent events in dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        const hasConsentEvents = window.dataLayer.some(item => {
          // Handle both array and object formats
          if (Array.isArray(item)) {
            return item[0] === 'consent' && (item[1] === 'default' || item[1] === 'update');
          } else if (item && typeof item === 'object') {
            // Handle object format with numeric keys
            return item['0'] === 'consent' && (item['1'] === 'default' || item['1'] === 'update');
          }
          return false;
        });
        console.log('🔍 Method 1 - hasConsentEvents:', hasConsentEvents);
        if (hasConsentEvents) {
          return true;
        }
      }
      
      // Method 2: Check if gtag with consent is used
      if (window.gtag && typeof window.gtag === 'function') {
        console.log('🔍 Method 2 - gtag function available');
        // Look for gtag consent calls in dataLayer
        if (window.dataLayer) {
          const hasGtagConsent = window.dataLayer.some(item => {
            // Handle both array and object formats
            if (Array.isArray(item)) {
              return item[0] === 'consent';
            } else if (item && typeof item === 'object') {
              return item['0'] === 'consent';
            }
            return false;
          });
          console.log('🔍 Method 2 - hasGtagConsent:', hasGtagConsent);
          return hasGtagConsent;
        }
      }
      
      // Method 3: Enhanced CMP detection
      console.log('🔍 Method 3 - CMP detection');
      console.log('🔍 __tcfapi available:', !!window.__tcfapi);
      console.log('🔍 OneTrust available:', !!window.OneTrust);
      console.log('🔍 Cookiebot available:', !!window.Cookiebot);
      if (window.__tcfapi || window.OneTrust || window.Cookiebot) {
        console.log('🔍 Method 3 - CMP detected, returning true');
        return true;
      }
      
      // Method 4: Check for Cookiebot script tag
      const cookiebotScript = document.querySelector('script[id="Cookiebot"], script[src*="cookiebot.com"]');
      console.log('🔍 Method 4 - Cookiebot script found:', !!cookiebotScript);
      if (cookiebotScript) {
        return true;
      }
      
      console.log('🔍 No consent mode detected');
      return false;
    },
    
    detectCMP: function() {
      const cmpInfo = {
        type: 'none',
        name: 'None',
        version: null,
        details: {}
      };
      
      // Check for Cookiebot
      if (window.Cookiebot) {
        cmpInfo.type = 'cookiebot';
        cmpInfo.name = 'Cookiebot';
        cmpInfo.version = window.Cookiebot.version || 'unknown';
        cmpInfo.details = {
          consent: window.Cookiebot.consent ? 'available' : 'not_available',
          banner: window.Cookiebot.show ? 'available' : 'not_available',
          domain: window.Cookiebot.domain || 'unknown'
        };
        return cmpInfo;
      }
      
      // Check for OneTrust
      if (window.OneTrust) {
        cmpInfo.type = 'onetrust';
        cmpInfo.name = 'OneTrust';
        cmpInfo.version = window.OneTrust.version || 'unknown';
        cmpInfo.details = {
          domainData: window.OneTrust.GetDomainData ? 'available' : 'not_available',
          groups: window.OneTrust.GetDomainData ? 'available' : 'not_available'
        };
        return cmpInfo;
      }
      
      // Check for IAB TCF
      if (window.__tcfapi) {
        cmpInfo.type = 'iab_tcf';
        cmpInfo.name = 'IAB TCF';
        cmpInfo.version = '2.0';
        cmpInfo.details = {
          api: 'available',
          gdpr: window.__tcfapi ? 'available' : 'not_available'
        };
        return cmpInfo;
      }
      
      // Check for script tags
      const cookiebotScript = document.querySelector('script[id="Cookiebot"], script[src*="cookiebot.com"]');
      if (cookiebotScript) {
        cmpInfo.type = 'cookiebot_script';
        cmpInfo.name = 'Cookiebot (Script Tag)';
        cmpInfo.details = {
          scriptSrc: cookiebotScript.src || 'inline',
          scriptId: cookiebotScript.id || 'none'
        };
        return cmpInfo;
      }
      
      const oneTrustScript = document.querySelector('script[src*="onetrust.com"], script[src*="cdn.cookielaw.org"]');
      if (oneTrustScript) {
        cmpInfo.type = 'onetrust_script';
        cmpInfo.name = 'OneTrust (Script Tag)';
        cmpInfo.details = {
          scriptSrc: oneTrustScript.src || 'inline'
        };
        return cmpInfo;
      }
      
      return cmpInfo;
    },
    

    
    getCurrentConsentState: function() {
      const defaultState = {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'granted',
        security_storage: 'granted'
      };
      
      // Method 1: Check Google Consent Mode in dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        for (let i = window.dataLayer.length - 1; i >= 0; i--) {
          const item = window.dataLayer[i];
          // Handle both array and object formats
          if (Array.isArray(item) && item[0] === 'consent' && 
              (item[1] === 'default' || item[1] === 'update') && item[2]) {
            return { ...defaultState, ...item[2] };
          } else if (item && typeof item === 'object' && item['0'] === 'consent' && 
                     (item['1'] === 'default' || item['1'] === 'update') && item['2']) {
            return { ...defaultState, ...item['2'] };
          }
        }
      }
      
      // Method 2: Check Cookiebot consent state
      if (window.Cookiebot && window.Cookiebot.consent) {
        const cookiebotConsent = window.Cookiebot.consent;
        return {
          analytics_storage: cookiebotConsent.analytics ? 'granted' : 'denied',
          ad_storage: cookiebotConsent.advertising ? 'granted' : 'denied',
          functionality_storage: cookiebotConsent.functionality ? 'granted' : 'denied',
          personalization_storage: cookiebotConsent.personalization ? 'granted' : 'denied',
          security_storage: cookiebotConsent.necessary ? 'granted' : 'denied',
          _cookiebot: true
        };
      }
      
      // Method 3: Check OneTrust consent state
      if (window.OneTrust && window.OneTrust.GetDomainData) {
        try {
          const oneTrustData = window.OneTrust.GetDomainData();
          if (oneTrustData && oneTrustData.Groups) {
            const groups = oneTrustData.Groups;
            return {
              analytics_storage: groups.find(g => g.CustomGroupId === 'analytics')?.Status === 'true' ? 'granted' : 'denied',
              ad_storage: groups.find(g => g.CustomGroupId === 'advertising')?.Status === 'true' ? 'granted' : 'denied',
              functionality_storage: groups.find(g => g.CustomGroupId === 'functionality')?.Status === 'true' ? 'granted' : 'denied',
              personalization_storage: groups.find(g => g.CustomGroupId === 'personalization')?.Status === 'true' ? 'granted' : 'denied',
              security_storage: 'granted', // Necessary cookies are always granted
              _oneTrust: true
            };
          }
        } catch (error) {
          console.log('OneTrust consent check failed:', error);
        }
      }
      
      return defaultState;
    },
    
    getTagInfo: function() {
      const tags = [];
      const consentState = this.getCurrentConsentState();
      
      // Simple tag detection - check for common tracking scripts
      const tagDetectors = [
        {
          name: 'Google Analytics 4',
          type: 'analytics',
          consentType: 'analytics_storage',
          check: () => {
            return window.gtag || 
                   document.querySelector('script[src*="gtag/js"]') ||
                   document.querySelector('script[src*="googletagmanager.com"]');
          }
        },
        {
          name: 'Universal Analytics',
          type: 'analytics', 
          consentType: 'analytics_storage',
          check: () => {
            return window.ga || 
                   document.querySelector('script[src*="google-analytics.com"]');
          }
        },
        {
          name: 'Facebook Pixel',
          type: 'advertising',
          consentType: 'ad_storage', 
          check: () => {
            return window.fbq || 
                   document.querySelector('script[src*="connect.facebook.net"]');
          }
        },
        {
          name: 'Google Ads',
          type: 'advertising',
          consentType: 'ad_storage',
          check: () => {
            return document.querySelector('script[src*="googleadservices.com"]') ||
                   document.querySelector('script[src*="googlesyndication.com"]');
          }
        },
        {
          name: 'Hotjar',
          type: 'analytics',
          consentType: 'analytics_storage',
          check: () => {
            return window.hj || 
                   document.querySelector('script[src*="hotjar.com"]');
          }
        }
      ];
      
      // Check each detector
      tagDetectors.forEach(detector => {
        try {
          if (detector.check()) {
            const allowed = consentState[detector.consentType] === 'granted';
            tags.push({
              name: detector.name,
              type: detector.type,
              consentType: detector.consentType,
              allowed: allowed,
              reason: `${detector.consentType}: ${consentState[detector.consentType]}`
            });
          }
        } catch (error) {
          console.log('Error checking detector:', detector.name, error);
        }
      });
      
      return tags;
    },
    
    updateConsent: function(settings) {
      
      try {
        const results = [];
        
        // Temporarily disable Cookiebot events to prevent conflicts
        const cookiebotDisabled = this.disableCookiebotEvents();
        
        // Method 1: Update Google Consent Mode (Primary method)
        if (window.gtag && typeof window.gtag === 'function') {
          window.gtag('consent', 'update', settings);
          results.push({ method: 'gtag', success: true });
          console.log('🍪 Updated consent via gtag:', settings);
        }
        
        if (window.dataLayer && Array.isArray(window.dataLayer)) {
          window.dataLayer.push(['consent', 'update', settings]);
          results.push({ method: 'dataLayer', success: true });
          console.log('🍪 Updated consent via dataLayer:', settings);
        }
        
        // Method 2: Update Cookiebot consent state (if available, but don't trigger events)
        if (window.Cookiebot && window.Cookiebot.consent) {
          const cookiebotConsent = window.Cookiebot.consent;
          
          // Map Google Consent Mode settings to Cookiebot settings
          if (settings.analytics_storage !== undefined) {
            cookiebotConsent.analytics = settings.analytics_storage === 'granted';
          }
          if (settings.ad_storage !== undefined) {
            cookiebotConsent.advertising = settings.ad_storage === 'granted';
          }
          if (settings.functionality_storage !== undefined) {
            cookiebotConsent.functionality = settings.functionality_storage === 'granted';
          }
          if (settings.personalization_storage !== undefined) {
            cookiebotConsent.personalization = settings.personalization_storage === 'granted';
          }
          if (settings.security_storage !== undefined) {
            cookiebotConsent.necessary = settings.security_storage === 'granted';
          }
          
          results.push({ method: 'cookiebot_silent', success: true });
          console.log('🍪 Updated Cookiebot consent silently:', cookiebotConsent);
        }
        
        // Re-enable Cookiebot events after a short delay
        if (cookiebotDisabled) {
          setTimeout(() => {
            this.enableCookiebotEvents();
          }, 1000);
        }
        
        // Log the consent change to our event log
        this.logConsentChange('simulator_update', {
          action: 'simulator_update',
          website: document.title || window.location.hostname,
          url: window.location.href,
          consent: settings,
          timestamp: Date.now()
        });
        
        return { 
          success: results.length > 0, 
          methods: results,
          settings: settings
        };
        
      } catch (error) {
        console.error('Error updating consent:', error);
        return { success: false, error: error.message };
      }
    },
    
    getEvents: function() {
      // Real event logging - capture actual consent activity and tag firing
      const events = [];
      
      try {
        console.log('📊 Getting real consent and tag events...');
        
        // Get stored events from page context
        const storedEvents = window.gtmInspectorEventLog || [];
        
        // Add stored events to the list
        events.push(...storedEvents);
        
        // Get current consent state and add as event if it exists
        const currentConsent = this.getCurrentConsentState();
        if (currentConsent && !currentConsent._noConsentMode) {
          const consentEvent = {
            timestamp: Date.now(),
            tagName: 'Current Consent State',
            tagType: 'consent_status',
            consentType: 'current',
            allowed: true,
            reason: `Analytics: ${currentConsent.analytics_storage}, Ads: ${currentConsent.ad_storage}, Functionality: ${currentConsent.functionality_storage}`,
            status: 'ACTIVE 📊',
            source: 'consent_state'
          };
          events.push(consentEvent);
        }
        
        // Get detected tags and their consent status
        const detectedTags = this.getTagInfo();
        detectedTags.forEach(tag => {
          const tagEvent = {
            timestamp: Date.now(),
            tagName: tag.name,
            tagType: tag.type,
            consentType: tag.consentType,
            allowed: tag.allowed,
            reason: tag.reason,
            status: tag.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌',
            source: 'tag_detection'
          };
          events.push(tagEvent);
        });
        
        // Add test event if no events found
        if (events.length === 0) {
          const statusEvent = {
            timestamp: Date.now(),
            tagName: 'Event Log Ready',
            tagType: 'system',
            consentType: 'none',
            allowed: true,
            reason: 'Event log is ready to capture consent activity and tag events',
            status: 'READY ✅',
            source: 'system'
          };
          events.push(statusEvent);
        }
        
        console.log('📊 Returning', events.length, 'real events');
        return events;
        
      } catch (error) {
        console.error('❌ Error in getEvents:', error);
        return [];
      }
    },
    
    // Add event to the log
    addEvent: function(eventData) {
      if (!window.gtmInspectorEventLog) {
        window.gtmInspectorEventLog = [];
      }
      
      const event = {
        timestamp: Date.now(),
        ...eventData
      };
      
      window.gtmInspectorEventLog.push(event);
      
      // Keep only last 100 events
      if (window.gtmInspectorEventLog.length > 100) {
        window.gtmInspectorEventLog = window.gtmInspectorEventLog.slice(-100);
      }
      
      console.log('📊 Event logged:', event);
    },
    
    // Log consent change event
    logConsentChange: function(action, consentData) {
      const eventData = {
        tagName: `Consent ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        tagType: 'consent_change',
        consentType: 'user_action',
        allowed: true,
        reason: `User ${action} cookies - Analytics: ${consentData.analytics}, Marketing: ${consentData.advertising}, Functionality: ${consentData.functionality}`,
        status: action === 'accept' ? 'ACCEPTED ✅' : 'DENIED ❌',
        source: 'cookiebot',
        details: consentData
      };
      
      this.addEvent(eventData);
    },
    
    // Log tag firing event
    logTagFiring: function(tagName, tagType, consentType, allowed, reason) {
      const eventData = {
        tagName: tagName,
        tagType: tagType,
        consentType: consentType,
        allowed: allowed,
        reason: reason,
        status: allowed ? 'FIRED ✅' : 'BLOCKED ❌',
        source: 'tag_manager'
      };
      
      this.addEvent(eventData);
    },
    
    // Clear event log
    clearEventLog: function() {
      window.gtmInspectorEventLog = [];
      console.log('📊 Event log cleared');
    },
    
    // Temporarily disable Cookiebot event listeners to prevent conflicts
    disableCookiebotEvents: function() {
      if (window.Cookiebot) {
        // Store original event listeners
        if (!window.gtmInspectorOriginalCookiebotEvents) {
          window.gtmInspectorOriginalCookiebotEvents = {
            onAccept: window.Cookiebot.callback,
            onDecline: window.Cookiebot.callback,
            onConsentReady: window.Cookiebot.callback
          };
        }
        
        // Temporarily disable callbacks
        window.Cookiebot.callback = null;
        
        console.log('🍪 Temporarily disabled Cookiebot event listeners');
        return true;
      }
      return false;
    },
    
    // Re-enable Cookiebot event listeners
    enableCookiebotEvents: function() {
      if (window.Cookiebot && window.gtmInspectorOriginalCookiebotEvents) {
        // Restore original event listeners
        window.Cookiebot.callback = window.gtmInspectorOriginalCookiebotEvents.onAccept;
        
        console.log('🍪 Re-enabled Cookiebot event listeners');
        return true;
      }
      return false;
    },
    
    // Run comprehensive diagnostics
    runDiagnostics: function() {
      console.log('🔍 Running comprehensive diagnostics...');
      
      const diagnostics = {
        gtm: {},
        consent: {},
        tags: [],
        issues: []
      };
      
      // GTM Diagnostics
      const gtmResult = this.detectGTM();
      diagnostics.gtm = {
        containerId: gtmResult.gtmId,
        dataLayer: !!window.dataLayer,
        gtag: !!window.gtag,
        gtmObject: !!window.google_tag_manager,
        hasGTM: gtmResult.hasGTM,
        hasConsentMode: gtmResult.hasConsentMode
      };
      
      // Consent Mode Diagnostics
      if (gtmResult.hasConsentMode) {
        diagnostics.consent = {
          enabled: true,
          cmp: gtmResult.cmpInfo,
          state: gtmResult.consentState
        };
      } else {
        diagnostics.consent = {
          enabled: false,
          reason: 'No consent mode detected'
        };
      }
      
      // Tag Diagnostics
      diagnostics.tags = this.getTagInfo();
      
      // Issue Detection
      if (!gtmResult.hasGTM) {
        diagnostics.issues.push('GTM not detected on this page');
      }
      
      if (gtmResult.hasGTM && !gtmResult.hasConsentMode) {
        diagnostics.issues.push('GTM detected but Consent Mode is not implemented');
      }
      
      if (gtmResult.hasConsentMode) {
        const consentState = gtmResult.consentState;
        if (consentState.analytics_storage === 'denied' && consentState.ad_storage === 'denied') {
          diagnostics.issues.push('All analytics and advertising consent is denied - most tags will be blocked');
        }
        
        if (!window.Cookiebot && !window.OneTrust && !window.__tcfapi) {
          diagnostics.issues.push('Consent Mode detected but no CMP (Cookiebot, OneTrust, TCF) found');
        }
      }
      
      if (diagnostics.tags.length === 0) {
        diagnostics.issues.push('No tracking tags detected - this might be normal for some pages');
      }
      
      // Check for common implementation issues
      if (window.dataLayer && window.dataLayer.length > 0) {
        const hasConsentEvents = window.dataLayer.some(item => {
          if (Array.isArray(item)) {
            return item[0] === 'consent';
          } else if (item && typeof item === 'object') {
            return item['0'] === 'consent';
          }
          return false;
        });
        
        if (!hasConsentEvents && gtmResult.hasConsentMode) {
          diagnostics.issues.push('Consent Mode detected but no consent events found in dataLayer');
        }
      }
      
      console.log('🔍 Diagnostic results:', diagnostics);
      return { success: true, data: diagnostics };
    },
    
    getTagManagerInteractions: function() {
      // Return raw interaction data for detailed analysis
      return window.gtmInspectorInteractions || [];
    }
  };
  
  // Initialize bidirectional sync
  window.ConsentInspector.initBidirectionalSync();

}

// Listen for messages from content script
window.addEventListener('message', function(event) {
  // Only log and process our specific messages to avoid spam
  if (event.data && event.data.source === 'gtm-inspector-content') {
    console.log('📥 Injected script received GTM Inspector message:', event.data);
    
    // Ensure ConsentInspector is available
    if (!window.ConsentInspector) {
      console.error('❌ ConsentInspector not available, cannot process message');
      window.postMessage({
        source: 'gtm-inspector-page',
        id: event.data.id,
        result: null,
        error: 'ConsentInspector not initialized'
      }, '*');
      return;
    }
    
    const { action, data, id } = event.data;
    console.log('🔧 Processing action:', action, 'with data:', data);
    
    let result = null;
    let error = null;
    
    try {
      switch (action) {
        case 'detectGTM':
          console.log('🔍 Calling detectGTM...');
          result = window.ConsentInspector.detectGTM();
          break;
          
        case 'getTagInfo':
          console.log('🏷️ Calling getTagInfo...');
          result = window.ConsentInspector.getTagInfo();
          break;
          
        case 'updateConsent':
          console.log('🔐 Calling updateConsent...');
          result = window.ConsentInspector.updateConsent(data);
          break;
          
        case 'getEvents':
          console.log('📊 Calling getEvents...');
          result = window.ConsentInspector.getEvents();
          break;
          
        case 'getTagManagerInteractions':
          console.log('📊 Calling getTagManagerInteractions...');
          result = window.ConsentInspector.getTagManagerInteractions();
          break;
          
        case 'logConsentChange':
          console.log('📊 Calling logConsentChange...');
          result = window.ConsentInspector.logConsentChange(data.action, data.consentData);
          break;
          
        case 'logTagFiring':
          console.log('📊 Calling logTagFiring...');
          result = window.ConsentInspector.logTagFiring(data.tagName, data.tagType, data.consentType, data.allowed, data.reason);
          break;
          
        case 'clearEventLog':
          console.log('📊 Calling clearEventLog...');
          result = window.ConsentInspector.clearEventLog();
          break;
          
        case 'runDiagnostics':
          console.log('🔍 Calling runDiagnostics...');
          result = window.ConsentInspector.runDiagnostics();
          break;
          
        case 'getSyncStatus':
          console.log('🔄 Calling getSyncStatus...');
          result = window.ConsentInspector.getSyncStatus();
          break;
          
        case 'forceSync':
          console.log('🔄 Calling forceSync...');
          result = window.ConsentInspector.forceSync();
          break;
          
        case 'applyConsentWithSync':
          console.log('🔄 Calling applyConsentWithSync...');
          result = window.ConsentInspector.updateConsent(data.settings);
          break;
          
        default:
          error = 'Unknown action: ' + action;
          console.error('❌ Unknown action:', action);
      }
    } catch (err) {
      error = err.message;
      console.error('❌ Error processing action:', action, 'Error:', err);
    }
    
    console.log('📤 Sending response:', { result, error });
    
    // Ensure response is serializable before sending
    let serializableResult = result;
    let serializableError = error;
    
    try {
      // Test if result can be serialized
      if (result !== null && result !== undefined) {
        JSON.stringify(result);
      }
    } catch (serializeError) {
      console.error('❌ Result not serializable, sending error instead:', serializeError);
      serializableResult = null;
      serializableError = 'Result data not serializable: ' + serializeError.message;
    }
    
    // Send response back to content script
    window.postMessage({
      source: 'gtm-inspector-page',
      id: id,
      result: serializableResult,
      error: serializableError
    }, '*');
  }
});

console.log('🔧 GTM Inspector injected script loaded successfully');
console.log('🔧 ConsentInspector available:', !!window.ConsentInspector);
console.log('🔧 Message listener attached');

// Initialize bidirectional sync
if (window.ConsentInspector) {
  window.ConsentInspector.initBidirectionalSync();
}