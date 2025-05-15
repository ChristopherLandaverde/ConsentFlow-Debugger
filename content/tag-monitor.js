// src/content/tag-monitor.js
// Module for monitoring tag execution in GTM

/**
 * Monitors tags in GTM and tracks their execution status
 */
export class TagMonitor {
  /**
   * @param {EventLogger} eventLogger - Event logger instance for logging tag events
   */
  constructor(eventLogger) {
    this.eventLogger = eventLogger;
    this.gtmId = null;
    this.monitorInterval = null;
    this.loggedTags = new Set();
    
    // Map of tag type IDs to readable names
    this.tagTypes = {
      'ua': 'Universal Analytics',
      'ga4': 'Google Analytics 4',
      'awct': 'Google Ads Conversion Tracking',
      'flc': 'Floodlight Counter',
      'fls': 'Floodlight Sales',
      'pcm': 'Personalization',
      'gclidw': 'GCLID Writes'
    };
    
    // Map of tag types to consent categories
    this.tagToConsentMap = {
      'ua': 'analytics_storage',
      'ga4': 'analytics_storage',
      'awct': 'ad_storage',
      'flc': 'ad_storage',
      'fls': 'ad_storage',
      'pcm': 'personalization_storage'
    };
  }
  
  /**
   * Initialize tag monitoring
   * 
   * @param {string} gtmId - Google Tag Manager container ID
   */
  init(gtmId) {
    this.gtmId = gtmId;
    if (!this.gtmId) return;
    
    // Start monitoring tag execution
    this.monitorTagExecution();
  }
  
  /**
   * Set up periodic monitoring of tag execution
   */
  monitorTagExecution() {
    if (!this.gtmId || this.monitorInterval) return;
    
    const gtmContainer = window.google_tag_manager[this.gtmId];
    if (!gtmContainer) return;
    
    // Check for new tags periodically
    this.monitorInterval = setInterval(() => {
      if (!window.google_tag_manager || !window.google_tag_manager[this.gtmId]) {
        // Clean up if GTM is no longer available
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
        return;
      }
      
      try {
        // Get tag execution status from GTM
        const tagData = gtmContainer.dataLayer.helper.dataLayer.data.load;
        
        if (!tagData) return;
        
        for (const tagId in tagData) {
          const tag = tagData[tagId];
          
          // Only log tags that have executed and haven't been logged yet
          if (tag && tag.name && tag.executionTime && !this.loggedTags.has(tagId)) {
            // Add to logged tags set
            this.loggedTags.add(tagId);
            
            // Log the event
            this.eventLogger.logEvent(
              'Tag Executed', 
              'tag', 
              `Tag: ${tag.name}, Type: ${tag.tagTypeId || 'unknown'}`
            );
          }
        }
      } catch (e) {
        console.error('Error monitoring tag execution:', e);
      }
    }, 500);
  }
  
  /**
   * Get status of all tags in the GTM container
   * 
   * @param {Object} consentState - Current consent state
   * @returns {Array} Array of tag objects with status information
   */
  getTagStatus(consentState) {
    const tags = [];
    
    if (!this.gtmId) return tags;
    
    // Get GTM container
    const gtmContainer = window.google_tag_manager[this.gtmId];
    if (!gtmContainer) return tags;
    
    // Try to access tags and their execution status
    try {
      for (const tagId in gtmContainer.dataLayer.helper.dataLayer.data.load) {
        const tagData = gtmContainer.dataLayer.helper.dataLayer.data.load[tagId];
        if (tagData && tagData.tagTypeId) {
          const tagType = this.tagTypes[tagData.tagTypeId] || tagData.tagTypeId;
          const tagName = tagData.name || `Tag ${tagId}`;
          
          // Determine if tag is allowed based on consent settings
          let allowed = true;
          let reason = 'Default allowed';
          let wouldFireWith = '';
          
          // Check if tag requires specific consent
          const requiredConsentType = this.tagToConsentMap[tagData.tagTypeId];
          if (requiredConsentType) {
            if (consentState[requiredConsentType] === 'denied') {
              allowed = false;
              reason = `${requiredConsentType} consent denied`;
              wouldFireWith = requiredConsentType;
            } else {
              reason = `${requiredConsentType} consent granted`;
            }
          }
          
          // Determine tag category based on type
          let category = 'other';
          if (tagData.tagTypeId === 'ua' || tagData.tagTypeId === 'ga4' || 
              tagType.toLowerCase().includes('analytics')) {
            category = 'analytics';
          } else if (tagData.tagTypeId === 'awct' || tagData.tagTypeId === 'flc' || 
                    tagData.tagTypeId === 'fls' || tagType.toLowerCase().includes('ads') || 
                    tagType.toLowerCase().includes('conversion')) {
            category = 'advertising';
          } else if (tagData.tagTypeId === 'pcm' || 
                    tagType.toLowerCase().includes('personalization')) {
            category = 'personalization';
          } else if (tagType.toLowerCase().includes('functionality') || 
                    tagType.toLowerCase().includes('utilities')) {
            category = 'functionality';
          }
          
          tags.push({
            id: tagId,
            name: tagName,
            type: tagType,
            category: category,
            allowed: allowed,
            reason: reason,
            wouldFireWith: wouldFireWith,
            executionTime: tagData.executionTime || null
          });
        }
      }
    } catch (e) {
      console.error('Error getting tag status:', e);
    }
    
    return tags;
  }
  
