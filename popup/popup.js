// popup.js - Complete working version
console.log('🔍 GTM Inspector Popup: Loading...');

let currentTags = [];
let currentEvents = [];

// Content script interface
const contentScriptInterface = {
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

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initializing popup...');
  
  try {
    initializeTabs();
    initializeBasicControls();
    initializeConsentControls();
    initializeEventControls();
    initializeQAControls();
    
    // Initial GTM check
    setTimeout(() => {
      checkGTMStatus();
    }, 500);
    
    console.log('✅ Popup initialization complete');
  } catch (error) {
    console.error('❌ Popup initialization failed:', error);
  }
});

// Tab management
function initializeTabs() {
  console.log('🏷️ Initializing tabs...');
  
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  console.log('Found tab buttons:', tabButtons.length);
  console.log('Found tab contents:', tabContents.length);
  
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      console.log('Tab clicked:', tabName);
      
      // Remove active class from all tabs and contents
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      this.classList.add('active');
      const targetContent = document.getElementById(`${tabName}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
        console.log('Activated tab:', tabName);
      } else {
        console.error('Tab content not found:', `${tabName}-tab`);
      }
      
      // Refresh data when switching to certain tabs
      if (tabName === 'tags') {
        refreshTags();
      } else if (tabName === 'events') {
        refreshEvents();
      }
    });
  });
}

// Basic controls
function initializeBasicControls() {
  console.log('🎛️ Initializing basic controls...');
  
  // Refresh tags button
  const refreshBtn = document.getElementById('refreshTags');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function() {
      console.log('Refresh tags clicked');
      this.disabled = true;
      this.textContent = '🔄 Refreshing...';
      
      try {
        await refreshTags();
      } finally {
        this.disabled = false;
        this.textContent = '🔄 Refresh';
      }
    });
    console.log('✅ Refresh button initialized');
  } else {
    console.error('❌ Refresh button not found');
  }
  
  // Toggle overlay button
  const overlayBtn = document.getElementById('toggleOverlay');
  if (overlayBtn) {
    overlayBtn.addEventListener('click', async function() {
      console.log('Toggle overlay clicked');
      this.disabled = true;
      
      try {
        const result = await contentScriptInterface.sendMessage('toggleOverlay');
        if (result.success) {
          this.textContent = result.action === 'created' ? '👁️ Hide' : '👁️ Show';
          showNotification('Overlay toggled!', 'success');
        }
      } catch (error) {
        console.error('Overlay toggle error:', error);
        showNotification('Failed to toggle overlay', 'error');
      } finally {
        this.disabled = false;
      }
    });
    console.log('✅ Overlay button initialized');
  } else {
    console.error('❌ Overlay button not found');
  }
  
  // Tag filter buttons
  const filterBtns = document.querySelectorAll('.filter-btn[data-filter]');
  console.log('Found filter buttons:', filterBtns.length);
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const filter = this.getAttribute('data-filter');
      console.log('Filter clicked:', filter);
      
      // Update active state
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // Filter tags
      filterTags(filter);
    });
  });
}

// Consent controls
function initializeConsentControls() {
  console.log('⚙️ Initializing consent controls...');
  
  // Apply consent button
  const applyBtn = document.getElementById('applyConsent');
  if (applyBtn) {
    applyBtn.addEventListener('click', async function() {
      console.log('Apply consent clicked');
      this.disabled = true;
      this.textContent = '⚡ Applying...';
      
      try {
        const settings = getConsentSettings();
        console.log('Applying consent settings:', settings);
        
        const result = await contentScriptInterface.sendMessage('applyConsent', settings);
        
        if (result.success) {
          showNotification('✅ Consent applied!', 'success');
          // Refresh tags after applying consent
          setTimeout(() => refreshTags(), 1000);
        } else {
          showNotification('❌ Failed: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        console.error('Apply consent error:', error);
        showNotification('❌ Error applying consent', 'error');
      } finally {
        this.disabled = false;
        this.textContent = '⚡ Apply Settings';
      }
    });
    console.log('✅ Apply consent button initialized');
  } else {
    console.error('❌ Apply consent button not found');
  }
  
  // Preset buttons
  const presetBtns = document.querySelectorAll('.preset-btn[data-preset]');
  console.log('Found preset buttons:', presetBtns.length);
  
  presetBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const preset = this.getAttribute('data-preset');
      console.log('Preset clicked:', preset);
      applyConsentPreset(preset);
    });
  });
}

// Event controls
function initializeEventControls() {
  console.log('📝 Initializing event controls...');
  
  // Clear log button
  const clearBtn = document.getElementById('clearLog');
  if (clearBtn) {
    clearBtn.addEventListener('click', async function() {
      console.log('Clear log clicked');
      const result = await contentScriptInterface.sendMessage('clearEventLog');
      if (result.success) {
        updateEventLog([]);
        showNotification('🗑️ Log cleared', 'success');
      }
    });
    console.log('✅ Clear log button initialized');
  }
  
  // Export log button
  const exportBtn = document.getElementById('exportLog');
  if (exportBtn) {
    exportBtn.addEventListener('click', async function() {
      console.log('Export log clicked');
      const events = await contentScriptInterface.sendMessage('getEventLog');
      if (events && events.length > 0) {
        exportEvents(events);
      } else {
        showNotification('⚠️ No events to export', 'warning');
      }
    });
    console.log('✅ Export log button initialized');
  }
  
  // Event filter buttons
  const eventFilterBtns = document.querySelectorAll('.filter-btn[data-event-filter]');
  console.log('Found event filter buttons:', eventFilterBtns.length);
  
  eventFilterBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const filter = this.getAttribute('data-event-filter');
      console.log('Event filter clicked:', filter);
      
      // Update active state
      eventFilterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // Filter events
      filterEvents(filter);
    });
  });
}

// QA controls
function initializeQAControls() {
  console.log('🧪 Initializing QA controls...');
  
  const consentTestBtn = document.getElementById('runConsentTest');
  if (consentTestBtn) {
    consentTestBtn.addEventListener('click', runConsentTest);
    console.log('✅ Consent test button initialized');
  }
  
  const tagTestBtn = document.getElementById('runTagTest');
  if (tagTestBtn) {
    tagTestBtn.addEventListener('click', runTagTest);
    console.log('✅ Tag test button initialized');
  }
}

// Main functions
async function checkGTMStatus() {
  console.log('🔍 Checking GTM status...');
  
  try {
    const result = await contentScriptInterface.sendMessage('checkGTM');
    console.log('GTM check result:', result);
    
    if (result.error) {
      console.error('GTM check failed:', result.error);
      updateGTMStatusDisplay({ hasGTM: false, error: result.error });
      return;
    }
    
    updateGTMStatusDisplay(result);
    
    // Update UI with data
    if (result.tags && result.tags.length > 0) {
      updateTagList(result.tags);
    }
    
    if (result.events && result.events.length > 0) {
      updateEventLog(result.events);
    }
    
    if (result.consentState) {
      updateConsentToggles(result.consentState);
    }
    
  } catch (error) {
    console.error('Error checking GTM:', error);
    updateGTMStatusDisplay({ hasGTM: false, error: error.message });
  }
}

// Update GTM status display
function updateGTMStatusDisplay(result) {
  console.log('Updating GTM status display:', result);
  
  const gtmStatus = document.getElementById('gtmStatus');
  const consentModeStatus = document.getElementById('consentModeStatus');
  
  if (!gtmStatus || !consentModeStatus) {
    console.error('Status elements not found');
    return;
  }
  
  if (result.hasGTM) {
    gtmStatus.textContent = `✅ GTM Found: ${result.gtmId}`;
    gtmStatus.className = 'status found';
    
    consentModeStatus.textContent = result.hasConsentMode ? 
      '✅ Consent Mode Active' : '⚠️ Consent Mode Not Found';
    consentModeStatus.className = result.hasConsentMode ? 
      'status found' : 'status not-found';
  } else {
    gtmStatus.textContent = result.error ? 
      `❌ Error: ${result.error}` : '❌ GTM Not Detected';
    gtmStatus.className = 'status not-found';
    
    consentModeStatus.textContent = '❌ Not Applicable';
    consentModeStatus.className = 'status not-found';
  }
  
  console.log('GTM status display updated');
}

// Tag management
async function refreshTags() {
  console.log('🏷️ Refreshing tags...');
  
  try {
    const result = await contentScriptInterface.sendMessage('getTagStatus');
    console.log('Tag refresh result:', result);
    
    if (result && Array.isArray(result)) {
      updateTagList(result);
    }
  } catch (error) {
    console.error('Error refreshing tags:', error);
  }
}

function updateTagList(tags) {
  console.log('Updating tag list:', tags);
  
  const tagList = document.getElementById('tagList');
  if (!tagList) {
    console.error('Tag list element not found');
    return;
  }
  
  currentTags = tags;
  
  if (!tags || tags.length === 0) {
    tagList.innerHTML = '<div class="tag-item empty-state">No tags detected</div>';
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  tags.forEach(tag => {
    const tagElement = document.createElement('div');
    tagElement.className = `tag-item ${tag.category || tag.type || 'other'}`;
    
    const statusIcon = tag.allowed ? '✅' : '❌';
    
    tagElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong>${escapeHtml(tag.name)}</strong>
        <span style="color: ${tag.allowed ? '#28a745' : '#dc3545'}; font-weight: 600;">
          ${statusIcon} ${tag.allowed ? 'Allowed' : 'Blocked'}
        </span>
      </div>
      <div style="font-size: 12px; color: #666;">
        Type: ${escapeHtml(tag.type || 'Unknown')}
      </div>
      ${tag.reason ? `<div style="font-size: 11px; color: #888; margin-top: 2px;">
        ${escapeHtml(tag.reason)}
      </div>` : ''}
    `;
    
    fragment.appendChild(tagElement);
  });
  
  tagList.innerHTML = '';
  tagList.appendChild(fragment);
  
  console.log('Tag list updated with', tags.length, 'tags');
}

