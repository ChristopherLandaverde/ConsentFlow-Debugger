// Simplified popup.js - Back to basics
const ContentScriptInterface = {
  sendMessage: async function(action, data = {}) {
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        if (!tabs[0]) {
          resolve({ error: 'No active tab' });
          return;
        }
        
        const tabId = tabs[0].id;
        
        chrome.tabs.sendMessage(tabId, { action, data }, async (response) => {
          if (chrome.runtime.lastError) {
            try {
              const injectResult = await this.ensureContentScript(tabId);
              if (injectResult.success) {
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, { action, data }, (retryResponse) => {
                    resolve(retryResponse || { error: 'No response after injection' });
                  });
                }, 2000);
              } else {
                resolve({ error: 'Content script injection failed' });
              }
            } catch (error) {
              resolve({ error: 'Injection error: ' + error.message });
            }
          } else {
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
        resolve(response || { success: false, error: 'No response from background' });
      });
    });
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  initializeTabs();
  initializeButtons();
  checkGTMStatus();
});

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
      
      // Refresh data when switching to certain tabs
      if (tabName === 'tags') refreshTags();
      if (tabName === 'events') refreshEvents();
    });
  });
}

function initializeButtons() {
  // Overview tab buttons
  document.getElementById('refreshOverview').addEventListener('click', checkGTMStatus);
  document.getElementById('diagnoseTab').addEventListener('click', runDiagnostics);
  
  // Tags tab buttons  
  document.getElementById('refreshTags').addEventListener('click', refreshTags);
  
  // Filter buttons
  initializeTagFilters();
  initializeEventFilters();
  
  // Consent tab buttons
  initializeConsentSimulator();
  
  // Event tab buttons
  document.getElementById('clearLog').addEventListener('click', clearEventLog);
  document.getElementById('exportLog').addEventListener('click', exportEventLog);
}

function initializeTagFilters() {
  const filterContainer = document.querySelector('#tags-tab .filter-controls');
  if (!filterContainer) return;
  
  filterContainer.addEventListener('click', function(e) {
    if (!e.target.matches('.filter-btn[data-filter]')) return;
    
    const filterValue = e.target.getAttribute('data-filter');
    
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn === e.target);
    });
    
    filterTags(filterValue);
  });
}

function initializeEventFilters() {
  const filterContainer = document.querySelector('#events-tab .filter-controls');
  if (!filterContainer) return;
  
  filterContainer.addEventListener('click', function(e) {
    if (!e.target.matches('.filter-btn[data-event-filter]')) return;
    
    const filterValue = e.target.getAttribute('data-event-filter');
    
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn === e.target);
    });
    
    filterEvents(filterValue);
  });
}

function initializeConsentSimulator() {
  // Apply button
  document.getElementById('applyConsent').addEventListener('click', async function() {
    this.disabled = true;
    this.textContent = '⚡ Applying...';
    
    try {
      const settings = getConsentSettings();
      const result = await ContentScriptInterface.sendMessage('applyConsent', settings);
      
      if (result && result.success) {
        showNotification('✅ Consent applied!', 'success');
        setTimeout(() => {
          checkGTMStatus();
          refreshTags();
        }, 1000);
      } else {
        showNotification('❌ Failed to apply consent', 'error');
      }
    } catch (error) {
      showNotification('❌ Error applying consent', 'error');
    } finally {
      this.disabled = false;
      this.textContent = '⚡ Apply Settings';
    }
  });
  
  // Preset buttons
  document.querySelectorAll('.dropdown-item[data-preset]').forEach(item => {
    item.addEventListener('click', function() {
      const preset = this.getAttribute('data-preset');
      applyConsentPreset(preset);
    });
  });
}

async function checkGTMStatus() {
  updateStatusDisplay({ loading: true });
  
  try {
    const result = await ContentScriptInterface.sendMessage('checkGTM');
    updateStatusDisplay(result);
    updateOverviewTab(result);
  } catch (error) {
    updateStatusDisplay({ hasGTM: false, error: error.message });
  }
}

