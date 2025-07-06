// popup/popup.js - Diagnostic version with detailed error reporting
console.log('🔍 GTM Inspector Popup: Loading diagnostic version...');

// Enhanced Content script interface with diagnostics
const ContentScriptInterface = {
  sendMessage: async function(action, data = {}) {
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        if (!tabs[0]) {
          console.error('❌ No active tab found');
          resolve({ error: 'No active tab' });
          return;
        }
        
        const tabId = tabs[0].id;
        console.log(`📤 Sending message: ${action} to tab ${tabId}`);
        
        // First try direct communication
        chrome.tabs.sendMessage(tabId, { action, data }, async (response) => {
          if (chrome.runtime.lastError) {
            console.warn('⚠️ Direct message failed:', chrome.runtime.lastError.message);
            
            // Try to ensure content script is injected
            console.log('🔧 Attempting to inject content script...');
            
            try {
              const injectResult = await this.ensureContentScript(tabId);
              console.log('🔧 Injection result:', injectResult);
              
              if (injectResult.success) {
                console.log('✅ Content script injection successful, retrying message...');
                
                // Retry the original message
                chrome.tabs.sendMessage(tabId, { action, data }, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    console.error('❌ Retry message also failed:', chrome.runtime.lastError.message);
                    resolve({ error: 'Content script communication failed after injection' });
                  } else {
                    console.log(`📥 Retry message response for ${action}:`, retryResponse);
                    resolve(retryResponse || { error: 'No response' });
                  }
                });
              } else {
                console.error('❌ Content script injection failed:', injectResult);
                resolve({ error: 'Content script injection failed: ' + (injectResult.error || 'Unknown error') });
              }
            } catch (error) {
              console.error('❌ Error during content script injection:', error);
              resolve({ error: 'Injection error: ' + error.message });
            }
          } else {
            console.log(`📥 Message response for ${action}:`, response);
            resolve(response || { error: 'No response' });
          }
        });
      });
    });
  },
  
  ensureContentScript: function(tabId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'ensureContentScript',
        tabId: tabId
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Background message failed:', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response from background' });
        }
      });
    });
  },
  
  diagnoseTab: function() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'diagnoseTab'
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Diagnosis message failed:', chrome.runtime.lastError.message);
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { error: 'No response from background' });
        }
      });
    });
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initializing diagnostic popup...');
  
  initializeTabs();
  initializeBasicFunctionality();
  initializeDiagnosticButtons();
  
  // Run diagnostics first
  runDiagnostics().then(() => {
    setTimeout(checkGTMStatus, 1000);
  });
});

function initializeDiagnosticButtons() {
  const refreshBtn = document.getElementById('refreshTags');
  if (refreshBtn && refreshBtn.parentNode) {
    
    // Diagnose button
    const diagnoseBtn = document.createElement('button');
    diagnoseBtn.id = 'diagnoseTab';
    diagnoseBtn.className = 'action-button';
    diagnoseBtn.textContent = '🔍 Diagnose';
    diagnoseBtn.addEventListener('click', runDiagnostics);
    
    // Force inject button
    const forceBtn = document.createElement('button');
    forceBtn.id = 'forceInject';
    forceBtn.className = 'action-button';
    forceBtn.textContent = '🔧 Force Inject';
    forceBtn.addEventListener('click', async function() {
      console.log('🔧 Force inject button clicked');
      this.disabled = true;
      this.textContent = '🔧 Injecting...';
      
      try {
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
          if (tabs[0]) {
            const result = await ContentScriptInterface.ensureContentScript(tabs[0].id);
            console.log('🧪 Force inject result:', result);
            
            if (result.success) {
              this.textContent = '✅ Injected!';
              setTimeout(() => checkGTMStatus(), 500);
            } else {
              this.textContent = '❌ Failed';
              console.error('❌ Force inject failed:', result);
              
              // Show detailed error in popup
              showError('Injection failed: ' + (result.error || 'Unknown error'));
            }
          }
        });
      } catch (error) {
        console.error('❌ Force inject error:', error);
        this.textContent = '❌ Error';
        showError('Force inject error: ' + error.message);
      } finally {
        setTimeout(() => {
          this.disabled = false;
          this.textContent = '🔧 Force Inject';
        }, 3000);
      }
    });
    
    refreshBtn.parentNode.insertBefore(diagnoseBtn, refreshBtn.nextSibling);
    refreshBtn.parentNode.insertBefore(forceBtn, diagnoseBtn.nextSibling);
  }
}

async function runDiagnostics() {
  console.log('🔍 Running tab diagnostics...');
  
  try {
    const diagnosis = await ContentScriptInterface.diagnoseTab();
    console.log('📊 Diagnostic result:', diagnosis);
    
    if (diagnosis.error) {
      showError('Diagnosis failed: ' + diagnosis.error);
      return;
    }
    
    // Display diagnostic info
    const diagnosticInfo = `
      Tab ID: ${diagnosis.tab.id}
      URL: ${diagnosis.tab.url}
      Status: ${diagnosis.tab.status}
      Can Inject: ${diagnosis.canInject ? 'Yes' : 'No'}
    `;
    
    console.log('📋 Diagnostic info:', diagnosticInfo);
    
    if (!diagnosis.canInject) {
      showError('Cannot inject content script into this type of page: ' + diagnosis.tab.url);
    }
    
    return diagnosis;
    
  } catch (error) {
    console.error('❌ Diagnostics error:', error);
    showError('Diagnostics error: ' + error.message);
  }
}

