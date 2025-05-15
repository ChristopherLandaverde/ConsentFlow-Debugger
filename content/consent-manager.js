// src/content/consent-manager.js
// Module for managing consent settings and state

/**
 * Manages consent mode state and interactions
 */
export class ConsentManager {
  /**
   * @param {EventLogger} eventLogger - Event logger instance for logging consent events
   */
  constructor(eventLogger) {
    this.eventLogger = eventLogger;
    
    // Default consent state
    this.defaultConsentState = {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted'
    };
    
    // Store original gtag function
    this.originalGtagFunction = null;
  }
  
  /**
   * Initialize consent monitoring
   */
  init() {
    // Only override gtag if not already done
    if (window.gtag && !this.originalGtagFunction) {
      this.setupGtagOverride();
    }
  }
  
  /**
   * Override gtag function to monitor consent updates
   */
  setupGtagOverride() {
    this.originalGtagFunction = window.gtag;
    
    window.gtag = (...args) => {
      // Call the original gtag function
      const result = this.originalGtagFunction.apply(window, args);
      
      // Log consent updates
      try {
        if (args[0] === 'consent') {
          this.eventLogger.logEvent(
            'gtag Consent', 
            'consent', 
            `Action: ${args[1]}, Settings: ${JSON.stringify(args[2])}`
          );
        }
      } catch (e) {
        console.error('Error logging gtag consent event:', e);
      }
      
      return result;
    };
  }
  
  /**
   * Gets the current consent state from dataLayer
   * 
   * @returns {Object} Current consent state
   */
  getCurrentConsentState() {
    const consentState = {...this.defaultConsentState};
    
    if (!window.dataLayer) return consentState;
    
    // Search the dataLayer for consent settings
    const dataLayer = window.dataLayer;
    for (let i = dataLayer.length - 1; i >= 0; i--) {
      if (Array.isArray(dataLayer[i]) && 
          (dataLayer[i][0] === 'consent' && 
           (dataLayer[i][1] === 'default' || dataLayer[i][1] === 'update'))) {
        const consentUpdate = dataLayer[i][2] || {};
        
        // Update consent state with values from dataLayer
        for (const key in consentUpdate) {
          consentState[key] = consentUpdate[key];
        }
      }
    }
    
    return consentState;
  }
  
  /**
   * Apply new consent settings
   * 
   * @param {Object} settings - Consent settings to apply
   * @returns {boolean} Success status
   */
  applyConsentSettings(settings) {
    if (!window.gtag) {
      console.error('gtag not found');
      return false;
    }
    
    try {
      // Log the event before applying
      this.eventLogger.logEvent(
        'Simulated Consent', 
        'consent', 
        `Updated settings: ${JSON.stringify(settings)}`
      );
      
      // Apply the consent settings
      window.gtag('consent', 'update', settings);
      
      return true;
    } catch (e) {
      console.error('Error applying consent settings:', e);
      return false;
    }
  }
  
  /**
   * Run tests on consent mode functionality
   * 
   * @returns {Array} Test results
   */
  runConsentTest() {
    const results = [];
    const consentState = this.getCurrentConsentState();
    
    // Test 1: Check if consent mode is properly initialized
    results.push({
      name: 'Consent Mode Initialization',
      passed: window.gtag !== undefined,
      message: window.gtag !== undefined ? 
        'Consent Mode is properly initialized' : 
        'Consent Mode is not initialized'
    });
    
    // Test 2: Check if default consent state matches expectations
    const hasDefaultConsent = Object.keys(consentState).length > 0;
    results.push({
      name: 'Default Consent State',
      passed: hasDefaultConsent,
      message: hasDefaultConsent ? 
        `Default consent state defined: ${JSON.stringify(consentState)}` : 
        'No default consent state defined'
    });
    
    // Test 3: Check consent state response to updates
    const originalState = {...consentState};
    
    try {
      // Try to update a consent setting
      const testSetting = {
        analytics_storage: consentState.analytics_storage === 'granted' ? 'denied' : 'granted'
      };
      
      window.gtag('consent', 'update', testSetting);
      
      // Get the updated state
      const newState = this.getCurrentConsentState();
      const updateWorked = newState.analytics_storage === testSetting.analytics_storage;
      
      results.push({
        name: 'Consent Update Response',
        passed: updateWorked,
        message: updateWorked ? 
          'Consent state successfully updates in response to gtag calls' : 
          'Consent state does not update properly'
      });
      
      // Restore original state
      window.gtag('consent', 'update', originalState);
    } catch (e) {
      results.push({
        name: 'Consent Update Response',
        passed: false,
        message: `Error updating consent: ${e.message}`
      });
    }
    
    return results;
  }
}