// injected-script.js - FIXED GTM container detection

// Prevent multiple injections
if (window.ConsentInspector) {
  console.log('🔧 ConsentInspector already exists, skipping injection...');
} else {
  console.log('🔧 Creating ConsentInspector...');
  
  // Create ConsentInspector in page context
  window.ConsentInspector = {
    version: 'external-v2-fixed',
    
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
    
    // Simulation mode state
    simulationMode: false,
    simulatedConsent: {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted'
    },
    
    // Update simulation mode
    updateSimulationMode: function(data) {
      this.simulationMode = data.simulationMode;
      this.simulatedConsent = { ...this.simulatedConsent, ...data.simulatedConsent };
      console.log('🧪 Simulation mode updated:', this.simulationMode, this.simulatedConsent);
      return { success: true };
    },
    
    // Get current consent state (real or simulated)
    getCurrentConsentState: function() {
      if (this.simulationMode) {
        return this.simulatedConsent;
      }
      
      // Return real consent state
      if (window.Cookiebot && window.Cookiebot.consent) {
        return {
          analytics_storage: window.Cookiebot.consent.statistics ? 'granted' : 'denied',
          ad_storage: window.Cookiebot.consent.marketing ? 'granted' : 'denied',
          functionality_storage: window.Cookiebot.consent.necessary ? 'granted' : 'denied',
          personalization_storage: window.Cookiebot.consent.preferences ? 'granted' : 'denied',
          security_storage: 'granted'
        };
      }
      
      // Fallback to default denied state (more privacy-friendly)
      return {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      };
    },
    
    getTagInfo: function() {
      const tags = [];
      const consentState = this.getCurrentConsentState();
      const realConsentState = this.getRealConsentState();
      
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
            const currentStatus = realConsentState[detector.consentType] === 'granted';
            const simulatedStatus = consentState[detector.consentType] === 'granted';
            const allowed = this.simulationMode ? simulatedStatus : currentStatus;
            
            // Calculate impact analysis
            const impact = this.getTagImpactDescription(detector, currentStatus, simulatedStatus);
            
            tags.push({
              name: detector.name,
              type: detector.type,
              consentType: detector.consentType,
              allowed: allowed,
              reason: `${detector.consentType}: ${consentState[detector.consentType]}`,
              currentStatus: currentStatus,
              simulatedStatus: simulatedStatus,
              impactDescription: impact.description,
              impactIcon: impact.icon,
              impactSeverity: impact.severity
            });
          }
        } catch (error) {
          console.log('Error checking detector:', detector.name, error);
        }
      });
      
      return tags;
    },
    
    // Get real consent state (not simulated)
    getRealConsentState: function() {
      if (window.Cookiebot && window.Cookiebot.consent) {
        return {
          analytics_storage: window.Cookiebot.consent.statistics ? 'granted' : 'denied',
          ad_storage: window.Cookiebot.consent.marketing ? 'granted' : 'denied',
          functionality_storage: window.Cookiebot.consent.necessary ? 'granted' : 'denied',
          personalization_storage: window.Cookiebot.consent.preferences ? 'granted' : 'denied',
          security_storage: 'granted'
        };
      }
      
      // Fallback to default granted state
      return {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'granted',
        security_storage: 'granted'
      };
    },
    
    // Get detailed impact description for tag consent changes
    getTagImpactDescription: function(detector, currentStatus, simulatedStatus) {
      if (!this.simulationMode) {
        return {
          description: `Currently ${currentStatus ? 'allowed' : 'blocked'}`,
          icon: currentStatus ? '✅' : '🚫',
          severity: 'info'
        };
      }
      
      // In simulation mode, show before/after comparison
      if (currentStatus === simulatedStatus) {
        return {
          description: `No change - ${currentStatus ? 'Would continue firing' : 'Would remain blocked'}`,
          icon: currentStatus ? '✅' : '🚫',
          severity: 'info'
        };
      }
      
      if (currentStatus && !simulatedStatus) {
        return {
          description: `Would be blocked - No ${detector.type} data collection`,
          icon: '🚫',
          severity: 'warning'
        };
      }
      
      if (!currentStatus && simulatedStatus) {
        return {
          description: `Would be allowed - ${detector.type} data collection enabled`,
          icon: '✅',
          severity: 'success'
        };
      }
      
      return {
        description: 'Status unclear',
        icon: '⚠️',
        severity: 'warning'
      };
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
        
        // Get real events from chrome storage (will be populated by content.js RealEventLogger)
        // Note: This is called from page context, so we need to request from content script
        const realEvents = window.gtmInspectorEventLog || [];
        
        // Add real events to the list
        events.push(...realEvents);
        
        // Get current consent state and add as event if it exists
        const currentConsent = this.getCurrentConsentState();
        if (currentConsent && !currentConsent._noConsentMode) {
          const consentEvent = {
            id: this.generateUUID(),
            timestamp: Date.now(),
            tagName: 'Current Consent State',
            tagType: 'consent_status',
            consentType: 'current',
            allowed: true,
            reason: `Analytics: ${currentConsent.analytics_storage}, Ads: ${currentConsent.ad_storage}, Functionality: ${currentConsent.functionality_storage}`,
            status: 'ACTIVE 📊',
            source: 'consent_state',
            isSimulated: false,
            url: window.location.href
          };
          events.push(consentEvent);
        }
        
        // Get detected tags and their consent status
        const detectedTags = this.getTagInfo();
        detectedTags.forEach(tag => {
          const tagEvent = {
            id: this.generateUUID(),
            timestamp: Date.now(),
            tagName: tag.name,
            tagType: tag.type,
            consentType: tag.consentType,
            allowed: tag.allowed,
            reason: tag.reason,
            status: tag.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌',
            source: 'tag_detection',
            isSimulated: false,
            url: window.location.href
          };
          events.push(tagEvent);
        });
        
        // Add test event if no events found
        if (events.length === 0) {
          const statusEvent = {
            id: this.generateUUID(),
            timestamp: Date.now(),
            tagName: 'Event Log Ready',
            tagType: 'system',
            consentType: 'none',
            allowed: true,
            reason: 'Event log is ready to capture consent activity and tag events',
            status: 'READY ✅',
            source: 'system',
            isSimulated: false,
            url: window.location.href
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
    
    // Generate UUID for event tracking
    generateUUID: function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },
    
    // Add event to the log
    addEvent: function(eventData) {
      try {
        if (!window.gtmInspectorEventLog) {
          window.gtmInspectorEventLog = [];
        }
        
        const event = {
          id: this.generateUUID(),
          timestamp: Date.now(),
          isSimulated: false,
          source: 'page_context',
          url: window.location.href,
          ...eventData
        };
        
        window.gtmInspectorEventLog.push(event);
        
        // Keep only last 100 events
        if (window.gtmInspectorEventLog.length > 100) {
          window.gtmInspectorEventLog = window.gtmInspectorEventLog.slice(-100);
        }
        
        console.log('📊 Event logged:', event);
        return { success: true, event: event };
      } catch (error) {
        console.error('❌ Error adding event:', error);
        return { success: false, error: error.message };
      }
    },
    
    // Log consent change event
    logConsentChange: function(action, consentData) {
      try {
        const eventData = {
          tagName: `Consent ${action.charAt(0).toUpperCase() + action.slice(1)}`,
          tagType: 'consent_change',
          consentType: 'user_action',
          allowed: true,
          reason: `User ${action} consent`,
          status: 'CONSENT_CHANGE 📊',
          data: consentData
        };
        
        return this.addEvent(eventData);
      } catch (error) {
        console.error('❌ Error logging consent change:', error);
        return { success: false, error: error.message };
      }
    },
    
    // Log tag firing event
    logTagFiring: function(tagName, tagType, consentType, allowed, reason) {
      try {
        const eventData = {
          tagName: tagName,
          tagType: tagType,
          consentType: consentType,
          allowed: allowed,
          reason: reason,
          status: allowed ? 'FIRED ✅' : 'BLOCKED ❌',
          data: {
            tagName: tagName,
            tagType: tagType,
            consentType: consentType
          }
        };
        
        return this.addEvent(eventData);
      } catch (error) {
        console.error('❌ Error logging tag firing:', error);
        return { success: false, error: error.message };
      }
    },
    
    // Clear event log
    clearEventLog: function() {
      try {
        // Clear the local event log
        if (window.gtmInspectorEventLog) {
          window.gtmInspectorEventLog = [];
        }
        
        console.log('🗑️ Event log cleared');
        return { success: true, message: 'Event log cleared successfully' };
      } catch (error) {
        console.error('❌ Error clearing event log:', error);
        return { success: false, error: error.message };
      }
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
    
    getTagStatus: function() {
      const tags = this.getTagInfo();
      const consentState = this.getCurrentConsentState();
      
      return {
        success: true,
        tags: tags,
        totalTags: tags.length,
        allowedTags: tags.filter(tag => tag.allowed).length,
        blockedTags: tags.filter(tag => !tag.allowed).length,
        consentState: consentState,
        simulationMode: this.simulationMode,
        timestamp: Date.now()
      };
    },
    
    getTagManagerInteractions: function() {
      // Return raw interaction data for detailed analysis
      return window.gtmInspectorInteractions || [];
    }
  };
  

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
          
        case 'getTagStatus':
          console.log('📊 Calling getTagStatus...');
          result = window.ConsentInspector.getTagStatus();
          break;
          
        case 'getEvents':
          console.log('📊 Calling getEvents...');
          result = window.ConsentInspector.getEvents();
          break;
          
        case 'updateConsent':
          console.log('🍪 Calling updateConsent...');
          if (!data || !data.consent) {
            throw new Error('No consent data provided');
          }
          result = window.ConsentInspector.updateConsent(data.consent);
          break;
          
        case 'updateSimulationMode':
          console.log('🧪 Calling updateSimulationMode...');
          if (!data) {
            throw new Error('No simulation data provided');
          }
          result = window.ConsentInspector.updateSimulationMode(data);
          break;
          
        case 'clearEventLog':
          console.log('🗑️ Calling clearEventLog...');
          result = window.ConsentInspector.clearEventLog();
          break;
          
        case 'runDiagnostics':
          console.log('🔍 Calling runDiagnostics...');
          result = window.ConsentInspector.runDiagnostics();
          break;
          
        case 'getTagManagerInteractions':
          console.log('📊 Calling getTagManagerInteractions...');
          result = window.ConsentInspector.getTagManagerInteractions();
          break;
          
        default:
          error = `Unknown action: ${action}`;
          console.error('❌ Unknown action:', action);
      }
    } catch (err) {
      error = err.message;
      console.error('❌ Error processing action:', action, 'Error:', err);
      
      // Provide user-friendly error messages
      if (err.message.includes('Permission')) {
        error = 'Permission denied - this action requires user consent';
      } else if (err.message.includes('Network')) {
        error = 'Network error - please check your connection';
      } else if (err.message.includes('Timeout')) {
        error = 'Request timed out - please try again';
      } else if (err.message.includes('Not found')) {
        error = 'Resource not found - the page may have changed';
      }
    }
    
    // Send response back to content script
    const response = {
      source: 'gtm-inspector-page',
      id: id,
      result: result,
      error: error
    };
    
    console.log('📤 Sending response:', response);
    window.postMessage(response, '*');
  }
});

console.log('🔧 GTM Inspector injected script loaded successfully');
console.log('🔧 ConsentInspector available:', !!window.ConsentInspector);
console.log('🔧 Message listener attached');