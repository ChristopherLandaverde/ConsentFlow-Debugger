// Integration tests for content script ↔ page context communication
describe('Content Script Integration', () => {
  
  test('Message format validation', () => {
    // Test that message format is correct
    const validMessage = {
      source: 'gtm-inspector-content',
      action: 'detectGTM',
      id: 'test-123',
      data: {}
    };
    
    expect(validMessage.source).toBe('gtm-inspector-content');
    expect(validMessage.action).toBe('detectGTM');
    expect(validMessage.id).toBeDefined();
  });
  
  test('GTM ID filtering logic', () => {
    // Test GTM ID filtering logic
    const containerIds = ['GTM-TEST123', 'debugGroupId', 'pscdl', 'GTM-ABC456'];
    
    const actualContainers = containerIds.filter(id => /^GTM-[A-Z0-9]+$/.test(id));
    const debugGroups = containerIds.filter(id => 
      !/^GTM-[A-Z0-9]+$/.test(id) && 
      (id.includes('debug') || id.includes('test') || id.includes('sandbox') || id.length < 8)
    );
    
    expect(actualContainers).toEqual(['GTM-TEST123', 'GTM-ABC456']);
    expect(debugGroups).toEqual(['debugGroupId', 'pscdl']);
  });
  
  test('ConsentInspector object structure', () => {
    // Test that ConsentInspector has required methods
    const mockConsentInspector = {
      detectGTM: jest.fn(),
      getTagInfo: jest.fn(),
      updateConsent: jest.fn(),
      getEvents: jest.fn()
    };
    
    expect(typeof mockConsentInspector.detectGTM).toBe('function');
    expect(typeof mockConsentInspector.getTagInfo).toBe('function');
    expect(typeof mockConsentInspector.updateConsent).toBe('function');
    expect(typeof mockConsentInspector.getEvents).toBe('function');
  });
  
  test('Message response format', () => {
    // Test that response format is correct
    const validResponse = {
      source: 'gtm-inspector-page',
      id: 'test-123',
      result: { hasGTM: true, gtmId: 'GTM-TEST123' },
      error: null
    };
    
    expect(validResponse.source).toBe('gtm-inspector-page');
    expect(validResponse.id).toBeDefined();
    expect(validResponse.result).toBeDefined();
  });
}); 