function filterTags(category) {
  console.log('Filtering tags by category:', category);
  
  const tagItems = document.querySelectorAll('.tag-item:not(.empty-state)');
  
  tagItems.forEach(item => {
    if (category === 'all') {
      item.style.display = 'block';
    } else {
      const hasCategory = item.classList.contains(category);
      item.style.display = hasCategory ? 'block' : 'none';
    }
  });
}

// Event management
async function refreshEvents() {
  console.log('📝 Refreshing events...');
  
  try {
    const events = await contentScriptInterface.sendMessage('getEventLog');
    console.log('Event refresh result:', events);
    
    if (events && Array.isArray(events)) {
      updateEventLog(events);
    }
  } catch (error) {
    console.error('Error refreshing events:', error);
  }
}

function updateEventLog(events) {
  console.log('Updating event log:', events);
  
  const eventLog = document.getElementById('eventLog');
  if (!eventLog) {
    console.error('Event log element not found');
    return;
  }
  
  currentEvents = events;
  
  if (!events || events.length === 0) {
    eventLog.innerHTML = '<div class="event-item empty-state">No events recorded</div>';
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  events.slice(-10).reverse().forEach(event => {
    const eventElement = document.createElement('div');
    eventElement.className = 'event-item';
    eventElement.setAttribute('data-category', event.category || 'other');
    
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    
    eventElement.innerHTML = `
      <span class="event-time">[${timestamp}]</span>
      <span class="event-type">${escapeHtml(event.type || 'Event')}</span>
      <div class="event-detail">${escapeHtml(event.details || '')}</div>
    `;
    
    fragment.appendChild(eventElement);
  });
  
  eventLog.innerHTML = '';
  eventLog.appendChild(fragment);
  
  console.log('Event log updated with', events.length, 'events');
}

function filterEvents(category) {
  console.log('Filtering events by category:', category);
  
  const eventItems = document.querySelectorAll('.event-item:not(.empty-state)');
  
  eventItems.forEach(item => {
    if (category === 'all') {
      item.style.display = 'block';
    } else {
      const itemCategory = item.getAttribute('data-category');
      item.style.display = itemCategory === category ? 'block' : 'none';
    }
  });
}

// Consent management
function getConsentSettings() {
  const settings = {
    analytics_storage: document.getElementById('analytics_storage')?.value || 'granted',
    ad_storage: document.getElementById('ad_storage')?.value || 'granted',
    functionality_storage: document.getElementById('functionality_storage')?.value || 'granted',
    personalization_storage: document.getElementById('personalization_storage')?.value || 'granted',
    security_storage: 'granted' // Always granted for security
  };
  
  console.log('Current consent settings:', settings);
  return settings;
}

function updateConsentToggles(consentState) {
  console.log('Updating consent toggles:', consentState);
  
  for (const [key, value] of Object.entries(consentState)) {
    const element = document.getElementById(key);
    if (element && element.value !== value) {
      element.value = value;
      console.log(`Updated ${key} to ${value}`);
    }
  }
}

function applyConsentPreset(preset) {
  console.log('Applying consent preset:', preset);
  
  let settings = {};
  
  switch (preset) {
    case 'all-granted':
      settings = {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'granted'
      };
      break;
    case 'all-denied':
      settings = {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        functionality_storage: 'denied',
        personalization_storage: 'denied'
      };
      break;
    case 'analytics-only':
      settings = {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied'
      };
      break;
  }
  
  // Update UI
  updateConsentToggles(settings);
  
  // Apply the settings
  document.getElementById('applyConsent').click();
}

// QA functions
async function runConsentTest() {
  console.log('🧪 Running consent test...');
  
  const qaResults = document.getElementById('qaResults');
  if (!qaResults) return;
  
  qaResults.innerHTML = '<div class="empty-state">Running consent test...</div>';
  
  try {
    // Simple test - check if ConsentInspector is accessible
    const result = await contentScriptInterface.sendMessage('checkGTM');
    
    const results = [];
    
    if (result.hasGTM) {
      results.push({
        name: 'GTM Detection',
        passed: true,
        message: `GTM found: ${result.gtmId}`
      });
    } else {
      results.push({
        name: 'GTM Detection',
        passed: false,
        message: 'GTM not found'
      });
    }
    
    if (result.hasConsentMode) {
      results.push({
        name: 'Consent Mode',
        passed: true,
        message: 'Consent Mode is active'
      });
    } else {
      results.push({
        name: 'Consent Mode',
        passed: false,
        message: 'Consent Mode not found'
      });
    }
    
    displayQAResults(results);
    
  } catch (error) {
    console.error('Consent test error:', error);
    qaResults.innerHTML = '<div class="empty-state">Test failed: ' + error.message + '</div>';
  }
}

async function runTagTest() {
  console.log('🔍 Running tag test...');
  
  const qaResults = document.getElementById('qaResults');
  if (!qaResults) return;
  
  qaResults.innerHTML = '<div class="empty-state">Running tag test...</div>';
  
  try {
    const tags = await contentScriptInterface.sendMessage('getTagStatus');
    
    const results = [];
    
    if (tags && tags.length > 0) {
      results.push({
        name: 'Tag Detection',
        passed: true,
        message: `Found ${tags.length} tags`
      });
      
      const allowedTags = tags.filter(tag => tag.allowed);
      const blockedTags = tags.filter(tag => !tag.allowed);
      
      results.push({
        name: 'Tag Status',
        passed: true,
        message: `${allowedTags.length} allowed, ${blockedTags.length} blocked`
      });
    } else {
      results.push({
        name: 'Tag Detection',
        passed: false,
        message: 'No tags detected'
      });
    }
    
    displayQAResults(results);
    
  } catch (error) {
    console.error('Tag test error:', error);
    qaResults.innerHTML = '<div class="empty-state">Test failed: ' + error.message + '</div>';
  }
}

function displayQAResults(results) {
  const qaResults = document.getElementById('qaResults');
  if (!qaResults) return;
  
  const fragment = document.createDocumentFragment();
  
  results.forEach(result => {
    const resultElement = document.createElement('div');
    resultElement.className = `qa-result ${result.passed ? 'qa-pass' : 'qa-fail'}`;
    
    resultElement.innerHTML = `
      <div><strong>${escapeHtml(result.name)}</strong></div>
      <div>${result.passed ? '✅ Pass' : '❌ Fail'}: ${escapeHtml(result.message)}</div>
    `;
    
    fragment.appendChild(resultElement);
  });
  
  qaResults.innerHTML = '';
  qaResults.appendChild(fragment);
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function exportEvents(events) {
  try {
    const exportData = {
      timestamp: new Date().toISOString(),
      url: 'Current page',
      events: events
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gtm-events-${new Date().toISOString().split('T')[0]}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('📤 Events exported!', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('❌ Export failed', 'error');
  }
}

function showNotification(message, type = 'info') {
  console.log(`Notification [${type}]: ${message}`);
  
  // Simple console notification for now
  // Could be enhanced with actual UI notifications later
}