function updateStatusDisplay(result) {
  const gtmStatus = document.getElementById('gtmStatus');
  const consentModeStatus = document.getElementById('consentModeStatus');
  
  if (!gtmStatus || !consentModeStatus) return;
  
  // Handle loading state
  if (result && result.loading) {
    gtmStatus.textContent = '🔄 Checking for GTM...';
    gtmStatus.className = 'status';
    consentModeStatus.textContent = '🔄 Checking for Consent Mode...';
    consentModeStatus.className = 'status';
    return;
  }
  
  // Handle error state  
  if (result && result.error) {
    gtmStatus.textContent = `❌ Error: ${result.error}`;
    gtmStatus.className = 'status not-found';
    consentModeStatus.textContent = '❌ Not Applicable';
    consentModeStatus.className = 'status not-found';
    return;
  }
  
  // Handle GTM found
  if (result && result.hasGTM) {
    gtmStatus.textContent = `✅ GTM Found: ${result.gtmId}`;
    gtmStatus.className = 'status found';
    
    // FIXED: Better consent mode handling
    if (result.hasConsentMode) {
      const analytics = result.consentState?.analytics_storage || 'unknown';
      const ads = result.consentState?.ad_storage || 'unknown';
      consentModeStatus.textContent = `✅ Consent Mode: Analytics=${analytics}, Ads=${ads}`;
      consentModeStatus.className = 'status found';
      
      // Enable consent simulator
      enableConsentSimulator(true);
      updateConsentToggles(result.consentState);
    } else {
      consentModeStatus.textContent = '⚠️ No Consent Mode (All tags fire freely)';
      consentModeStatus.className = 'status not-found';
      
      // Disable consent simulator and show why
      enableConsentSimulator(false);
      showConsentModeUnavailable();
    }
  } else {
    gtmStatus.textContent = '❌ GTM Not Detected';
    gtmStatus.className = 'status not-found';
    consentModeStatus.textContent = '❌ Not Applicable';
    consentModeStatus.className = 'status not-found';
    
    enableConsentSimulator(false);
  }
}

function updateOverviewTab(result) {
  document.getElementById('gtmContainerValue').textContent = result?.gtmId || 'Not detected';
  
  // Better consent mode display
  if (result?.hasConsentMode) {
    document.getElementById('overviewConsentValue').textContent = 'Active';
    document.getElementById('overviewConsentValue').className = 'value detected';
  } else if (result?.hasGTM) {
    document.getElementById('overviewConsentValue').textContent = 'Not Implemented';
    document.getElementById('overviewConsentValue').className = 'value not-detected';
  } else {
    document.getElementById('overviewConsentValue').textContent = 'N/A';
    document.getElementById('overviewConsentValue').className = 'value';
  }
  
  if (result?.tags) {
    document.getElementById('totalTagsFound').textContent = result.tags.length;
    const blockedTags = result.hasConsentMode ? 
      result.tags.filter(tag => !tag.allowed).length : 0;
    document.getElementById('totalTagsBlocked').textContent = blockedTags;
  }
}

function enableConsentSimulator(enabled) {
  const consentTab = document.getElementById('consent-tab');
  const applyButton = document.getElementById('applyConsent');
  const consentSelects = document.querySelectorAll('.consent-select');
  const presetButtons = document.querySelectorAll('.dropdown-item[data-preset]');
  
  if (enabled) {
    // Remove disabled overlay if it exists
    const overlay = consentTab.querySelector('.disabled-overlay');
    if (overlay) overlay.remove();
    
    // Enable controls
    if (applyButton) {
      applyButton.disabled = false;
      applyButton.textContent = '⚡ Apply Settings';
    }
    
    consentSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '1';
    });
    
    presetButtons.forEach(button => {
      button.disabled = false;
      button.style.opacity = '1';
    });
    
  } else {
    // Disable all controls
    if (applyButton) {
      applyButton.disabled = true;
      applyButton.textContent = '❌ Consent Mode Not Available';
    }
    
    consentSelects.forEach(select => {
      select.disabled = true;
      select.style.opacity = '0.5';
    });
    
    presetButtons.forEach(button => {
      button.disabled = true;
      button.style.opacity = '0.5';
    });
  }
}

function showConsentModeUnavailable() {
  const consentTab = document.getElementById('consent-tab');
  
  // Add explanation message
  let warningMsg = consentTab.querySelector('.consent-mode-warning');
  if (!warningMsg) {
    warningMsg = document.createElement('div');
    warningMsg.className = 'consent-mode-warning';
    warningMsg.style.cssText = `
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 15px;
      color: #856404;
    `;
    warningMsg.innerHTML = `
      <strong>⚠️ Consent Mode Not Available</strong><br>
      This website doesn't use Google's Consent Mode. All tags fire without consent restrictions.
      The consent simulator is disabled because it won't affect tag behavior.
    `;
    
    consentTab.insertBefore(warningMsg, consentTab.querySelector('.consent-categories'));
  }
  
  // Set all selects to "granted" since that's the reality
  updateConsentToggles({
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted', 
    personalization_storage: 'granted',
    security_storage: 'granted'
  });
}

async function refreshTags() {
  const tagList = document.getElementById('tagList');
  tagList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const result = await ContentScriptInterface.sendMessage('getTagStatus');
    updateTagDisplay(result || []);
  } catch (error) {
    tagList.innerHTML = '<div class="tag-item empty-state">Error loading tags</div>';
  }
}

