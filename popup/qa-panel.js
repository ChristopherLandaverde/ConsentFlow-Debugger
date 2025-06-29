// qa-panel.js - Fixed IIFE pattern
const QAPanel = (function() {
  let contentScriptInterface = null;

  function initialize(contentInterface) {
    console.log('🧪 Initializing QAPanel...');
    contentScriptInterface = contentInterface;
    
    initializeConsentTestButton();
    initializeTagTestButton();
  }

  function initializeConsentTestButton() {
    const consentTestBtn = document.getElementById('runConsentTest');
    if (!consentTestBtn) return;
    
    consentTestBtn.addEventListener('click', async function() {
      console.log('🧪 Running consent test...');
      this.disabled = true;
      this.textContent = '🧪 Testing...';
      
      try {
        await runConsentTest();
      } finally {
        this.disabled = false;
        this.textContent = '🧪 Test Consent Flow';
      }
    });
  }

  function initializeTagTestButton() {
    const tagTestBtn = document.getElementById('runTagTest');
    if (!tagTestBtn) return;
    
    tagTestBtn.addEventListener('click', async function() {
      console.log('🔍 Running tag test...');
      this.disabled = true;
      this.textContent = '🔍 Testing...';
      
      try {
        await runTagTest();
      } finally {
        this.disabled = false;
        this.textContent = '🔍 Test Tag Firing';
      }
    });
  }

  async function runConsentTest() {
    try {
      const result = await contentScriptInterface.sendMessage('checkGTM');
      
      const results = [];
      
      // Test 1: Check if consent mode is available
      results.push({
        name: 'Consent Mode Detection',
        passed: result.hasConsentMode,
        message: result.hasConsentMode ? 
          'Consent Mode is detected and active' : 
          'Consent Mode is not detected on this page'
      });
      
      // Test 2: Check consent state validity
      if (result.consentState) {
        const requiredKeys = ['analytics_storage', 'ad_storage'];
        const hasRequiredKeys = requiredKeys.every(key => 
          result.consentState.hasOwnProperty(key)
        );
        
        results.push({
          name: 'Consent State Structure',
          passed: hasRequiredKeys,
          message: hasRequiredKeys ? 
            'All required consent categories are defined' : 
            'Missing required consent categories'
        });
      }
      
      // Test 3: Check tag response to consent
      if (result.tags && result.tags.length > 0) {
        const hasBlockedTags = result.tags.some(tag => !tag.allowed);
        results.push({
          name: 'Tag Consent Enforcement',
          passed: hasBlockedTags,
          message: hasBlockedTags ? 
            'Some tags are properly blocked based on consent' : 
            'All tags are firing - consent may not be enforced'
        });
      }
      
      updateQAResults(results);
    } catch (error) {
      console.error('❌ Consent test failed:', error);
      updateQAResults([{
        name: 'Consent Test',
        passed: false,
        message: `Test failed: ${error.message}`
      }]);
    }
  }

  async function runTagTest() {
    try {
      const result = await contentScriptInterface.sendMessage('getTagStatus');
      
      const results = [];
      
      if (!result || result.length === 0) {
        results.push({
          name: 'Tag Detection',
          passed: false,
          message: 'No tags detected on this page'
        });
      } else {
        results.push({
          name: 'Tag Detection',
          passed: true,
          message: `Found ${result.length} tags on this page`
        });
        
        // Check for analytics tags
        const analyticsTags = result.filter(tag => 
          tag.type === 'analytics' || 
          tag.name.toLowerCase().includes('analytics')
        );
        
        if (analyticsTags.length > 0) {
          results.push({
            name: 'Analytics Tags',
            passed: true,
            message: `Found ${analyticsTags.length} analytics tag(s)`
          });
        }
        
        // Check for advertising tags
        const adTags = result.filter(tag => 
          tag.type === 'advertising' || 
          tag.name.toLowerCase().includes('ads')
        );
        
        if (adTags.length > 0) {
          results.push({
            name: 'Advertising Tags',
            passed: true,
            message: `Found ${adTags.length} advertising tag(s)`
          });
        }
      }
      
      updateQAResults(results);
    } catch (error) {
      console.error('❌ Tag test failed:', error);
      updateQAResults([{
        name: 'Tag Test',
        passed: false,
        message: `Test failed: ${error.message}`
      }]);
    }
  }

  function updateQAResults(results) {
    const qaResultsElement = document.getElementById('qaResults');
    if (!qaResultsElement) return;
    
    qaResultsElement.innerHTML = '';
    
    if (results.length === 0) {
      qaResultsElement.innerHTML = '<div class="empty-state">No test results</div>';
      return;
    }
    
    results.forEach(result => {
      const resultElement = document.createElement('div');
      resultElement.className = `qa-result ${result.passed ? 'qa-pass' : 'qa-fail'}`;
      
      resultElement.innerHTML = `
        <div><strong>${escapeHtml(result.name)}</strong></div>
        <div>${result.passed ? '✅ Pass' : '❌ Fail'}: ${escapeHtml(result.message)}</div>
      `;
      
      qaResultsElement.appendChild(resultElement);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public API
  return {
    initialize,
    runConsentTest,
    runTagTest
  };
})();

// Make available globally
window.QAPanel = QAPanel;