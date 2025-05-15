// qa-panel.js - QA testing panel

// Initialize QA panel
export function initializeQAPanel(contentScriptInterface) {
  // Add event listener to run consent test button
  document.getElementById('runConsentTest').addEventListener('click', function() {
    runConsentTest(contentScriptInterface);
  });
  
  // Add event listener to run tag test button
  document.getElementById('runTagTest').addEventListener('click', function() {
    runTagTest(contentScriptInterface);
  });
}

// Run consent test
export function runConsentTest(contentScriptInterface) {
  contentScriptInterface.executeInPage(runConsentTestFunc, [], function(results) {
    if (results) {
      updateQAResults(results);
    }
  });
}

// Run tag test
export function runTagTest(contentScriptInterface) {
  contentScriptInterface.executeInPage(runTagTestFunc, [], function(results) {
    if (results) {
      updateQAResults(results);
    }
  });
}

// Update QA results
function updateQAResults(results) {
  const qaResultsElement = document.getElementById('qaResults');
  
  // Clear current results
  qaResultsElement.innerHTML = '';
  
  // Add test results
  results.forEach(result => {
    const resultElement = document.createElement('div');
    resultElement.className = 'tag-item';
    
    resultElement.innerHTML = `
      <div><strong>${result.name}</strong></div>
      <div class="qa-result ${result.passed ? 'qa-pass' : 'qa-fail'}">
        ${result.passed ? '✓ Pass' : '✗ Fail'}: ${result.message}
      </div>
    `;
    
    qaResultsElement.appendChild(resultElement);
  });
}

// Content script function - Run consent test
function runConsentTestFunc() {
  const results = [];
  
  // Get current consent state
  const consentState = getCurrentConsentState();
  
  // Test 1: Check if consent mode is properly initialized
  results.push({
    name: 'Consent Mode Initialization',
    passed: window.gtag !== undefined,
    message: window.gtag !== undefined ? 
      'Consent Mode is properly initialized' : 
      'Consent Mode is not initialized'
  });
  
  // Test 2: Check if default consent state matches expectations
  const hasDefaultConsent = Object.keys(consentState).length > 0;
  results.push({
    name: 'Default Consent State',
    passed: hasDefaultConsent,
    message: hasDefaultConsent ? 
      `Default consent state defined: ${JSON.stringify(consentState)}` : 
      'No default consent state defined'
  });
  
  // Test 3: Check consent state response to updates
  // First save the original state
  const originalState = {...consentState};
  
  // Try to update a consent setting
  const testSetting = {
    analytics_storage: consentState.analytics_storage === 'granted' ? 'denied' : 'granted'
  };
  
  try {
    window.gtag('consent', 'update', testSetting);
    
    // Check if the update was applied
    const newState = getCurrentConsentState();
    const updateWorked = newState.analytics_storage === testSetting.analytics_storage;
    
    results.push({
      name: 'Consent Update Response',
      passed: updateWorked,
      message: updateWorked ? 
        'Consent state successfully updates in response to gtag calls' : 
        'Consent state does not update properly'
    });
    
    // Restore original state
    window.gtag('consent', 'update', originalState);
  } catch (e) {
    results.push({
      name: 'Consent Update Response',
      passed: false,
      message: `Error updating consent: ${e.message}`
    });
  }
  
  return results;
}

// Content script function - Run tag test
function runTagTestFunc() {
  const results = [];
  
  // Get current tags and consent state
  const tags = getTagStatus();
  const consentState = getCurrentConsentState();
  
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
  const analyticsTags = tags.filter(tag => 
    tag.type === 'Universal Analytics' || 
    tag.type === 'Google Analytics 4' || 
    tag.type.toLowerCase().includes('analytics')
  );
  
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
    const updatedTags = getTagStatus();
    const updatedAnalyticsTags = updatedTags.filter(tag => 
      tag.type === 'Universal Analytics' || 
      tag.type === 'Google Analytics 4' || 
      tag.type.toLowerCase().includes('analytics')
    );
    
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
  // First identify advertising tags
  const adTags = tags.filter(tag => 
    tag.type === 'Google Ads Conversion Tracking' || 
    tag.type.toLowerCase().includes('ads') || 
    tag.type.toLowerCase().includes('floodlight') ||
    tag.type.toLowerCase().includes('conversion')
  );
  
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
    const updatedTags = getTagStatus();
    const updatedAdTags = updatedTags.filter(tag => 
      tag.type === 'Google Ads Conversion Tracking' || 
      tag.type.toLowerCase().includes('ads') || 
      tag.type.toLowerCase().includes('floodlight') ||
      tag.type.toLowerCase().includes('conversion')
    );
    
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