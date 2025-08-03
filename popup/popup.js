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

// Simulation Mode State Management
class SimulationManager {
  constructor() {
    this.simulationMode = false;
    this.simulatedConsent = {
      analytics_storage: 'denied',  // More privacy-friendly default
      ad_storage: 'denied',         // More privacy-friendly default
      functionality_storage: 'granted',
      personalization_storage: 'denied', // More privacy-friendly default
      security_storage: 'granted'
    };
    
    this.presets = {
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
        security_storage: 'granted'
      },
      'analytics-only': {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      },
      'marketing-only': {
        analytics_storage: 'denied',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      },
      'essential-only': {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        personalization_storage: 'denied',
        security_storage: 'granted'
      }
    };
    
    this.init();
  }
  
  async init() {
    // Load saved state
    await this.loadState();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Update UI
    this.updateUI();
  }
  
  async loadState() {
    try {
      const result = await chrome.storage.local.get(['simulationMode', 'simulatedConsent']);
      this.simulationMode = result.simulationMode || false;
      
      // Decrypt consent data if encrypted
      if (result.simulatedConsent && EncryptionManager.isEncrypted(result.simulatedConsent)) {
        const decryptedConsent = await EncryptionManager.decryptMarked(result.simulatedConsent);
        this.simulatedConsent = { ...this.simulatedConsent, ...decryptedConsent };
      } else {
        this.simulatedConsent = { ...this.simulatedConsent, ...result.simulatedConsent };
      }
    } catch (error) {
      console.error('Failed to load simulation state:', error);
    }
  }
  
  async saveState() {
    try {
      // Encrypt sensitive consent data
      const encryptedConsent = await EncryptionManager.encryptAndMark(this.simulatedConsent);
      
      await rateLimitedStorageSet({
        simulationMode: this.simulationMode,
        simulatedConsent: encryptedConsent
      });
    } catch (error) {
      console.error('Failed to save simulation state:', error);
    }
  }
  
  setupEventListeners() {
    // Simulation mode toggle
    const simulationToggle = document.getElementById('simulationMode');
    if (simulationToggle) {
      simulationToggle.addEventListener('change', (e) => {
        this.simulationMode = e.target.checked;
        this.updateUI();
        this.saveState();
        this.notifyContentScript();
        // Auto-refresh tags when simulation mode changes
        setTimeout(() => refreshTags(), 100);
      });
    }
    
    // Simulated consent toggles
    const consentToggles = [
      'sim_analytics_storage',
      'sim_ad_storage', 
      'sim_functionality_storage',
      'sim_personalization_storage'
    ];
    
    consentToggles.forEach(id => {
      const toggle = document.getElementById(id);
      if (toggle) {
        toggle.addEventListener('change', (e) => {
          const consentType = id.replace('sim_', '');
          this.simulatedConsent[consentType] = e.target.checked ? 'granted' : 'denied';
          this.saveState();
          this.notifyContentScript();
          // Auto-refresh tags when consent settings change
          setTimeout(() => refreshTags(), 100);
        });
      }
    });
    
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.currentTarget.dataset.preset;
        this.applyPreset(preset);
        // Auto-refresh tags when preset is applied
        setTimeout(() => refreshTags(), 100);
      });
    });
  }
  
  updateUI() {
    // Update simulation mode toggle
    const simulationToggle = document.getElementById('simulationMode');
    const simulationStatus = document.getElementById('simulationStatus');
    const simulatedControls = document.getElementById('simulatedConsentControls');
    const realControls = document.getElementById('realConsentControls');
    
    if (simulationToggle) {
      simulationToggle.checked = this.simulationMode;
    }
    
    if (simulationStatus) {
      simulationStatus.textContent = this.simulationMode ? 'ON' : 'OFF';
      simulationStatus.className = this.simulationMode ? 'simulation-status active' : 'simulation-status';
    }
    
    // Show/hide controls based on mode
    if (simulatedControls) {
      simulatedControls.style.display = this.simulationMode ? 'block' : 'none';
    }
    
    if (realControls) {
      realControls.style.display = this.simulationMode ? 'none' : 'block';
    }
    
    // Update simulated consent toggles
    Object.entries(this.simulatedConsent).forEach(([key, value]) => {
      const toggle = document.getElementById(`sim_${key}`);
      if (toggle && key !== 'security_storage') {
        toggle.checked = value === 'granted';
      }
    });
  }
  
  applyPreset(presetName) {
    const preset = this.presets[presetName];
    if (!preset) return;
    
    this.simulatedConsent = { ...preset };
    this.updateUI();
    this.saveState();
    this.notifyContentScript();
    
    // Show feedback
    this.showNotification(`Applied preset: ${presetName}`, 'success');
  }
  
  getCurrentConsentState() {
    return this.simulationMode ? this.simulatedConsent : null;
  }
  
  isSimulationMode() {
    return this.simulationMode;
  }
  
  async notifyContentScript() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'updateSimulationMode',
          data: {
            simulationMode: this.simulationMode,
            simulatedConsent: this.simulatedConsent
          }
        });
      }
    } catch (error) {
      console.error('Content script not available for simulation update:', error);
    }
  }
  
  showNotification(message, type) {
    // Simple notification - you can enhance this
  }
}