  /**
   * Run QA tests for tag firing based on consent
   * 
   * @param {Function} getCurrentConsentState - Function to get current consent state
   * @returns {Array} Test results
   */
  runTagTest(getCurrentConsentState) {
    const results = [];
    const consentState = getCurrentConsentState();
    const tags = this.getTagStatus(consentState);
    
    // Test 1: Check if any tags are defined
    results.push({
      name: 'Tag Definitions',
      passed: tags.length > 0,
      message: tags.length > 0 ? 
        `Found ${tags.length} defined tags` : 
        'No tags defined on this page'
    });
    
    // Test 2: Check if analytics tags respond to consent
    // First identify analytics tags
    const analyticsTags = tags.filter(tag => tag.category === 'analytics');
    
    if (analyticsTags.length > 0) {
      // Save original state
      const originalState = {...consentState};
      
      // Test with analytics_storage denied
      const testDenied = {
        analytics_storage: 'denied'
      };
      
      // Apply denied state
      window.gtag('consent', 'update', testDenied);
      
      // Get updated tag status
      const updatedTags = this.getTagStatus(getCurrentConsentState());
      const updatedAnalyticsTags = updatedTags.filter(tag => tag.category === 'analytics');
      
      // Check if all analytics tags are now blocked
      const allBlocked = updatedAnalyticsTags.every(tag => !tag.allowed);
      
      results.push({
        name: 'Analytics Tags Consent Response',
        passed: allBlocked,
        message: allBlocked ? 
          'Analytics tags correctly blocked when analytics_storage denied' : 
          'Some analytics tags still fire even when analytics_storage denied'
      });
      
      // Restore original state
      window.gtag('consent', 'update', originalState);
    } else {
      results.push({
        name: 'Analytics Tags Consent Response',
        passed: true,
        message: 'No analytics tags found to test'
      });
    }
    
    // Test 3: Check if advertising tags respond to consent
    const adTags = tags.filter(tag => tag.category === 'advertising');
    
    if (adTags.length > 0) {
      // Save original state
      const originalState = {...consentState};
      
      // Test with ad_storage denied
      const testDenied = {
        ad_storage: 'denied'
      };
      
      // Apply denied state
      window.gtag('consent', 'update', testDenied);
      
      // Get updated tag status
      const updatedTags = this.getTagStatus(getCurrentConsentState());
      const updatedAdTags = updatedTags.filter(tag => tag.category === 'advertising');
      
      // Check if all ad tags are now blocked
      const allBlocked = updatedAdTags.every(tag => !tag.allowed);
      
      results.push({
        name: 'Advertising Tags Consent Response',
        passed: allBlocked,
        message: allBlocked ? 
          'Advertising tags correctly blocked when ad_storage denied' : 
          'Some advertising tags still fire even when ad_storage denied'
      });
      
      // Restore original state
      window.gtag('consent', 'update', originalState);
    } else {
      results.push({
        name: 'Advertising Tags Consent Response',
        passed: true,
        message: 'No advertising tags found to test'
      });
    }
    
    return results;
  }
}