function showError(message) {
  console.error('🚨 Showing error:', message);
  
  // Create error display element if it doesn't exist
  let errorDisplay = document.getElementById('errorDisplay');
  if (!errorDisplay) {
    errorDisplay = document.createElement('div');
    errorDisplay.id = 'errorDisplay';
    errorDisplay.style.cssText = `
      background: #fee2e2;
      color: #991b1b;
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
      border: 1px solid #fecaca;
      font-size: 12px;
      word-break: break-word;
    `;
    
    const container = document.querySelector('.status-container');
    if (container) {
      container.appendChild(errorDisplay);
    }
  }
  
  errorDisplay.textContent = message;
  
  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (errorDisplay.parentNode) {
      errorDisplay.parentNode.removeChild(errorDisplay);
    }
  }, 10000);
}

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      this.classList.add('active');
      const targetContent = document.getElementById(`${tabName}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

function initializeBasicFunctionality() {
  // Apply consent button
  const applyBtn = document.getElementById('applyConsent');
  if (applyBtn) {
    applyBtn.addEventListener('click', async function() {
      console.log('🔧 Apply consent clicked');
      this.disabled = true;
      this.textContent = '⚡ Applying...';
      
      try {
        const settings = {
          analytics_storage: document.getElementById('analytics_storage')?.value || 'granted',
          ad_storage: document.getElementById('ad_storage')?.value || 'granted',
          functionality_storage: document.getElementById('functionality_storage')?.value || 'granted',
          personalization_storage: document.getElementById('personalization_storage')?.value || 'granted',
          security_storage: document.getElementById('security_storage')?.value || 'granted'
        };
        
        const result = await ContentScriptInterface.sendMessage('applyConsent', settings);
        
        if (result && result.success) {
          this.textContent = '✅ Applied!';
        } else {
          this.textContent = '❌ Failed';
          showError('Consent application failed: ' + (result.error || 'Unknown error'));
        }
        
        setTimeout(() => {
          this.textContent = '⚡ Apply Settings';
        }, 2000);
        
      } catch (error) {
        console.error('❌ Apply consent error:', error);
        this.textContent = '❌ Error';
        showError('Apply consent error: ' + error.message);
        setTimeout(() => {
          this.textContent = '⚡ Apply Settings';
        }, 2000);
      } finally {
        this.disabled = false;
      }
    });
  }
  
  // Refresh tags button
  const refreshBtn = document.getElementById('refreshTags');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function() {
      console.log('🔄 Refresh tags clicked');
      this.disabled = true;
      this.textContent = '🔄 Refreshing...';
      
      try {
        await refreshTags();
      } finally {
        this.disabled = false;
        this.textContent = '🔄 Refresh Tags';
      }
    });
  }
}

async function checkGTMStatus() {
  console.log('🔍 Checking GTM status...');
  
  try {
    const result = await ContentScriptInterface.sendMessage('checkGTM');
    console.log('📊 GTM check result:', result);
    
    updateStatusDisplay(result);
    await refreshTags();
    
  } catch (error) {
    console.error('❌ Error checking GTM:', error);
    updateStatusDisplay({ hasGTM: false, error: error.message });
  }
}

function updateStatusDisplay(result) {
  const gtmStatus = document.getElementById('gtmStatus');
  const consentModeStatus = document.getElementById('consentModeStatus');
  
  if (!gtmStatus || !consentModeStatus) {
    console.warn('⚠️ Status elements not found');
    return;
  }
  
  if (result && result.hasGTM) {
    gtmStatus.textContent = `✅ GTM Found: ${result.gtmId}`;
    gtmStatus.className = 'status found';
    
    if (result.hasConsentMode) {
      const analytics = result.consentState?.analytics_storage || 'unknown';
      const ads = result.consentState?.ad_storage || 'unknown';
      consentModeStatus.textContent = `🔒 Analytics: ${analytics}, Ads: ${ads}`;
      consentModeStatus.className = 'status found';
    } else {
      consentModeStatus.textContent = '⚠️ Consent Mode Not Found';
      consentModeStatus.className = 'status not-found';
    }
  } else {
    gtmStatus.textContent = result?.error ? 
      `❌ Error: ${result.error}` : '❌ GTM Not Detected';
    gtmStatus.className = 'status not-found';
    
    consentModeStatus.textContent = '❌ Not Applicable';
    consentModeStatus.className = 'status not-found';
  }
}

async function refreshTags() {
  console.log('🏷️ Refreshing tags...');
  
  try {
    const tags = await ContentScriptInterface.sendMessage('getTagStatus');
    console.log('📊 Tags received:', tags);
    updateTagList(tags);
  } catch (error) {
    console.error('❌ Error refreshing tags:', error);
    updateTagList([]);
  }
}

function updateTagList(tags) {
  const tagList = document.getElementById('tagList');
  if (!tagList) {
    console.warn('⚠️ Tag list element not found');
    return;
  }
  
  if (!Array.isArray(tags)) {
    console.warn('⚠️ Tags is not an array:', tags);
    tags = [];
  }
  
  if (tags.length === 0) {
    tagList.innerHTML = '<div class="tag-item empty-state">No tags detected</div>';
    return;
  }
  
  tagList.innerHTML = tags.map(tag => `
    <div class="tag-item ${tag.type || 'other'}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong>${escapeHtml(tag.name || 'Unknown Tag')}</strong>
        <span style="color: ${tag.allowed ? '#28a745' : '#dc3545'}; font-weight: 600;">
          ${tag.allowed ? '✅ Allowed' : '❌ Blocked'}
        </span>
      </div>
      <div style="font-size: 12px; color: #666;">
        Type: ${escapeHtml(tag.type || 'Unknown')}
      </div>
      <div style="font-size: 11px; color: #888; margin-top: 2px;">
        ${escapeHtml(tag.reason || 'No reason provided')}
      </div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

console.log('✅ Diagnostic popup script loaded');