// Initialize simulation manager
let simulationManager;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  try {
    // Initialize simulation manager first
    simulationManager = new SimulationManager();
    
    // Then initialize other components
    initializeTabs();
    initializeButtons();
    
    // Load initial data
    checkGTMStatus();
    refreshEvents();
  } catch (error) {
    console.error('Error during popup initialization:', error);
    // Show a user-friendly error message
    const statusContainer = document.querySelector('.status-container');
    if (statusContainer) {
      statusContainer.innerHTML = `
        <div class="status error">
          ❌ Error: Failed to initialize extension. Please refresh the popup.
        </div>
      `;
    }
  }
});

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  if (tabButtons.length === 0 || tabContents.length === 0) {
    console.warn('Tab elements not found, skipping tab initialization');
    return;
  }
  
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
  const refreshOverviewBtn = document.getElementById('refreshOverview');
  const diagnoseTabBtn = document.getElementById('diagnoseTab');
  const refreshTagsBtn = document.getElementById('refreshTags');
  const refreshEventsBtn = document.getElementById('refreshEvents');
  const clearLogBtn = document.getElementById('clearLog');
  const exportLogBtn = document.getElementById('exportLog');
  
  if (refreshOverviewBtn) {
    refreshOverviewBtn.addEventListener('click', checkGTMStatus);
  }
  if (diagnoseTabBtn) {
    diagnoseTabBtn.addEventListener('click', runDiagnostics);
  }
  if (refreshTagsBtn) {
    refreshTagsBtn.addEventListener('click', refreshTags);
  }
  if (refreshEventsBtn) {
    refreshEventsBtn.addEventListener('click', refreshEvents);
  }
  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', clearEventLog);
  }
  
  // Filter buttons
  initializeTagFilters();
  initializeEventFilters();
  
  // Consent tab buttons
  initializeConsentSimulator();
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

// Event Filtering Functions
function initializeEventFilters() {
  const filterButtons = document.querySelectorAll('[data-event-filter]');
  
  filterButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Remove active class from all buttons
      filterButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      this.classList.add('active');
      
      // Get filter value
      const filterValue = this.getAttribute('data-event-filter');
      
      // Apply filter
    filterEvents(filterValue);
    });
  });
}

function filterEvents(category) {
  const eventItems = document.querySelectorAll('#eventLog .event-item:not(.empty-state):not(.events-section-header):not(.event-summary):not(.simulation-context)');
  
  eventItems.forEach(item => {
    if (category === 'all') {
      item.style.display = 'block';
    } else {
      // Determine event category based on class or data attributes
      let eventCategory = 'other';
      
      if (item.classList.contains('real-event')) {
        eventCategory = 'real';
      } else if (item.classList.contains('simulated-event')) {
        eventCategory = 'simulated';
      }
      
      // Check for source-specific classes
      if (item.querySelector('.source-cookiebot_native')) {
        eventCategory = 'consent';
      } else if (item.querySelector('.source-datalayer') || item.querySelector('.source-gtag')) {
        eventCategory = 'gtm';
      }
      
      // Check for event type
      const eventType = item.querySelector('.event-type');
      if (eventType) {
        if (eventType.textContent.includes('consent') || eventType.textContent.includes('Cookiebot')) {
          eventCategory = 'consent';
        } else if (eventType.textContent.includes('GTM') || eventType.textContent.includes('dataLayer')) {
          eventCategory = 'gtm';
        }
      }
      
      item.style.display = eventCategory === category ? 'block' : 'none';
    }
  });
  
  // Update filter summary
  updateFilterSummary(category);
}

function updateFilterSummary(category) {
  const visibleEvents = document.querySelectorAll('#eventLog .event-item:not(.empty-state):not(.events-section-header):not(.event-summary):not(.simulation-context)[style*="display: block"]');
  const totalEvents = document.querySelectorAll('#eventLog .event-item:not(.empty-state):not(.events-section-header):not(.event-summary):not(.simulation-context)');
  
  const summaryElement = document.querySelector('.event-summary .filter-summary');
  if (summaryElement) {
    if (category === 'all') {
      summaryElement.textContent = `Showing all ${totalEvents.length} events`;
    } else {
      summaryElement.textContent = `Showing ${visibleEvents.length} of ${totalEvents.length} events (filtered by ${category})`;
    }
  }
}

function initializeConsentSimulator() {
  // Apply button
  const applyConsentBtn = document.getElementById('applyConsent');
  if (applyConsentBtn) {
    applyConsentBtn.addEventListener('click', async function() {
      this.disabled = true;
      this.textContent = '⚡ Applying...';
      
      try {
        const settings = getConsentSettings();
        const result = await ContentScriptInterface.sendMessage('applyConsent', settings);
        
        if (result && result.success) {
          // Show detailed success message with methods used
          let successMessage = '✅ Consent applied!';
          if (result.methods && result.methods.length > 0) {
            const methods = result.methods.map(m => m.method).join(', ');
            successMessage = `✅ Consent applied via: ${methods}`;
          }
          
          showNotification(successMessage, 'success');
          
          // Refresh data after a short delay
          setTimeout(() => {
            checkGTMStatus();
            refreshTags();
          }, 1000);
        } else {
          const errorMsg = result?.error || 'Unknown error';
          showNotification(`❌ Failed to apply consent: ${errorMsg}`, 'error');
        }
      } catch (error) {
        showNotification('❌ Error applying consent: ' + error.message, 'error');
      } finally {
        this.disabled = false;
        this.textContent = '⚡ Apply Settings';
      }
    });
  }
  
  // Preset buttons
  const presetItems = document.querySelectorAll('.dropdown-item[data-preset]');
  presetItems.forEach(item => {
    item.addEventListener('click', function() {
      const preset = this.getAttribute('data-preset');
      applyConsentPreset(preset);
    });
  });
}

