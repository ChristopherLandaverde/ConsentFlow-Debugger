// Architecture validation tests that would catch content script isolation issues
describe('Architecture Validation', () => {
  
  test('Content script does not directly access page context', () => {
    const contentScript = fs.readFileSync('content.js', 'utf8');
    
    // Check for direct access to page context objects
    const violations = [
      'window.ConsentInspector',
      'window.google_tag_manager',
      'window.dataLayer',
      'window.gtag'
    ].filter(pattern => contentScript.includes(pattern));
    
    if (violations.length > 0) {
      throw new Error(`Content script isolation violation: ${violations.join(', ')}`);
    }
  });
  
  test('Content script uses postMessage for communication', () => {
    const contentScript = fs.readFileSync('content.js', 'utf8');
    
    // Must use postMessage for page context communication
    expect(contentScript).toMatch(/postMessage/);
    expect(contentScript).toMatch(/addEventListener.*message/);
  });
  
  test('Injected script has message listener', () => {
    const injectedScript = fs.readFileSync('injected-script.js', 'utf8');
    
    // Must listen for messages from content script
    expect(injectedScript).toMatch(/addEventListener.*message/);
    expect(injectedScript).toMatch(/source.*gtm-inspector-content/);
  });
  
  test('GTM ID detection filters debug groups', () => {
    const injectedScript = fs.readFileSync('injected-script.js', 'utf8');
    
    // Must have logic to filter actual GTM container IDs
    expect(injectedScript).toMatch(/GTM-\[A-Z0-9\]\+/);
    expect(injectedScript).toMatch(/filter.*GTM/);
  });
  
  test('Message passing has proper error handling', () => {
    const contentScript = fs.readFileSync('content.js', 'utf8');
    
    // Must have timeout and error handling
    expect(contentScript).toMatch(/setTimeout.*5000/);
    expect(contentScript).toMatch(/reject.*Error/);
  });
});

// Integration test that would have caught the actual issue
describe('End-to-End Communication', () => {
  let browser;
  let page;
  
  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true });
  });
  
  afterAll(async () => {
    await browser.close();
  });
  
  beforeEach(async () => {
    page = await browser.newPage();
  });
  
  afterEach(async () => {
    await page.close();
  });
  
  test('Content script can communicate with page context', async () => {
    // Load the extension
    await page.goto('chrome://extensions/');
    await page.evaluate(() => {
      // Simulate loading the extension
      chrome.runtime.sendMessage = jest.fn();
    });
    
    // Navigate to a test page
    await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
    
    // Check if content script loaded
    const contentScriptLoaded = await page.evaluate(() => {
      return window.gtmInspectorContentLoaded === true;
    });
    
    expect(contentScriptLoaded).toBe(true);
    
    // Check if injected script loaded
    const injectedScriptLoaded = await page.evaluate(() => {
      return typeof window.ConsentInspector !== 'undefined';
    });
    
    expect(injectedScriptLoaded).toBe(true);
    
    // Test communication
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Simulate popup request
        window.postMessage({
          source: 'gtm-inspector-content',
          action: 'detectGTM',
          id: 'test-123'
        }, '*');
        
        const listener = (event) => {
          if (event.data.source === 'gtm-inspector-page' && event.data.id === 'test-123') {
            window.removeEventListener('message', listener);
            resolve(event.data.result);
          }
        };
        window.addEventListener('message', listener);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          window.removeEventListener('message', listener);
          resolve({ error: 'Timeout' });
        }, 5000);
      });
    });
    
    expect(result.error).toBeUndefined();
    expect(result.hasGTM).toBeDefined();
  });
}); 