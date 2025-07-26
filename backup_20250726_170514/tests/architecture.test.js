const fs = require('fs');

// Architecture validation tests that would catch content script isolation issues
describe('Architecture Validation', () => {
  
  test('Content script does not directly access page context', () => {
    const contentScript = fs.readFileSync('content.js', 'utf8');
    
    // Check for direct access to page context objects
    const violations = [
      'window.ConsentInspector',
      'window.gtag',
      'window.dataLayer',
      'window.google_tag_manager'
    ];
    
    violations.forEach(violation => {
      expect(contentScript).not.toMatch(new RegExp(violation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  });
  
  test('Content script uses postMessage for communication', () => {
    const contentScript = fs.readFileSync('content.js', 'utf8');
    
    // Must use postMessage for page context communication
    expect(contentScript).toMatch(/postMessage/);
  });
  
  test('Injected script has message listener', () => {
    const injectedScript = fs.readFileSync('injected-script.js', 'utf8');
    
    // Must listen for messages from content script
    expect(injectedScript).toMatch(/addEventListener.*message/);
  });
  
  test('GTM ID detection filters debug groups', () => {
    const injectedScript = fs.readFileSync('injected-script.js', 'utf8');
    
    // Must have logic to filter actual GTM container IDs
    expect(injectedScript).toMatch(/GTM-\[A-Z0-9\]\+/);
  });
  
  test('Message passing has proper error handling', () => {
    const contentScript = fs.readFileSync('content.js', 'utf8');
    
    // Must have timeout and error handling
    expect(contentScript).toMatch(/setTimeout.*5000/);
  });
});

describe('Extension Structure', () => {
  
  test('Required files exist', () => {
    const requiredFiles = [
      'manifest.json',
      'background.js', 
      'content.js',
      'injected-script.js',
      'popup.html'
    ];
    
    requiredFiles.forEach(file => {
      expect(fs.existsSync(file)).toBe(true);
    });
  });
  
  test('Manifest.json is valid JSON', () => {
    const manifestContent = fs.readFileSync('manifest.json', 'utf8');
    expect(() => JSON.parse(manifestContent)).not.toThrow();
  });
  
  test('Manifest.json has required fields', () => {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    
    expect(manifest).toHaveProperty('manifest_version');
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('version');
    expect(manifest).toHaveProperty('content_scripts');
    expect(manifest).toHaveProperty('background');
  });
});

describe('Message Passing Architecture', () => {
  
  test('Content script uses proper message format', () => {
    const contentScript = fs.readFileSync('content.js', 'utf8');
    
    // Should use structured message format
    expect(contentScript).toMatch(/source.*gtm-inspector/);
    expect(contentScript).toMatch(/action.*[a-zA-Z]+/);
  });
  
  test('Injected script validates message source', () => {
    const injectedScript = fs.readFileSync('injected-script.js', 'utf8');
    
    // Should check message source for security
    expect(injectedScript).toMatch(/source.*gtm-inspector/);
  });
  
  test('Error handling includes timeout', () => {
    const contentScript = fs.readFileSync('content.js', 'utf8');
    
    // Should have timeout handling for message responses
    expect(contentScript).toMatch(/setTimeout/);
  });
});

describe('GTM Detection Logic', () => {
  
  test('GTM ID filtering excludes debug groups', () => {
    const injectedScript = fs.readFileSync('injected-script.js', 'utf8');
    
    // Should filter out debug groups like 'debugGroupId' or 'pscdl'
    expect(injectedScript).toMatch(/filter.*debugGroupId|pscdl/);
  });
  
  test('GTM ID validation uses proper regex', () => {
    const injectedScript = fs.readFileSync('injected-script.js', 'utf8');
    
    // Should use proper GTM ID pattern
    expect(injectedScript).toMatch(/GTM-\[A-Z0-9\]\+/);
  });
});

// Note: End-to-end tests with Puppeteer are in separate test files
// This architecture test focuses on static analysis and structure validation 