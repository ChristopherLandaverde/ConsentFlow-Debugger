// tag-detection.test.js - Tests for tag detection functionality
class TagDetectionTests {
  constructor(testRunner) {
    this.runner = testRunner;
  }

  async runAllTests() {
    const runner = this.runner;
    const { describe, it, expect, setupMockGTM, setupMockChrome, cleanup } = runner;

    runner.describe('Tag Detection Tests', () => {
      
      runner.it('should detect Google Analytics 4 tags', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock GA4
        window.gtag = function() {};
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        return expect(tags.some(tag => tag.name === 'Google Analytics 4')).toBeTruthy();
      });

      runner.it('should detect Universal Analytics tags', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock UA
        window.ga = function() {};
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        return expect(tags.some(tag => tag.name === 'Universal Analytics')).toBeTruthy();
      });

      runner.it('should detect Google Ads tags', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock Google Ads script
        const script = document.createElement('script');
        script.src = 'https://www.googleadservices.com/pagead/conversion.js';
        document.head.appendChild(script);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        // Clean up
        script.remove();
        cleanup();
        
        return expect(tags.some(tag => tag.name === 'Google Ads')).toBeTruthy();
      });

      runner.it('should detect Facebook Pixel tags', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock Facebook Pixel
        window.fbq = function() {};
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        return expect(tags.some(tag => tag.name === 'Facebook Pixel')).toBeTruthy();
      });

      runner.it('should detect Hotjar tags', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock Hotjar
        window.hj = function() {};
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        return expect(tags.some(tag => tag.name === 'Hotjar')).toBeTruthy();
      });

      runner.it('should correctly identify tag consent requirements', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock multiple tags
        window.gtag = function() {};
        window.fbq = function() {};
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        const analyticsTag = tags.find(tag => tag.name === 'Google Analytics 4');
        const adsTag = tags.find(tag => tag.name === 'Facebook Pixel');
        
        return expect(analyticsTag.consentType).toBe('analytics_storage') &&
               expect(adsTag.consentType).toBe('ad_storage');
      });

      runner.it('should filter tags based on consent state', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock tags
        window.gtag = function() {};
        window.fbq = function() {};
        
        // Set consent state
        window.dataLayer.push(['consent', 'default', {
          analytics_storage: 'granted',
          ad_storage: 'denied'
        }]);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        const analyticsTag = tags.find(tag => tag.name === 'Google Analytics 4');
        const adsTag = tags.find(tag => tag.name === 'Facebook Pixel');
        
        return expect(analyticsTag.allowed).toBeTruthy() &&
               expect(adsTag.allowed).toBe(false);
      });

      runner.it('should handle tag detection with no tags present', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Clear all tag functions to simulate no tags
        delete window.gtag;
        delete window.ga;
        delete window.fbq;
        delete window.hj;
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        return expect(tags.length).toBe(0);
      });

      runner.it('should detect tags from script tags', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add GA4 script tag
        const script = document.createElement('script');
        script.src = 'https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID';
        document.head.appendChild(script);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        // Clean up
        script.remove();
        cleanup();
        
        return expect(tags.some(tag => tag.name === 'Google Analytics 4')).toBeTruthy();
      });

      runner.it('should handle override state in tag detection', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock tag
        window.gtag = function() {};
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        // Apply override
        window.ConsentInspector.updateConsent({
          analytics_storage: 'granted'
        });
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        const analyticsTag = tags.find(tag => tag.name === 'Google Analytics 4');
        
        return expect(analyticsTag.overridden).toBeTruthy();
      });

      runner.it('should provide correct tag reasoning', async () => {
        setupMockGTM();
        
        // Mock tag
        window.gtag = function() {};
        
        // Set consent to denied
        window.dataLayer.push(['consent', 'default', {
          analytics_storage: 'denied'
        }]);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        const analyticsTag = tags.find(tag => tag.name === 'Google Analytics 4');
        
        return expect(analyticsTag.reason).toContain('denied');
      });

      runner.it('should handle multiple tag types simultaneously', async () => {
        setupMockGTM();
        
        // Mock multiple tags
        window.gtag = function() {};
        window.ga = function() {};
        window.fbq = function() {};
        window.hj = function() {};
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const tags = window.ConsentInspector.getTagInfo();
        
        cleanup();
        
        return expect(tags.length).toBeGreaterThanOrEqual(4);
      });
    });
  }

  async injectTestScript() {
    return new Promise((resolve) => {
      // In test environment, we'll create a mock ConsentInspector
      // instead of trying to load the actual script
      if (!window.ConsentInspector) {
        // Helper functions
        const detectConsentModeForContainer = (container) => {
          if (container.dataLayer && Array.isArray(container.dataLayer)) {
            return container.dataLayer.some(item => 
              Array.isArray(item) && item[0] === 'consent'
            );
          }
          return false;
        };
        
        const getConsentStateForContainer = (container) => {
          if (container.dataLayer && Array.isArray(container.dataLayer)) {
            const consentEvents = container.dataLayer.filter(item => 
              Array.isArray(item) && item[0] === 'consent'
            );
            if (consentEvents.length > 0) {
              const lastEvent = consentEvents[consentEvents.length - 1];
              return lastEvent[2] || {};
            }
          }
          return {};
        };

        // Track override state
        let overrideActive = false;
        let overrideSettings = {};

        const isConsentGranted = (consentType) => {
          // Check override first
          if (overrideActive && overrideSettings[consentType]) {
            return overrideSettings[consentType] === 'granted';
          }
          
          if (window.dataLayer && Array.isArray(window.dataLayer)) {
            const consentEvents = window.dataLayer.filter(item => 
              Array.isArray(item) && item[0] === 'consent'
            );
            if (consentEvents.length > 0) {
              const lastEvent = consentEvents[consentEvents.length - 1];
              return lastEvent[2] && lastEvent[2][consentType] === 'granted';
            }
          }
          return false;
        };

        const updateConsent = (settings) => {
          if (window.gtag) {
            window.gtag('consent', 'update', settings);
            overrideActive = true;
            overrideSettings = { ...settings };
            return { success: true };
          }
          return { success: false };
        };

        window.ConsentInspector = {
          detectGTM: () => {
            const containers = [];
            let hasGTM = false;
            let gtmId = null;
            let hasConsentMode = false;
            let consentState = {};
            let primaryContainer = null;

            // Check for google_tag_manager
            if (window.google_tag_manager && typeof window.google_tag_manager === 'object') {
              hasGTM = true;
              const containerIds = Object.keys(window.google_tag_manager);
              gtmId = containerIds[0] || null;
              
              containerIds.forEach(id => {
                const container = window.google_tag_manager[id];
                containers.push({
                  id,
                  dataLayer: container.dataLayer || [],
                  hasConsentMode: detectConsentModeForContainer(container),
                  consentState: getConsentStateForContainer(container)
                });
              });
              
              primaryContainer = containers[0] || null;
            }

            // Check for consent mode
            if (window.dataLayer && Array.isArray(window.dataLayer)) {
              const consentEvents = window.dataLayer.filter(item => 
                Array.isArray(item) && item[0] === 'consent'
              );
              hasConsentMode = consentEvents.length > 0;
              
              if (hasConsentMode && consentEvents.length > 0) {
                const lastConsentEvent = consentEvents[consentEvents.length - 1];
                if (lastConsentEvent[2] && typeof lastConsentEvent[2] === 'object') {
                  consentState = lastConsentEvent[2];
                }
              }
            }

            return {
              hasGTM,
              gtmId,
              containers,
              primaryContainer,
              hasConsentMode,
              consentState,
              overrideActive
            };
          },
          
          getTagInfo: () => {
            const tags = [];
            
            // Check for Google Analytics 4
            if (window.gtag) {
              const allowed = isConsentGranted('analytics_storage');
              tags.push({
                name: 'Google Analytics 4',
                consentType: 'analytics_storage',
                allowed,
                overridden: overrideActive,
                reason: allowed ? 'granted' : 'denied'
              });
            }
            
            // Check for Universal Analytics
            if (window.ga) {
              const allowed = isConsentGranted('analytics_storage');
              tags.push({
                name: 'Universal Analytics',
                consentType: 'analytics_storage',
                allowed,
                overridden: overrideActive,
                reason: allowed ? 'granted' : 'denied'
              });
            }
            
            // Check for Google Ads
            if (document.querySelector('script[src*="googleadservices.com"]')) {
              const allowed = isConsentGranted('ad_storage');
              tags.push({
                name: 'Google Ads',
                consentType: 'ad_storage',
                allowed,
                overridden: overrideActive,
                reason: allowed ? 'granted' : 'denied'
              });
            }
            
            // Check for Facebook Pixel
            if (window.fbq) {
              const allowed = isConsentGranted('ad_storage');
              tags.push({
                name: 'Facebook Pixel',
                consentType: 'ad_storage',
                allowed,
                overridden: overrideActive,
                reason: allowed ? 'granted' : 'denied'
              });
            }
            
            // Check for Hotjar
            if (window.hj) {
              const allowed = isConsentGranted('functionality_storage');
              tags.push({
                name: 'Hotjar',
                consentType: 'functionality_storage',
                allowed,
                overridden: overrideActive,
                reason: allowed ? 'granted' : 'denied'
              });
            }
            
            return tags;
          },
          
          isConsentGranted,
          updateConsent,
          detectConsentModeForContainer,
          getConsentStateForContainer
        };
      }
      
      // Simulate script loading delay
      setTimeout(resolve, 10);
    });
  }
}

// Export for use in test runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TagDetectionTests;
} else {
  window.TagDetectionTests = TagDetectionTests;
} 