function updateTagDisplay(tags) {
  const tagList = document.getElementById('tagList');
  
  if (!tags || tags.length === 0) {
    tagList.innerHTML = '<div class="tag-item empty-state">No tags detected</div>';
    return;
  }
  
  tagList.innerHTML = tags.map(tag => `
    <div class="tag-item ${tag.type || 'other'}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong>${escapeHtml(tag.name)}</strong>
        <span style="color: ${tag.allowed ? '#28a745' : '#dc3545'}; font-weight: 600;">
          ${tag.allowed ? '✅ Allowed' : '❌ Blocked'}
        </span>
      </div>
      <div style="font-size: 12px; color: #666;">
        Type: ${escapeHtml(tag.type || 'Unknown')}
      </div>
      ${tag.reason ? `<div style="font-size: 11px; color: #888; margin-top: 2px;">
        ${escapeHtml(tag.reason)}
      </div>` : ''}
    </div>
  `).join('');
}

function filterTags(category) {
  const tagItems = document.querySelectorAll('#tagList .tag-item:not(.empty-state)');
  tagItems.forEach(item => {
    if (category === 'all') {
      item.style.display = 'block';
    } else {
      item.style.display = item.classList.contains(category) ? 'block' : 'none';
    }
  });
}

async function refreshEvents() {
  try {
    const events = await ContentScriptInterface.sendMessage('getEventLog');
    updateEventDisplay(events || []);
  } catch (error) {
    document.getElementById('eventLog').innerHTML = '<div class="event-item empty-state">Error loading events</div>';
  }
}

function updateEventDisplay(events) {
  const eventLog = document.getElementById('eventLog');
  
  if (!events || events.length === 0) {
    eventLog.innerHTML = '<div class="event-item empty-state">No events recorded yet</div>';
    return;
  }
  
  eventLog.innerHTML = events.slice(-20).reverse().map(event => `
    <div class="event-item" data-event-type="${event.category || 'other'}">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-size: 12px; color: #666;">[${new Date(event.timestamp).toLocaleTimeString()}]</span>
        <span style="font-size: 10px; background: #007bff; color: white; padding: 2px 6px; border-radius: 3px;">
          ${escapeHtml(event.type || 'Event')}
        </span>
      </div>
      <div style="font-size: 13px; color: #333;">
        ${escapeHtml(JSON.stringify(event.event).substring(0, 100) + (JSON.stringify(event.event).length > 100 ? '...' : ''))}
      </div>
    </div>
  `).join('');
}

function filterEvents(category) {
  const eventItems = document.querySelectorAll('#eventLog .event-item:not(.empty-state)');
  eventItems.forEach(item => {
    if (category === 'all') {
      item.style.display = 'block';
    } else {
      item.style.display = item.dataset.eventType === category ? 'block' : 'none';
    }
  });
}

function getConsentSettings() {
  return {
    analytics_storage: document.getElementById('analytics_storage').value,
    ad_storage: document.getElementById('ad_storage').value,
    functionality_storage: document.getElementById('functionality_storage').value,
    personalization_storage: document.getElementById('personalization_storage').value,
    security_storage: document.getElementById('security_storage').value
  };
}

function updateConsentToggles(consentState) {
  Object.entries(consentState).forEach(([key, value]) => {
    const element = document.getElementById(key);
    if (element) {
      element.value = value;
    }
  });
}

function applyConsentPreset(preset) {
  const presets = {
    'all-granted': {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted'
    },
    'all-denied': {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'denied'
    },
    'analytics-only': {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'denied',
      security_storage: 'granted'
    },
    'functional-only': {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'denied',
      security_storage: 'granted'
    }
  };
  
  const settings = presets[preset];
  if (settings) {
    updateConsentToggles(settings);
    setTimeout(() => {
      document.getElementById('applyConsent').click();
    }, 100);
  }
}

async function clearEventLog() {
  try {
    await ContentScriptInterface.sendMessage('clearEventLog');
    document.getElementById('eventLog').innerHTML = '<div class="event-item empty-state">Event log cleared</div>';
  } catch (error) {
    showNotification('Failed to clear event log', 'error');
  }
}

function exportEventLog() {
  showNotification('Export functionality would be implemented here', 'info');
}

async function runDiagnostics() {
  showNotification('Running diagnostics...', 'info');
  
  chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
    if (tabs[0]) {
      const tab = tabs[0];
      
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        showNotification('Cannot run on system pages', 'error');
        return;
      }
      
      try {
        const injectResult = await ContentScriptInterface.ensureContentScript(tab.id);
        if (injectResult.success) {
          setTimeout(() => {
            checkGTMStatus();
            showNotification('Diagnostics completed!', 'success');
          }, 2000);
        } else {
          showNotification('Diagnostics failed: ' + injectResult.error, 'error');
        }
      } catch (error) {
        showNotification('Diagnostics error: ' + error.message, 'error');
      }
    }
  });
}

function showNotification(message, type = 'info') {
  console.log(`${type.toUpperCase()}: ${message}`);
  // Simple notification - you can enhance this later
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}