async function checkGTMStatus() {
  updateStatusDisplay({ loading: true });
  
  try {
    // Get GTM detection data
    const gtmResult = await ContentScriptInterface.sendMessage('checkGTM');
    
    // Get tag data
    const tagResult = await ContentScriptInterface.sendMessage('getTagStatus');
    
    // Combine the results - tagResult is now an object with tags array and metadata
    const result = {
      ...gtmResult,
      tags: tagResult?.tags || [],
      totalTags: tagResult?.totalTags || 0,
      allowedTags: tagResult?.allowedTags || 0,
      blockedTags: tagResult?.blockedTags || 0,
      consentState: tagResult?.consentState || gtmResult?.consentState,
      simulationMode: tagResult?.simulationMode || false
    };
    
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
    
    // Enhanced consent mode handling with CMP info
    if (result.hasConsentMode) {
      const analytics = result.consentState?.analytics_storage || 'unknown';
      const ads = result.consentState?.ad_storage || 'unknown';
      
      // Add CMP information if available
      let cmpInfo = '';
      if (result.cmpInfo && result.cmpInfo.type !== 'none') {
        cmpInfo = ` (${result.cmpInfo.name})`;
      }
      
      // Determine status based on consent state
      const hasRestrictedConsent = analytics === 'denied' || ads === 'denied';
      const hasFullConsent = analytics === 'granted' && ads === 'granted';
      
      if (hasRestrictedConsent) {
        consentModeStatus.textContent = `⚠️ Consent Mode${cmpInfo}`;
        consentModeStatus.className = 'status restricted';
      } else if (hasFullConsent) {
        consentModeStatus.textContent = `✅ Consent Mode${cmpInfo}`;
        consentModeStatus.className = 'status found';
      } else {
        consentModeStatus.textContent = `ℹ️ Consent Mode${cmpInfo}`;
        consentModeStatus.className = 'status found';
      }
      
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
  
  // Enhanced consent mode display with CMP info
  if (result?.hasConsentMode) {
    let consentText = 'Active';
    if (result.cmpInfo && result.cmpInfo.type !== 'none') {
      consentText = `Active (${result.cmpInfo.name})`;
    }
    document.getElementById('overviewConsentValue').textContent = consentText;
    document.getElementById('overviewConsentValue').className = 'value detected';
  } else if (result?.hasGTM) {
    document.getElementById('overviewConsentValue').textContent = 'Not Implemented';
    document.getElementById('overviewConsentValue').className = 'value not-detected';
  } else {
    document.getElementById('overviewConsentValue').textContent = 'N/A';
    document.getElementById('overviewConsentValue').className = 'value';
  }
  
  // Use the correct data structure from tagResult
  if (result?.totalTags !== undefined) {
    document.getElementById('totalTagsFound').textContent = result.totalTags;
    
    // Handle tags blocked based on consent mode
    if (result.hasConsentMode) {
      document.getElementById('totalTagsBlocked').textContent = result.blockedTags;
    } else {
      document.getElementById('totalTagsBlocked').textContent = 'Consent Mode Not Implemented';
    }
  } else if (result?.tags) {
    // Fallback to old format if needed
    document.getElementById('totalTagsFound').textContent = result.tags.length;
    
    if (result.hasConsentMode) {
      const blockedTags = result.tags.filter(tag => !tag.allowed).length;
      document.getElementById('totalTagsBlocked').textContent = blockedTags;
    } else {
      document.getElementById('totalTagsBlocked').textContent = 'Consent Mode Not Implemented';
    }
  } else {
    document.getElementById('totalTagsFound').textContent = '0';
    document.getElementById('totalTagsBlocked').textContent = 'N/A';
  }
}

function enableConsentSimulator(enabled) {
  const consentTab = document.getElementById('consent-tab');
  const applyButton = document.getElementById('applyConsent');
  const consentSelects = document.querySelectorAll('.consent-select');
  const presetButtons = document.querySelectorAll('.dropdown-item[data-preset]');
  
  if (!consentTab) {
    console.warn('Consent tab not found, cannot enable/disable simulator');
    return;
  }
  
  if (enabled) {
    // Remove disabled overlay if it exists
    const overlay = consentTab.querySelector('.disabled-overlay');
    if (overlay && overlay.parentNode) {
      overlay.remove();
    }
    
    // Enable controls
    if (applyButton) {
      applyButton.disabled = false;
      applyButton.textContent = '⚡ Apply Settings';
    }
    
    consentSelects.forEach(select => {
      if (select) {
        select.disabled = false;
        select.style.opacity = '1';
      }
    });
    
    presetButtons.forEach(button => {
      if (button) {
        button.disabled = false;
        button.style.opacity = '1';
      }
    });
    
  } else {
    // Disable all controls
    if (applyButton) {
      applyButton.disabled = true;
      applyButton.textContent = '❌ Consent Mode Not Available';
    }
    
    consentSelects.forEach(select => {
      if (select) {
        select.disabled = true;
        select.style.opacity = '0.5';
      }
    });
    
    presetButtons.forEach(button => {
      if (button) {
        button.disabled = true;
        button.style.opacity = '0.5';
      }
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
    
    // Fix: Check if the target element exists before using insertBefore
    const targetElement = consentTab.querySelector('.consent-categories');
    try {
      if (targetElement && targetElement.parentNode === consentTab) {
        consentTab.insertBefore(warningMsg, targetElement);
      } else {
        consentTab.appendChild(warningMsg);
      }
    } catch (error) {
      console.error('DOM insertion fallback:', error);
      consentTab.appendChild(warningMsg);
    }
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
  if (!tagList) {
    console.warn('Tag list element not found, cannot refresh tags');
    return;
  }
  
  tagList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const result = await ContentScriptInterface.sendMessage('getTagStatus');
    
    // Handle the new getTagStatus response structure
    if (result && result.success && result.tags) {
      updateTagDisplay(result.tags);
    } else if (Array.isArray(result)) {
      // Fallback for old format
      updateTagDisplay(result);
    } else {
      updateTagDisplay([]);
    }
  } catch (error) {
    console.error('Error refreshing tags:', error);
    if (tagList) {
      tagList.innerHTML = '<div class="tag-item empty-state">Error loading tags</div>';
    }
  }
}

function updateTagDisplay(tags) {
  const tagList = document.getElementById('tagList');
  
  if (!tagList) {
    console.warn('Tag list element not found, cannot update tag display');
    return;
  }
  
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

// Storage Helper Functions
const StorageManager = {
  async saveEvents(events) {
    try {
      // Encrypt sensitive event data
      const encryptedEvents = await EncryptionManager.encryptAndMark(events);
      await rateLimitedStorageSet({ gtmInspectorEvents: encryptedEvents });
    } catch (error) {
      if (error.message.includes('Rate limit exceeded')) {
        console.warn('Rate limit exceeded for event storage');
        showNotification('Too many events being saved. Please wait a moment.', 'warning');
      } else {
        console.error('Error saving events:', error);
        throw error;
      }
    }
  },
  
  async getEvents() {
    try {
      const result = await chrome.storage.local.get(['gtmInspectorEvents']);
      const events = result.gtmInspectorEvents || [];
      
      // Decrypt events if encrypted
      if (events.length > 0 && EncryptionManager.isEncrypted(events)) {
        return await EncryptionManager.decryptMarked(events) || [];
      }
      
      return events;
    } catch (error) {
      console.error('Error getting events:', error);
      return [];
    }
  },
  
  async clearOldEvents() {
    try {
      const events = await this.getEvents();
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
      const filteredEvents = events.filter(event => event.timestamp > twentyFourHoursAgo);
      
      if (filteredEvents.length !== events.length) {
        await this.saveEvents(filteredEvents);
      }
    } catch (error) {
      console.error('Error clearing old events:', error);
    }
  },
  
  async clearAllEvents() {
    try {
      await chrome.storage.local.remove(['gtmInspectorEvents']);
    } catch (error) {
      console.error('Error clearing all events:', error);
      throw error;
    }
  }
};

// Encryption utilities for sensitive data
const EncryptionManager = {
  // Generate a secure encryption key (derived from extension ID)
  async getEncryptionKey() {
    const manifest = chrome.runtime.getManifest();
    const extensionId = chrome.runtime.id;
    
    // Create a deterministic key from extension ID
    const encoder = new TextEncoder();
    const data = encoder.encode(extensionId + manifest.version);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const key = hashArray.slice(0, 32); // Use first 32 bytes for AES-256
    
    return crypto.subtle.importKey(
      'raw',
      new Uint8Array(key),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  },
  
  // Encrypt sensitive data
  async encryptData(data) {
    try {
      const key = await this.getEncryptionKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(JSON.stringify(data));
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedData
      );
      
      const encryptedArray = new Uint8Array(encryptedBuffer);
      const combined = new Uint8Array(iv.length + encryptedArray.length);
      combined.set(iv);
      combined.set(encryptedArray, iv.length);
      
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      return null;
    }
  },
  
  // Decrypt sensitive data
  async decryptData(encryptedData) {
    try {
      const key = await this.getEncryptionKey();
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );
      
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );
      
      const decoder = new TextDecoder();
      const decryptedString = decoder.decode(decryptedBuffer);
      
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  },
  
  // Check if data is encrypted
  isEncrypted(data) {
    return typeof data === 'string' && data.startsWith('ENCRYPTED:');
  },
  
  // Encrypt and mark data
  async encryptAndMark(data) {
    const encrypted = await this.encryptData(data);
    return encrypted ? `ENCRYPTED:${encrypted}` : data;
  },
  
  // Decrypt marked data
  async decryptMarked(data) {
    if (this.isEncrypted(data)) {
      const encryptedPart = data.replace('ENCRYPTED:', '');
      return await this.decryptData(encryptedPart);
    }
    return data;
  }
};

// Enhanced refreshEvents function with storage integration
async function refreshEvents() {
  try {
    // Show loading state
    const eventList = document.getElementById('eventLog');
    if (eventList) {
      eventList.innerHTML = '<div class="loading">Loading events...</div>';
    }
    
    // Get events from content script (which now includes storage events)
    const events = await ContentScriptInterface.sendMessage('getEvents');
    
    if (Array.isArray(events)) {
          updateEventDisplay(events);
      
      // Clean up old events periodically
      if (Math.random() < 0.1) { // 10% chance to run cleanup
        StorageManager.clearOldEvents();
      }
    } else {
      console.error('Invalid events response:', events);
      if (eventList) {
        eventList.innerHTML = '<div class="no-events">Error loading events</div>';
      }
    }
  } catch (error) {
    logErrorSafely(error, 'refreshEvents');
    const eventList = document.getElementById('eventLog');
    if (eventList) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'no-events';
      errorDiv.textContent = getUserFriendlyError(error);
      eventList.appendChild(errorDiv);
    }
  }
}

// Enhanced clearEventLog function
async function clearEventLog() {
  try {
    // Clear from storage
    await StorageManager.clearAllEvents();
    
    // Clear from content script
    await ContentScriptInterface.sendMessage('clearEventLog');
    
    // Update display
    const eventList = document.getElementById('eventLog');
    if (eventList) {
      const clearedDiv = document.createElement('div');
      clearedDiv.className = 'event-item empty-state';
      clearedDiv.textContent = 'Event log cleared';
      eventList.appendChild(clearedDiv);
    }
    
    showNotification('Event log cleared successfully', 'success');
  } catch (error) {
    logErrorSafely(error, 'clearEventLog');
    showNotification('Failed to clear event log', 'error');
  }
}

// Enhanced event logging with simulation support
function updateEventDisplay(events) {
  const eventList = document.getElementById('eventLog');
  if (!eventList) return;
  
  eventList.innerHTML = '';
  
  if (!events || events.length === 0) {
    const noEventsDiv = document.createElement('div');
    noEventsDiv.className = 'no-events';
    noEventsDiv.textContent = 'No events logged yet';
    eventList.appendChild(noEventsDiv);
    return;
  }
  
  // Separate real and simulated events
  const realEvents = events.filter(event => !event.isSimulated);
  const simulatedEvents = events.filter(event => event.isSimulated);
  
  // Show simulation context if in simulation mode
  if (simulationManager && simulationManager.isSimulationMode()) {
    const simulationContext = createSimulationContextElement();
    eventList.appendChild(simulationContext);
  }
  
  // Display real events section
  if (realEvents.length > 0) {
    const realEventsHeader = document.createElement('div');
    realEventsHeader.className = 'events-section-header real-events';
    realEventsHeader.innerHTML = `<h3>📊 Real Events (${realEvents.length})</h3>`;
    eventList.appendChild(realEventsHeader);
    
    realEvents.forEach(event => {
    const eventElement = createEventElement(event);
      eventElement.classList.add('real-event');
    eventList.appendChild(eventElement);
  });
  }
  
  // Display simulated events section
  if (simulatedEvents.length > 0) {
    const simulatedEventsHeader = document.createElement('div');
    simulatedEventsHeader.className = 'events-section-header simulated-events';
    simulatedEventsHeader.innerHTML = `<h3>🧪 Simulated Events (${simulatedEvents.length})</h3>`;
    eventList.appendChild(simulatedEventsHeader);
    
    simulatedEvents.forEach(event => {
      const eventElement = createEventElement(event);
      eventElement.classList.add('simulated-event');
      eventList.appendChild(eventElement);
    });
  }
  
  // Show event count and last updated
  const eventSummary = document.createElement('div');
  eventSummary.className = 'event-summary';
  eventSummary.innerHTML = `
    <div class="event-counts">
      <span class="real-count">📊 ${realEvents.length} real events</span>
      <span class="simulated-count">🧪 ${simulatedEvents.length} simulated events</span>
    </div>
    <div class="last-updated">Last updated: ${new Date().toLocaleTimeString()}</div>
  `;
  eventList.appendChild(eventSummary);
}

function createSimulationContextElement() {
  const contextDiv = document.createElement('div');
  contextDiv.className = 'simulation-context';
  
  const simulatedConsent = simulationManager.getCurrentConsentState();
  const consentSummary = Object.entries(simulatedConsent)
    .map(([key, value]) => `${key}: ${value === 'granted' ? '✅' : '❌'}`)
    .join(', ');
  
  contextDiv.innerHTML = `
    <div class="simulation-context-header">
      <h3>🧪 Simulation Mode Active</h3>
      <button class="close-context" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
    <div class="simulation-context-body">
      <p><strong>Simulated Consent:</strong> ${consentSummary}</p>
      <p><strong>Impact:</strong> Tags will behave as if consent is set to these values</p>
    </div>
  `;
  
  return contextDiv;
}

function createEventElement(event) {
  const eventDiv = document.createElement('div');
  eventDiv.className = 'event-item';
  
  // Add source-specific styling
  if (event.source) {
    eventDiv.classList.add(`source-${event.source}`);
  }
  
  const timestamp = new Date(event.timestamp).toLocaleTimeString();
  
  // Handle different event formats
  let eventType = event.type || event.tagType || 'unknown';
  let eventName = event.tagName || event.name || 'Event';
  let eventData = event.data || event;
  
  // Determine if this is a consent or GTM event
  let category = 'other';
  if (eventType.includes('consent') || eventType.includes('Cookiebot') || event.source === 'consent_state') {
    category = 'consent';
  } else if (eventType.includes('gtag') || eventType.includes('dataLayer') || eventType.includes('tag') || event.source === 'tag_detection') {
    category = 'gtm';
  }
  
  // Add impact analysis for tag detection events
  let impactAnalysis = '';
  if (event.impactDescription && event.impactIcon) {
    impactAnalysis = `
      <div class="impact-analysis ${event.impactSeverity || 'info'}">
        <span class="impact-icon">${event.impactIcon}</span>
        <span class="impact-description">${event.impactDescription}</span>
      </div>
    `;
  }
  
  // Add simulation analysis if in simulation mode
  let simulationAnalysis = '';
  if (simulationManager && simulationManager.isSimulationMode() && !event.isSimulated) {
    simulationAnalysis = analyzeEventInSimulation(event);
  }
  
  eventDiv.innerHTML = `
    <div class="event-header">
      <span class="event-time">${timestamp}</span>
      <span class="event-type ${category}">${eventName}</span>
      ${event.source ? `<span class="event-source">${event.source}</span>` : ''}
    </div>
    <div class="event-details">
      <div class="event-info">
        <strong>Type:</strong> ${eventType}<br>
        <strong>Status:</strong> ${event.status || 'N/A'}<br>
        ${event.reason ? `<strong>Reason:</strong> ${event.reason}<br>` : ''}
        ${event.consentType ? `<strong>Consent Type:</strong> ${event.consentType}<br>` : ''}
        ${event.allowed !== undefined ? `<strong>Allowed:</strong> ${event.allowed ? 'Yes' : 'No'}<br>` : ''}
        ${event.url ? `<strong>URL:</strong> ${new URL(event.url).hostname}<br>` : ''}
      </div>
      ${impactAnalysis}
      ${simulationAnalysis}
    </div>
  `;
  
  return eventDiv;
}

function analyzeEventInSimulation(event) {
  const simulatedConsent = simulationManager.getCurrentConsentState();
  if (!simulatedConsent) return '';
  
  // Analyze consent events
  if (event.tagType === 'consent_change' || event.tagType === 'consent_status' || event.source === 'consent_state') {
    return `
      <div class="simulation-analysis">
        <span class="simulation-label">🧪 Simulation:</span>
        <span class="simulation-result would-fire">
          🟢 Consent Event
        </span>
      </div>
    `;
  }
  
  // Analyze tag detection events
  if (event.source === 'tag_detection' || event.tagType === 'analytics' || event.tagType === 'advertising') {
    const consentRequired = getTagConsentRequirements(event);
    const wouldFire = checkConsentRequirements(consentRequired, simulatedConsent);
    
    return `
      <div class="simulation-analysis">
        <span class="simulation-label">🧪 Simulation:</span>
        <span class="simulation-result ${wouldFire ? 'would-fire' : 'would-block'}">
          ${wouldFire ? '🟢 Would Fire' : '🔴 Would Be Blocked'}
        </span>
        <span class="consent-requirements">
          Requires: ${Object.entries(consentRequired).map(([k, v]) => `${k}: ${v}`).join(', ')}
        </span>
      </div>
    `;
  }
  
  return '';
}

function checkConsentRequirements(required, available) {
  // Check if all required consent types are granted
  for (const [consentType, requiredValue] of Object.entries(required)) {
    if (requiredValue === 'granted' && available[consentType] !== 'granted') {
      return false;
    }
  }
  return true;
}

function getTagConsentRequirements(tagData) {
  // Default consent requirements based on tag type
  const tagType = tagData.tagType || tagData.type || 'unknown';
  
  if (tagType === 'analytics' || tagType.includes('analytics')) {
    return { analytics_storage: 'granted' };
  } else if (tagType === 'advertising' || tagType.includes('advertising') || tagType.includes('marketing')) {
    return { ad_storage: 'granted' };
  } else if (tagType === 'functionality' || tagType.includes('functionality')) {
    return { functionality_storage: 'granted' };
  } else if (tagType === 'personalization' || tagType.includes('personalization')) {
    return { personalization_storage: 'granted' };
  }
  
  // Default to analytics only
  return { analytics_storage: 'granted' };
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

async function runDiagnostics() {
  showNotification('Running comprehensive diagnostics...', 'info');
  
  chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
    if (tabs[0]) {
      const tab = tabs[0];
      
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        showNotification('Cannot run on system pages', 'error');
        return;
      }
      
      try {
        // Run comprehensive diagnostics
        const diagnosticResult = await ContentScriptInterface.sendMessage('runDiagnostics');
        
        if (diagnosticResult && diagnosticResult.success) {
          // Display diagnostic results
          displayDiagnosticResults(diagnosticResult.data);
          showNotification('Diagnostics completed! Check results below.', 'success');
        } else {
          showNotification('Diagnostics failed: ' + (diagnosticResult?.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        showNotification('Diagnostics error: ' + error.message, 'error');
      }
    }
  });
}

function displayDiagnosticResults(diagnostics) {
  // Create diagnostic results display
  const overviewTab = document.getElementById('overview-tab');
  
  // Check if overview tab exists
  if (!overviewTab) {
    console.warn('Overview tab not found, cannot display diagnostic results');
    showNotification('Cannot display diagnostic results - overview tab not found', 'error');
    return;
  }
  
  // Remove existing diagnostic results if any
  const existingResults = overviewTab.querySelector('.diagnostic-results');
  if (existingResults) {
    existingResults.remove();
  }
  
  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'diagnostic-results';
  resultsDiv.style.cssText = `
    margin-top: 20px;
    padding: 15px;
    background: #2d3748;
    color: #e2e8f0;
    border-radius: 8px;
    border-left: 4px solid #007bff;
    font-size: 13px;
  `;
  
  let resultsHTML = '<h3 style="margin: 0 0 15px 0; color: #ffffff;">🔍 Diagnostic Results</h3>';
  
  // GTM Diagnostics
  resultsHTML += '<div style="margin-bottom: 15px;"><strong style="color: #ffffff;">GTM Status:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
  if (diagnostics.gtm) {
    resultsHTML += `<li style="margin: 3px 0;">✅ GTM Container: ${diagnostics.gtm.containerId || 'Not found'}</li>`;
    resultsHTML += `<li style="margin: 3px 0;">✅ DataLayer: ${diagnostics.gtm.dataLayer ? 'Available' : 'Not found'}</li>`;
    resultsHTML += `<li style="margin: 3px 0;">✅ gtag Function: ${diagnostics.gtm.gtag ? 'Available' : 'Not found'}</li>`;
    resultsHTML += `<li style="margin: 3px 0;">✅ GTM Object: ${diagnostics.gtm.gtmObject ? 'Available' : 'Not found'}</li>`;
  } else {
    resultsHTML += '<li style="margin: 3px 0;">❌ GTM not detected</li>';
  }
  resultsHTML += '</ul></div>';
  
  // Consent Mode Diagnostics
  resultsHTML += '<div style="margin-bottom: 15px;"><strong style="color: #ffffff;">Consent Mode:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
  if (diagnostics.consent) {
    resultsHTML += `<li style="margin: 3px 0;">✅ Consent Mode: ${diagnostics.consent.enabled ? 'Enabled' : 'Disabled'}</li>`;
    if (diagnostics.consent.cmp) {
      resultsHTML += `<li style="margin: 3px 0;">✅ CMP Detected: ${diagnostics.consent.cmp.name} (${diagnostics.consent.cmp.type})</li>`;
    }
    if (diagnostics.consent.state) {
      resultsHTML += `<li style="margin: 3px 0;">✅ Current State: Analytics=${diagnostics.consent.state.analytics_storage}, Ads=${diagnostics.consent.state.ad_storage}</li>`;
    }
  } else {
    resultsHTML += '<li style="margin: 3px 0;">❌ Consent Mode not detected</li>';
  }
  resultsHTML += '</ul></div>';
  
  // Tag Diagnostics
  resultsHTML += '<div style="margin-bottom: 15px;"><strong style="color: #ffffff;">Tags Found:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
  if (diagnostics.tags && diagnostics.tags.length > 0) {
    diagnostics.tags.forEach(tag => {
      const status = tag.allowed ? '✅' : '❌';
      resultsHTML += `<li style="margin: 3px 0;">${status} ${tag.name} (${tag.type}) - ${tag.allowed ? 'Allowed' : 'Blocked'}</li>`;
    });
  } else {
    resultsHTML += '<li style="margin: 3px 0;">❌ No tags detected</li>';
  }
  resultsHTML += '</ul></div>';
  
  // Issues and Recommendations
  resultsHTML += '<div style="margin-bottom: 15px;"><strong style="color: #ffffff;">Issues & Recommendations:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
  if (diagnostics.issues && diagnostics.issues.length > 0) {
    diagnostics.issues.forEach(issue => {
      resultsHTML += `<li style="margin: 3px 0; color: #fbbf24;">⚠️ ${issue}</li>`;
    });
  } else {
    resultsHTML += '<li style="margin: 3px 0; color: #10b981;">✅ No issues detected</li>';
  }
  resultsHTML += '</ul></div>';
  
  resultsHTML += `<div style="font-size: 11px; color: #a0aec0; margin-top: 10px; border-top: 1px solid #4a5568; padding-top: 10px;">
    Diagnostic run at: ${new Date().toLocaleTimeString()}
  </div>`;
  
  resultsDiv.innerHTML = resultsHTML;
  overviewTab.appendChild(resultsDiv);
}

function showNotification(message, type = 'info') {
  // Simple notification - you can enhance this later
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Enhanced HTML sanitization function
function sanitizeHtml(html) {
  // Create a temporary div to parse and clean HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Remove all script tags and event handlers
  const scripts = tempDiv.querySelectorAll('script');
  scripts.forEach(script => script.remove());
  
  // Remove event handlers from all elements
  const allElements = tempDiv.querySelectorAll('*');
  allElements.forEach(element => {
    const attrs = element.attributes;
    for (let i = attrs.length - 1; i >= 0; i--) {
      const attr = attrs[i];
      if (attr.name.startsWith('on')) { // Remove event handlers
        element.removeAttribute(attr.name);
      }
    }
  });
  
  return tempDiv.innerHTML;
}

// Safe innerHTML function
function safeInnerHTML(element, html) {
  if (typeof html === 'string') {
    element.innerHTML = sanitizeHtml(html);
  } else {
    element.textContent = String(html);
  }
}

// Secure error handling utility
function handleErrorSafely(error, context = '') {
  // Log full error for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.error(`Error in ${context}:`, error);
  } else {
    // In production, only log error type and context
    console.error(`Error in ${context}:`, error.name || 'Unknown error');
  }
  
  // Return user-friendly error message
  return {
    success: false,
    error: 'An unexpected error occurred. Please try again.',
    errorCode: error.name || 'UNKNOWN_ERROR'
  };
}

// Secure error message for users
function getUserFriendlyError(error) {
  const errorMap = {
    'NetworkError': 'Network connection failed. Please check your internet connection.',
    'TimeoutError': 'Request timed out. Please try again.',
    'PermissionError': 'Permission denied. Please check extension permissions.',
    'NotFoundError': 'Resource not found. Please refresh the page.',
    'QuotaExceededError': 'Storage limit reached. Please clear some data.',
    'TypeError': 'Invalid operation. Please try again.',
    'ReferenceError': 'Configuration error. Please restart the extension.',
    'SyntaxError': 'Data format error. Please refresh the page.',
    'RangeError': 'Invalid input. Please check your settings.',
    'URIError': 'Invalid URL. Please check the website address.',
    'EvalError': 'Script execution error. Please refresh the page.',
    'InternalError': 'Internal error. Please restart the extension.',
    'AggregateError': 'Multiple errors occurred. Please try again.',
    'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again.'
  };
  
  return errorMap[error.name] || errorMap['UNKNOWN_ERROR'];
}

// Safe error logging
function logErrorSafely(error, context = '') {
  const errorInfo = {
    name: error.name || 'UnknownError',
    message: error.message || 'No message',
    context: context,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    extensionVersion: chrome.runtime.getManifest().version
  };
  
  // Log sanitized error info
  console.error('Extension Error:', {
    name: errorInfo.name,
    context: errorInfo.context,
    timestamp: errorInfo.timestamp
  });
  
  return errorInfo;
}

// Production-safe logging configuration
const LOG_CONFIG = {
  // Set to false for production
  debugMode: false,
  
  // Log levels: 'error', 'warn', 'info', 'debug'
  logLevel: 'error',
  
  // Environment detection
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};

// Secure logging utility
function secureLog(message, level = 'info', context = '') {
  // Only log if debug mode is enabled and level is appropriate
  if (!LOG_CONFIG.debugMode) {
    return;
  }
  
  // In production, only log errors and warnings
  if (LOG_CONFIG.isProduction && level === 'debug') {
    return;
  }
  
  // Sanitize the message
  const sanitizedMessage = sanitizeLogMessage(message);
  const timestamp = new Date().toISOString();
  
  // Log with appropriate level
  switch (level) {
    case 'error':
      console.error(`[GTM Inspector] [${timestamp}] ${context}: ${sanitizedMessage}`);
      break;
    case 'warn':
      console.warn(`[GTM Inspector] [${timestamp}] ${context}: ${sanitizedMessage}`);
      break;
    case 'info':
      console.info(`[GTM Inspector] [${timestamp}] ${context}: ${sanitizedMessage}`);
      break;
    case 'debug':
      console.debug(`[GTM Inspector] [${timestamp}] ${context}: ${sanitizedMessage}`);
      break;
    default:
      console.log(`[GTM Inspector] [${timestamp}] ${context}: ${sanitizedMessage}`);
  }
}

// Sanitize log messages to prevent sensitive data exposure
function sanitizeLogMessage(message) {
  if (typeof message !== 'string') {
    return '[Object]';
  }
  
  // Remove sensitive patterns
  const sensitivePatterns = [
    /https?:\/\/[^\s]+/g,  // URLs
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,  // Email addresses
    /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,  // Credit card numbers
    /[A-Z]{2}\d{2}[A-Z0-9]{10,30}/g,  // IBAN
    /[A-Z]{3}\d{6}/g,  // Passport numbers
    /chrome-extension:\/\/[^\s]+/g,  // Extension URLs
    /moz-extension:\/\/[^\s]+/g,  // Firefox extension URLs
  ];
  
  let sanitized = message;
  sensitivePatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  
  return sanitized;
}

// Rate Limiting Implementation
class RateLimiter {
  constructor() {
    this.operations = new Map();
    this.defaultLimits = {
      storage: { max: 10, window: 60000 }, // 10 operations per minute
      messages: { max: 20, window: 60000 }, // 20 messages per minute
      events: { max: 50, window: 60000 },   // 50 events per minute
      consent: { max: 5, window: 60000 }    // 5 consent changes per minute
    };
  }

  isAllowed(operation, key = 'default') {
    const limit = this.defaultLimits[operation] || this.defaultLimits.messages;
    const now = Date.now();
    const keyName = `${operation}_${key}`;
    
    if (!this.operations.has(keyName)) {
      this.operations.set(keyName, []);
    }
    
    const operations = this.operations.get(keyName);
    
    // Remove old operations outside the window
    const validOperations = operations.filter(time => now - time < limit.window);
    this.operations.set(keyName, validOperations);
    
    // Check if we're under the limit
    if (validOperations.length < limit.max) {
      validOperations.push(now);
      this.operations.set(keyName, validOperations);
      return true;
    }
    
    return false;
  }

  getRemainingTime(operation, key = 'default') {
    const limit = this.defaultLimits[operation] || this.defaultLimits.messages;
    const keyName = `${operation}_${key}`;
    const operations = this.operations.get(keyName) || [];
    const now = Date.now();
    
    if (operations.length === 0) return 0;
    
    const oldestOperation = Math.min(...operations);
    return Math.max(0, limit.window - (now - oldestOperation));
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

// Rate-limited storage operations
async function rateLimitedStorageSet(data) {
  if (!rateLimiter.isAllowed('storage')) {
    const remainingTime = rateLimiter.getRemainingTime('storage');
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(remainingTime / 1000)} seconds.`);
  }
  
  return await chrome.storage.local.set(data);
}

// Rate-limited message sending
async function rateLimitedSendMessage(message) {
  if (!rateLimiter.isAllowed('messages')) {
    const remainingTime = rateLimiter.getRemainingTime('messages');
    throw new Error(`Message rate limit exceeded. Try again in ${Math.ceil(remainingTime / 1000)} seconds.`);
  }
  
  return await chrome.runtime.sendMessage(message);
}