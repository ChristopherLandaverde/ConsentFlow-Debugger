// src/content/gtm-detector.js
// Module for detecting Google Tag Manager and its configuration

/**
 * Responsible for detecting Google Tag Manager on the page
 * and identifying if Consent Mode is active
 */
export class GTMDetector {
  constructor() {
    this.gtmDetected = false;
    this.gtmId = null;
    this.consentModeActive = false;
  }
  
  /**
   * Detects if GTM is present on the page and identifies
   * if Consent Mode is active
   * 
   * @returns {Object} Detection results
   */
  detect() {
    if (typeof window.google_tag_manager === 'undefined') {
      this.gtmDetected = false;
      return this.getResults();
    }
    
    this.gtmDetected = true;
    
    // Find GTM ID
    for (const key in window.google_tag_manager) {
      if (key.startsWith('GTM-')) {
        this.gtmId = key;
        break;
      }
    }
    
    // Check for Consent Mode
    this.checkConsentMode();
    
    return this.getResults();
  }
  
  /**
   * Checks if Consent Mode is active by examining dataLayer events
   */
  checkConsentMode() {
    if (window.gtag && window.dataLayer) {
      const dataLayer = window.dataLayer;
      
      for (let i = 0; i < dataLayer.length; i++) {
        if (Array.isArray(dataLayer[i]) && 
            dataLayer[i][0] === 'consent' && 
            (dataLayer[i][1] === 'default' || dataLayer[i][1] === 'update')) {
          this.consentModeActive = true;
          break;
        }
      }
    }
  }
  
  /**
   * Gets all GTM information
   * 
   * @returns {Object} GTM detection results
   */
  getResults() {
    return {
      gtmDetected: this.gtmDetected,
      gtmId: this.gtmId,
      consentModeActive: this.consentModeActive
    };
  }
}