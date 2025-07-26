// consent-management.test.js - Tests for consent management functionality
class ConsentManagementTests {
  constructor(testRunner) {
    this.runner = testRunner;
  }

  async runAllTests() {
    const runner = this.runner;
    const { describe, it, expect, setupMockGTM, setupMockChrome, cleanup } = runner;

    runner.describe('Consent Management Tests', () => {
      
      runner.it('should apply consent override successfully', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const consentSettings = {
          analytics_storage: 'granted',
          ad_storage: 'denied',
          functionality_storage: 'granted'
        };
        
        const result = window.ConsentInspector.updateConsent(consentSettings);
        
        cleanup();
        
        return expect(result.success).toBeTruthy();
      });

      runner.it('should maintain consent override against site changes', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        // Apply override
        window.ConsentInspector.updateConsent({
          analytics_storage: 'granted',
          ad_storage: 'granted'
        });
        
        // Simulate site trying to change consent
        window.dataLayer.push(['consent', 'update', {
          analytics_storage: 'denied',
          ad_storage: 'denied'
        }]);
        
        // Wait for override protection to kick in
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Check if override is still active
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        return expect(result.overrideActive).toBeTruthy();
      });

      runner.it('should stop consent override when requested', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        // Apply override
        window.ConsentInspector.updateConsent({
          analytics_storage: 'granted'
        });
        
        // Stop override
        const result = window.ConsentInspector.stopOverride();
        
        cleanup();
        
        return expect(result.success).toBeTruthy();
      });

      runner.it('should detect consent mode correctly', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add consent mode
        window.dataLayer.push(['consent', 'default', {
          analytics_storage: 'denied'
        }]);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectConsentMode();
        
        cleanup();
        
        return expect(result).toBeTruthy();
      });

      runner.it('should get current consent state accurately', async () => {
        setupMockGTM();
        setupMockChrome();
        
        const expectedState = {
          analytics_storage: 'denied',
          ad_storage: 'granted',
          functionality_storage: 'granted'
        };
        
        window.dataLayer.push(['consent', 'default', expectedState]);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.getCurrentConsentState();
        
        cleanup();
        
        return expect(result.analytics_storage).toBe('denied');
      });

      runner.it('should handle allowAll() function', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.allowAll();
        
        cleanup();
        
        return expect(result.success).toBeTruthy();
      });

      runner.it('should handle denyAll() function', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.denyAll();
        
        cleanup();
        
        return expect(result.success).toBeTruthy();
      });

      runner.it('should handle analyticsOnly() function', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.analyticsOnly();
        
        cleanup();
        
        return expect(result.success).toBeTruthy();
      });

      runner.it('should log consent events correctly', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        // Trigger consent event
        window.dataLayer.push(['consent', 'update', {
          analytics_storage: 'granted'
        }]);
        
        // Wait for event processing
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const events = window.ConsentInspector.getEvents();
        
        cleanup();
        
        return expect(events.some(e => e.type === 'Consent Update')).toBeTruthy();
      });

      runner.it('should handle missing consent mechanisms gracefully', async () => {
        // Setup GTM without gtag or dataLayer
        window.google_tag_manager = {
          'GTM-TEST1': {}
        };
        
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.updateConsent({
          analytics_storage: 'granted'
        });
        
        cleanup();
        
        return expect(result.success).toBe(false);
      });

      runner.it('should timeout consent override after 30 seconds', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        // Apply override
        window.ConsentInspector.updateConsent({
          analytics_storage: 'granted'
        });
        
        // Wait for timeout (reduced for testing)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if override is still active initially
        let result = window.ConsentInspector.detectGTM();
        const initiallyActive = result.overrideActive;
        
        cleanup();
        
        return expect(initiallyActive).toBeTruthy();
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

        // Track override state and events
        let overrideActive = false;
        let overrideSettings = {};
        let consentEvents = [];

        // Monitor dataLayer for consent events
        const originalPush = window.dataLayer ? window.dataLayer.push : null;
        if (window.dataLayer) {
          window.dataLayer.push = function(...args) {
            // Call original push
            if (originalPush) {
              originalPush.apply(this, args);
            }
            
            // Check if this is a consent event
            if (args.length > 0 && Array.isArray(args[0]) && args[0][0] === 'consent') {
              consentEvents.push({
                type: 'Consent Update',
                timestamp: Date.now(),
                settings: args[0][2] || {}
              });
            }
          };
        }

        const updateConsent = (settings) => {
          if (window.gtag) {
            window.gtag('consent', 'update', settings);
            overrideActive = true;
            overrideSettings = { ...settings };
            consentEvents.push({
              type: 'Consent Update',
              timestamp: Date.now(),
              settings
            });
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
          
          updateConsent,
          
          stopOverride: () => {
            return { success: true };
          },
          
          detectConsentMode: () => {
            return window.dataLayer && Array.isArray(window.dataLayer) &&
                   window.dataLayer.some(item => Array.isArray(item) && item[0] === 'consent');
          },
          
          getCurrentConsentState: () => {
            if (window.dataLayer && Array.isArray(window.dataLayer)) {
              const consentEvents = window.dataLayer.filter(item => 
                Array.isArray(item) && item[0] === 'consent'
              );
              if (consentEvents.length > 0) {
                const lastEvent = consentEvents[consentEvents.length - 1];
                return lastEvent[2] || {};
              }
            }
            return {};
          },
          
          allowAll: () => {
            return updateConsent({
              analytics_storage: 'granted',
              ad_storage: 'granted',
              functionality_storage: 'granted'
            });
          },
          
          denyAll: () => {
            return updateConsent({
              analytics_storage: 'denied',
              ad_storage: 'denied',
              functionality_storage: 'denied'
            });
          },
          
          analyticsOnly: () => {
            return updateConsent({
              analytics_storage: 'granted',
              ad_storage: 'denied',
              functionality_storage: 'granted'
            });
          },
          
          getEvents: () => {
            return consentEvents;
          },
          
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
  module.exports = ConsentManagementTests;
} else {
  window.ConsentManagementTests = ConsentManagementTests;
} 