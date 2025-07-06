// Integration tests for content script ↔ page context communication
describe('Content Script Integration', () => {
  let testPage;
  
  beforeEach(async () => {
    // Create a test page with GTM simulation
    testPage = await createTestPage(`
      <!DOCTYPE html>
      <html>
        <head>
          <script>
            // Simulate GTM
            window.google_tag_manager = {
              'GTM-TEST123': {},
              'debugGroupId': {}
            };
            window.dataLayer = [];
            window.gtag = function() {};
          </script>
        </head>
        <body>
          <h1>Test Page</h1>
        </body>
      </html>
    `);
  });
  
  afterEach(async () => {
    if (testPage) {
      await testPage.close();
    }
  });
  
  test('Content script can communicate with page context', async () => {
    // Test that postMessage communication works
    const result = await testPage.evaluate(() => {
      return new Promise((resolve) => {
        // Simulate content script message
        window.postMessage({
          source: 'gtm-inspector-content',
          action: 'detectGTM',
          id: 'test-123'
        }, '*');
        
        // Listen for response
        const listener = (event) => {
          if (event.data.source === 'gtm-inspector-page' && event.data.id === 'test-123') {
            window.removeEventListener('message', listener);
            resolve(event.data.result);
          }
        };
        window.addEventListener('message', listener);
      });
    });
    
    expect(result.hasGTM).toBe(true);
    expect(result.gtmId).toBe('GTM-TEST123'); // Should prioritize actual GTM ID
  });
  
  test('GTM ID detection prioritizes actual container IDs', async () => {
    const result = await testPage.evaluate(() => {
      // Test GTM ID filtering logic
      const containerIds = Object.keys(window.google_tag_manager);
      const actualContainers = containerIds.filter(id => /^GTM-[A-Z0-9]+$/.test(id));
      return {
        allIds: containerIds,
        actualContainers: actualContainers,
        selectedId: actualContainers.length > 0 ? actualContainers[0] : containerIds[0]
      };
    });
    
    expect(result.allIds).toContain('GTM-TEST123');
    expect(result.allIds).toContain('debugGroupId');
    expect(result.actualContainers).toEqual(['GTM-TEST123']);
    expect(result.selectedId).toBe('GTM-TEST123');
  });
}); 