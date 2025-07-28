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
      analytics_storage: 'granted',
      ad_storage: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
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
      this.simulatedConsent = { ...this.simulatedConsent, ...result.simulatedConsent };
    } catch (error) {
      console.error('Failed to load simulation state:', error);
    }
  }
  
  async saveState() {
    try {
      await chrome.storage.local.set({
        simulationMode: this.simulationMode,
        simulatedConsent: this.simulatedConsent
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
        });
      }
    });
    
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.currentTarget.dataset.preset;
        this.applyPreset(preset);
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
      console.log('Content script not available for simulation update:', error);
    }
  }
  
  showNotification(message, type) {
    // Simple notification - you can enhance this
    console.log(`${type}: ${message}`);
  }
}

// Initialize simulation manager
let simulationManager;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize simulation manager first
  simulationManager = new SimulationManager();
  
  // Then initialize other components
  initializeTabs();
  initializeButtons();
  
  // Load initial data
  checkGTMStatus();
  refreshEvents();
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
  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', clearEventLog);
  }
  if (exportLogBtn) {
    exportLogBtn.addEventListener('click', exportEventLog);
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
    
    // Combine the results
    const result = {
      ...gtmResult,
      tags: Array.isArray(tagResult) ? tagResult : []
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
        consentModeStatus.textContent = `⚠️ Consent Mode${cmpInfo}: Analytics=${analytics}, Ads=${ads}`;
        consentModeStatus.className = 'status restricted';
      } else if (hasFullConsent) {
        consentModeStatus.textContent = `✅ Consent Mode${cmpInfo}: Analytics=${analytics}, Ads=${ads}`;
        consentModeStatus.className = 'status found';
      } else {
        consentModeStatus.textContent = `ℹ️ Consent Mode${cmpInfo}: Analytics=${analytics}, Ads=${ads}`;
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
  
  if (result?.tags) {
    document.getElementById('totalTagsFound').textContent = result.tags.length;
    
    // Handle tags blocked based on consent mode
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
    
    // Fix: Check if the target element exists before using insertBefore
    const targetElement = consentTab.querySelector('.consent-categories');
    if (targetElement) {
      consentTab.insertBefore(warningMsg, targetElement);
    } else {
      // Fallback: append to the end of the consent tab
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

function refreshEvents() {
  console.log('🔄 Refreshing events...');
  
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getEvents' }, function(response) {
        console.log('📋 Events response:', response);
        
        if (chrome.runtime.lastError) {
          console.error('❌ Error getting events:', chrome.runtime.lastError);
          updateEventDisplay([]);
          return;
        }
        
        if (response && response.success !== false) {
          // Handle both array format and object format
          const events = Array.isArray(response) ? response : (response.events || []);
          console.log('📋 Processing events:', events);
          updateEventDisplay(events);
        } else {
          console.warn('⚠️ No events data received');
          updateEventDisplay([]);
        }
      });
    } else {
      console.error('❌ No active tab found');
      updateEventDisplay([]);
    }
  });
}

// Enhanced event logging with simulation support
function updateEventDisplay(events) {
  const eventList = document.getElementById('eventLog');
  if (!eventList) return;
  
  eventList.innerHTML = '';
  
  if (!events || events.length === 0) {
    eventList.innerHTML = '<div class="no-events">No events logged yet</div>';
    return;
  }
  
  events.forEach(event => {
    const eventElement = createEventElement(event);
    eventList.appendChild(eventElement);
  });
}

function createEventElement(event) {
  const eventDiv = document.createElement('div');
  eventDiv.className = 'event-item';
  
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
  
  // Add simulation analysis if in simulation mode
  let simulationAnalysis = '';
  if (simulationManager && simulationManager.isSimulationMode()) {
    simulationAnalysis = analyzeEventInSimulation(event);
  }
  
  eventDiv.innerHTML = `
    <div class="event-header">
      <span class="event-time">${timestamp}</span>
      <span class="event-type ${category}">${eventName}</span>
      ${simulationAnalysis}
    </div>
    <div class="event-details">
      <div class="event-info">
        <strong>Type:</strong> ${eventType}<br>
        <strong>Status:</strong> ${event.status || 'N/A'}<br>
        ${event.reason ? `<strong>Reason:</strong> ${event.reason}<br>` : ''}
        ${event.consentType ? `<strong>Consent Type:</strong> ${event.consentType}<br>` : ''}
        ${event.allowed !== undefined ? `<strong>Allowed:</strong> ${event.allowed ? 'Yes' : 'No'}<br>` : ''}
      </div>
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
  // Get current events from the display
  const eventItems = document.querySelectorAll('#eventLog .event-item:not(.empty-state)');
  
  if (eventItems.length === 0) {
    showNotification('No events to export', 'info');
    return;
  }
  
  // Convert displayed events to data
  const eventsToExport = Array.from(eventItems).map(item => {
    const timestamp = item.querySelector('span[style*="color: #666"]')?.textContent?.replace(/[\[\]]/g, '') || new Date().toLocaleTimeString();
    const status = item.querySelector('span[style*="background"]')?.textContent || 'Event';
    const name = item.querySelector('div[style*="font-weight: 600"]')?.textContent || 'Unknown Event';
    const reason = item.querySelector('div[style*="color: #666"]')?.textContent || '';
    
    return {
      timestamp: timestamp,
      status: status,
      name: name,
      reason: reason,
      category: item.dataset.eventType || 'other'
    };
  });
  
  // Create export data
  const exportData = {
    exportDate: new Date().toISOString(),
    website: window.location.href,
    totalEvents: eventsToExport.length,
    events: eventsToExport
  };
  
  // Create and download file
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gtm-consent-events-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showNotification('Event log exported successfully!', 'success');
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
  console.log(`${type.toUpperCase()}: ${message}`);
  // Simple notification - you can enhance this later
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}