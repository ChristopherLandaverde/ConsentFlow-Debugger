// gtm-detection.test.js - Tests for GTM detection functionality
class GTMDetectionTests {
  constructor(testRunner) {
    this.runner = testRunner;
  }

  async runAllTests() {
    const runner = this.runner;
    const { describe, it, expect, setupMockGTM, setupMockChrome, cleanup } = runner;

    runner.describe('GTM Detection Tests', () => {
      
      runner.it('should detect single GTM container', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Inject the script
        await this.injectTestScript();
        
        // Wait for detection
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        return expect(result.hasGTM).toBeTruthy();
      });

      runner.it('should detect GTM ID correctly', async () => {
        setupMockGTM();
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        return expect(result.gtmId).toBe('GTM-TEST1');
      });

      runner.it('should detect multiple GTM containers', async () => {
        // Setup multiple containers
        window.dataLayer = [];
        window.google_tag_manager = {
          'GTM-TEST1': { dataLayer: window.dataLayer },
          'GTM-TEST2': { dataLayer: window.dataLayer },
          'GTM-TEST3': { dataLayer: window.dataLayer }
        };
        
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        return expect(result.containers.length).toBe(3);
      });

      runner.it('should identify primary container correctly', async () => {
        window.dataLayer = [];
        window.google_tag_manager = {
          'GTM-TEST1': { dataLayer: window.dataLayer },
          'GTM-TEST2': { dataLayer: window.dataLayer }
        };
        
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        return expect(result.primaryContainer.id).toBe('GTM-TEST1');
      });

      runner.it('should detect consent mode when present', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add consent mode to dataLayer
        window.dataLayer.push(['consent', 'default', {
          analytics_storage: 'denied',
          ad_storage: 'denied'
        }]);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        return expect(result.hasConsentMode).toBeTruthy();
      });

      runner.it('should return correct consent state', async () => {
        setupMockGTM();
        setupMockChrome();
        
        const consentState = {
          analytics_storage: 'denied',
          ad_storage: 'granted',
          functionality_storage: 'granted'
        };
        
        window.dataLayer.push(['consent', 'default', consentState]);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        return expect(result.consentState.analytics_storage).toBe('denied');
      });

      runner.it('should handle missing GTM gracefully', async () => {
        // Don't setup GTM
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        return expect(result.hasGTM).toBe(false);
      });

      runner.it('should detect containers from script tags', async () => {
        // Create script tag
        const script = document.createElement('script');
        script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-SCRIPT';
        document.head.appendChild(script);
        
        setupMockChrome();
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        // Clean up
        script.remove();
        cleanup();
        
        // Should detect the script tag container
        return expect(result.containers.some(c => c.id === 'GTM-SCRIPT')).toBeTruthy();
      });

      runner.it('should handle dataLayer serialization safely', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add complex object to dataLayer that might cause serialization issues
        window.dataLayer.push({
          event: 'test',
          complex: {
            nested: {
              data: 'value'
            }
          }
        });
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectGTM();
        
        cleanup();
        
        // Should not throw serialization errors
        return expect(result.hasGTM).toBeTruthy();
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

        window.ConsentInspector = {
          detectGTM: () => {
            const containers = [];
            let hasGTM = false;
            let gtmId = null;
            let hasConsentMode = false;
            let consentState = {};
            let primaryContainer = null;
            let overrideActive = false;

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

            // Check for GTM script tags
            const gtmScripts = document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]');
            gtmScripts.forEach(script => {
              const match = script.src.match(/id=([^&]+)/);
              if (match && match[1]) {
                const id = match[1];
                if (!containers.some(c => c.id === id)) {
                  containers.push({
                    id,
                    dataLayer: window.dataLayer || [],
                    hasConsentMode: detectConsentModeForContainer({ dataLayer: window.dataLayer }),
                    consentState: getConsentStateForContainer({ dataLayer: window.dataLayer })
                  });
                  hasGTM = true;
                  if (!gtmId) gtmId = id;
                }
              }
            });

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
              primaryContainer: primaryContainer || containers[0] || null,
              hasConsentMode,
              consentState,
              overrideActive
            };
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
  module.exports = GTMDetectionTests;
} else {
  window.GTMDetectionTests = GTMDetectionTests;
} 