// popup/popup.js - WORKING VERSION
console.log('🔍 GTM Inspector Popup: Loading...');

// Content script interface
const ContentScriptInterface = {
  sendMessage: async function(action, data = {}) {
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0]) {
          resolve({ error: 'No active tab' });
          return;
        }
        
        chrome.tabs.sendMessage(tabs[0].id, {
          action: action,
          data: data
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.warn('Message failed:', chrome.runtime.lastError.message);
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || {});
          }
        });
      });
    });
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initializing popup...');
  
  // Initialize tabs
  initializeTabs();
  
  // Initialize basic functionality
  initializeBasicFunctionality();
  
  // Check GTM status
  setTimeout(checkGTMStatus, 500);
});

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      
      // Remove active class from all
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class
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
          setTimeout(() => {
            this.textContent = '⚡ Apply Settings';
          }, 2000);
        } else {
          this.textContent = '❌ Failed';
          setTimeout(() => {
            this.textContent = '⚡ Apply Settings';
          }, 2000);
        }
      } catch (error) {
        console.error('Apply consent error:', error);
        this.textContent = '❌ Error';
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
  
  // Toggle overlay button
  const overlayBtn = document.getElementById('toggleOverlay');
  if (overlayBtn) {
    overlayBtn.addEventListener('click', async function() {
      try {
        const result = await ContentScriptInterface.sendMessage('toggleOverlay');
        if (result.success) {
          this.textContent = result.action === 'created' ? '👁️ Hide' : '👁️ Show';
        }
      } catch (error) {
        console.error('Overlay toggle error:', error);
      }
    });
  }
}

async function checkGTMStatus() {
  console.log('🔍 Checking GTM status...');
  
  try {
    const result = await ContentScriptInterface.sendMessage('checkGTM');
    console.log('GTM check result:', result);
    
    updateStatusDisplay(result);
    await refreshTags();
    
  } catch (error) {
    console.error('Error checking GTM:', error);
    updateStatusDisplay({ hasGTM: false, error: error.message });
  }
}

function updateStatusDisplay(result) {
  const gtmStatus = document.getElementById('gtmStatus');
  const consentModeStatus = document.getElementById('consentModeStatus');
  
  if (!gtmStatus || !consentModeStatus) return;
  
  if (result.hasGTM) {
    gtmStatus.textContent = `✅ GTM Found: ${result.gtmId}`;
    gtmStatus.className = 'status found';
    
    if (result.hasConsentMode) {
      const analytics = result.consentState.analytics_storage || 'unknown';
      const ads = result.consentState.ad_storage || 'unknown';
      consentModeStatus.textContent = `🔒 Analytics: ${analytics}, Ads: ${ads}`;
      consentModeStatus.className = 'status found';
    } else {
      consentModeStatus.textContent = '⚠️ Consent Mode Not Found';
      consentModeStatus.className = 'status not-found';
    }
  } else {
    gtmStatus.textContent = result.error ? 
      `❌ Error: ${result.error}` : '❌ GTM Not Detected';
    gtmStatus.className = 'status not-found';
    
    consentModeStatus.textContent = '❌ Not Applicable';
    consentModeStatus.className = 'status not-found';
  }
}

async function refreshTags() {
  try {
    const tags = await ContentScriptInterface.sendMessage('getTagStatus');
    updateTagList(tags);
  } catch (error) {
    console.error('Error refreshing tags:', error);
  }
}

function updateTagList(tags) {
  const tagList = document.getElementById('tagList');
  if (!tagList) return;
  
  if (!tags || tags.length === 0) {
    tagList.innerHTML = '<div class="tag-item empty-state">No tags detected</div>';
    return;
  }
  
  tagList.innerHTML = tags.map(tag => `
    <div class="tag-item ${tag.type || 'other'}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong>${tag.name}</strong>
        <span style="color: ${tag.allowed ? '#28a745' : '#dc3545'}; font-weight: 600;">
          ${tag.allowed ? '✅ Allowed' : '❌ Blocked'}
        </span>
      </div>
      <div style="font-size: 12px; color: #666;">
        Type: ${tag.type || 'Unknown'}
      </div>
      <div style="font-size: 11px; color: #888; margin-top: 2px;">
        ${tag.reason || ''}
      </div>
    </div>
  `).join('');
}

// Make globally available
window.ContentScriptInterface = ContentScriptInterface;
window.checkGTMStatus = checkGTMStatus;

console.log('✅ Popup script loaded');