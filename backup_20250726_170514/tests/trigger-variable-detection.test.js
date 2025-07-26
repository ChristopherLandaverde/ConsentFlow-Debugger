// trigger-variable-detection.test.js - Tests for trigger and variable detection
class TriggerVariableDetectionTests {
  constructor(testRunner) {
    this.runner = testRunner;
  }

  async runAllTests() {
    const runner = this.runner;
    const { describe, it, expect, setupMockGTM, setupMockChrome, cleanup } = runner;

    runner.describe('Trigger & Variable Detection Tests', () => {
      
      runner.it('should detect triggers from dataLayer', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add various dataLayer events
        window.dataLayer.push(['config', 'G-TEST123']);
        window.dataLayer.push(['event', 'purchase', { value: 100 }]);
        window.dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }]);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        cleanup();
        
        return expect(result.triggers.length).toBeGreaterThan(0) &&
               expect(result.triggers.some(t => t.name === 'Page View')).toBeTruthy() &&
               expect(result.triggers.some(t => t.name === 'E-commerce')).toBeTruthy() &&
               expect(result.triggers.some(t => t.name === 'Consent Update')).toBeTruthy();
      });

      runner.it('should detect variables from dataLayer', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add dataLayer variables
        window.dataLayer.push({
          event: 'test_event',
          user_id: '12345',
          page_type: 'product',
          custom_data: { key: 'value' }
        });
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        cleanup();
        
        return expect(result.variables.length).toBeGreaterThan(0) &&
               expect(result.variables.some(v => v.name === 'user_id')).toBeTruthy() &&
               expect(result.variables.some(v => v.name === 'page_type')).toBeTruthy() &&
               expect(result.variables.some(v => v.name === 'custom_data')).toBeTruthy();
      });

      runner.it('should detect GTM configuration variables', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock gtag config
        window.gtag = function() {
          window.dataLayer.push(Array.from(arguments));
        };
        window.gtag('config', 'G-TEST123');
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        cleanup();
        
        return expect(result.variables.some(v => v.name === 'measurement_id')).toBeTruthy() &&
               expect(result.variables.some(v => v.value === 'G-TEST123')).toBeTruthy();
      });

      runner.it('should detect triggers from page source', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Create script with gtag calls
        const script = document.createElement('script');
        script.textContent = `
          gtag('event', 'page_view', { page_title: 'Test Page' });
          gtag('event', 'purchase', { transaction_id: '123' });
        `;
        document.head.appendChild(script);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        // Clean up
        script.remove();
        cleanup();
        
        return expect(result.triggers.some(t => t.event === 'page_view')).toBeTruthy() &&
               expect(result.triggers.some(t => t.event === 'purchase')).toBeTruthy();
      });

      runner.it('should detect element triggers', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Create element with GTM attributes
        const button = document.createElement('button');
        button.setAttribute('data-gtm-trigger', 'button_click');
        button.setAttribute('data-gtm-event', 'form_submit');
        button.onclick = function() { gtag('event', 'click'); };
        document.body.appendChild(button);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        // Clean up
        button.remove();
        cleanup();
        
        return expect(result.triggers.some(t => t.name === 'Element Interaction')).toBeTruthy() &&
               expect(result.triggers.some(t => t.handler === 'onclick')).toBeTruthy();
      });

      runner.it('should provide comprehensive tag analysis', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock various tags and triggers
        window.gtag = function() {};
        window.dataLayer.push(['config', 'G-TEST123']);
        window.dataLayer.push(['event', 'purchase', { value: 100 }]);
        window.dataLayer.push({ user_id: '12345', page_type: 'product' });
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.getComprehensiveTagAnalysis();
        
        cleanup();
        
        return expect(result.tags).toBeTruthy() &&
               expect(result.triggers).toBeTruthy() &&
               expect(result.variables).toBeTruthy() &&
               expect(result.summary).toBeTruthy() &&
               expect(result.summary.totalTags).toBeGreaterThan(0) &&
               expect(result.summary.totalTriggers).toBeGreaterThan(0) &&
               expect(result.summary.totalVariables).toBeGreaterThan(0);
      });

      runner.it('should map tags to triggers correctly', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Mock analytics tag with triggers
        window.gtag = function() {};
        window.dataLayer.push(['config', 'G-TEST123']);
        window.dataLayer.push(['event', 'page_view']);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.getComprehensiveTagAnalysis();
        
        cleanup();
        
        const analyticsTag = result.tags.find(tag => tag.name === 'Google Analytics 4');
        
        return expect(analyticsTag).toBeTruthy() &&
               expect(analyticsTag.triggers.length).toBeGreaterThan(0) &&
               expect(analyticsTag.triggerCount).toBeGreaterThan(0);
      });

      runner.it('should deduplicate triggers and variables', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add duplicate events
        window.dataLayer.push(['config', 'G-TEST123']);
        window.dataLayer.push(['config', 'G-TEST123']);
        window.dataLayer.push({ user_id: '12345' });
        window.dataLayer.push({ user_id: '12345' });
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        cleanup();
        
        // Check that duplicates are removed
        const configTriggers = result.triggers.filter(t => t.name === 'Page View');
        const userVariables = result.variables.filter(v => v.name === 'user_id');
        
        return expect(configTriggers.length).toBe(1) &&
               expect(userVariables.length).toBe(1);
      });

      runner.it('should handle missing dataLayer gracefully', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Don't add any dataLayer items
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        cleanup();
        
        return expect(result.triggers).toBeTruthy() &&
               expect(result.variables).toBeTruthy() &&
               expect(Array.isArray(result.triggers)).toBeTruthy() &&
               expect(Array.isArray(result.variables)).toBeTruthy();
      });

      runner.it('should detect consent-related triggers', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add consent events
        window.dataLayer.push(['consent', 'default', { analytics_storage: 'denied' }]);
        window.dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }]);
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        cleanup();
        
        const consentTriggers = result.triggers.filter(t => t.name === 'Consent Update');
        
        return expect(consentTriggers.length).toBeGreaterThan(0) &&
               expect(consentTriggers.every(t => t.consentType === 'security_storage')).toBeTruthy();
      });

      runner.it('should categorize triggers by consent type', async () => {
        setupMockGTM();
        setupMockChrome();
        
        // Add various events with different consent requirements
        window.dataLayer.push(['config', 'G-TEST123']); // analytics
        window.dataLayer.push(['event', 'purchase', { value: 100 }]); // analytics
        window.dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }]); // security
        
        await this.injectTestScript();
        await this.runner.waitForCondition(() => window.ConsentInspector);
        
        const result = window.ConsentInspector.detectTriggersAndVariables();
        
        cleanup();
        
        const analyticsTriggers = result.triggers.filter(t => t.consentType === 'analytics_storage');
        const securityTriggers = result.triggers.filter(t => t.consentType === 'security_storage');
        
        return expect(analyticsTriggers.length).toBeGreaterThan(0) &&
               expect(securityTriggers.length).toBeGreaterThan(0);
      });
    });
  }

  async injectTestScript() {
    return new Promise((resolve) => {
      if (!window.ConsentInspector) {
        // Mock trigger and variable detection methods
        const detectTriggersAndVariables = () => {
          let triggers = [];
          let variables = [];
          const tagTriggerMap = [];
          const consentDependencies = [];

          // Analyze dataLayer
          if (window.dataLayer && Array.isArray(window.dataLayer)) {
            window.dataLayer.forEach((item, index) => {
              // Extract variables
              if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
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

              // Detect triggers
              if (Array.isArray(item)) {
                if (item[0] === 'config') {
                  triggers.push({
                    name: 'Page View',
                    event: item[1],
                    timestamp: Date.now(),
                    dataLayerIndex: index,
                    consentType: 'analytics_storage',
                    data: item
                  });
                  variables.push({
                    name: 'measurement_id',
                    value: item[1],
                    type: 'config',
                    source: 'gtag_config'
                  });
                } else if (item[0] === 'event') {
                  const eventName = item[1];
                  let triggerName = 'Custom Event';
                  let consentType = 'analytics_storage';

                  if (['purchase', 'add_to_cart', 'view_item'].includes(eventName)) {
                    triggerName = 'E-commerce';
                  }

                  triggers.push({
                    name: triggerName,
                    event: eventName,
                    timestamp: Date.now(),
                    dataLayerIndex: index,
                    consentType: consentType,
                    data: item
                  });
                } else if (item[0] === 'consent') {
                  triggers.push({
                    name: 'Consent Update',
                    event: item[1],
                    timestamp: Date.now(),
                    dataLayerIndex: index,
                    consentType: 'security_storage',
                    data: item
                  });
                }
              }
            });
          }

          // Deduplicate triggers and variables
          const deduplicateTriggers = (triggers) => {
            const seen = new Set();
            return triggers.filter(trigger => {
              const key = `${trigger.name}-${trigger.event}-${trigger.type || 'unknown'}`;
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
          };

          const deduplicateVariables = (variables) => {
            const seen = new Set();
            return variables.filter(variable => {
              const key = `${variable.name}-${variable.value}-${variable.type}`;
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
          };

          // Apply deduplication
          triggers = deduplicateTriggers(triggers);
          variables = deduplicateVariables(variables);

          // Analyze page source for gtag calls
          const scripts = document.querySelectorAll('script');
          scripts.forEach(script => {
            if (script.textContent) {
              const gtagCalls = script.textContent.match(/gtag\([^)]+\)/g);
              if (gtagCalls) {
                gtagCalls.forEach(call => {
                  const match = call.match(/gtag\(([^)]+)\)/);
                  if (match) {
                    const args = match[1].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
                    if (args[0] === 'event') {
                      triggers.push({
                        name: 'Custom Event',
                        event: args[1],
                        type: 'gtag_event',
                        source: 'script_content'
                      });
                    }
                  }
                });
              }
            }
          });

          // Analyze DOM elements
          const triggerElements = document.querySelectorAll('[data-gtm-trigger], [data-gtm-event], [onclick*="gtag"]');
          triggerElements.forEach(element => {
            const trigger = {
              name: 'Element Interaction',
              element: element.tagName.toLowerCase(),
              type: 'dom_element',
              source: 'page_element'
            };

            if (element.dataset.gtmTrigger) {
              trigger.name = element.dataset.gtmTrigger;
            }
            if (element.dataset.gtmEvent) {
              trigger.event = element.dataset.gtmEvent;
            }
            if (element.onclick || element.getAttribute('onclick')) {
              trigger.handler = 'onclick';
              trigger.consentType = 'analytics_storage';
            }

            triggers.push(trigger);
          });

          return {
            triggers: triggers,
            variables: variables,
            tagTriggerMap: tagTriggerMap,
            consentDependencies: consentDependencies,
            timestamp: Date.now()
          };
        };

        const getComprehensiveTagAnalysis = () => {
          const basicTags = [
            {
              id: 'tag_1',
              name: 'Google Analytics 4',
              type: 'analytics',
              allowed: true,
              reason: 'analytics_storage granted',
              consentType: 'analytics_storage',
              overridden: false
            }
          ];

          const triggersAndVars = detectTriggersAndVariables();
          const consentState = {
            analytics_storage: 'granted',
            ad_storage: 'denied',
            functionality_storage: 'granted',
            personalization_storage: 'denied',
            security_storage: 'granted'
          };

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
        };

        window.ConsentInspector = {
          detectTriggersAndVariables,
          getComprehensiveTagAnalysis
        };
      }
      
      setTimeout(resolve, 10);
    });
  }
} 