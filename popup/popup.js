
import { initializeTabs } from './tabs-manager.js';
import { 
  initializeConsentSimulator, 
  applyConsentPreset 
} from './consent-simulator.js';
import { 
  initializeTagList, 
  updateTagList, 
  refreshTagStatus 
} from './tag-list.js';
import { 
  initializeEventLogger, 
  updateEventLog, 
  refreshEventLog,
  clearEventLog,
  exportEventLog 
} from './event-logger.js';
import { 
  initializeQAPanel, 
  runConsentTest, 
  runTagTest 
} from './qa-panel.js';

// Initialize communication with content script
const contentScriptInterface = {
  // Execute function in content script context
  executeInPage: function(func, args = [], callback = null) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: func,
        args: args
      }, function(results) {
        if (callback && results && results[0]) {
          callback(results[0].result);
        }
      });
    });
  },
  
  // Standard request handler for content script communications
  sendRequest: function(action, data = {}, callback = null) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: action,
        data: data
      }, function(response) {
        if (callback) {
          callback(response);
        }
      });
    });
  }
};

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize tabs
  initializeTabs();
  
  // Initialize consent simulator
  initializeConsentSimulator(contentScriptInterface);
  
  // Initialize tag list
  initializeTagList(contentScriptInterface);
  
  // Initialize event logger
  initializeEventLogger(contentScriptInterface);
  
  // Initialize QA panel
  initializeQAPanel(contentScriptInterface);
  
  // Initialize the toggle overlay button
  document.getElementById('toggleOverlay').addEventListener('click', function() {
    contentScriptInterface.executeInPage(toggleOverlay);
  });
  
  // Check for GTM on current page
  checkGTMOnCurrentPage();
  
  // Set up periodic refresh of data
  setupPeriodicRefresh();
});

// Check if current page has GTM
function checkGTMOnCurrentPage() {
  contentScriptInterface.executeInPage(checkForGTM, [], function(result) {
    updateGTMStatusDisplay(result);
    
    // Initialize modules with data
    if (result.hasGTM) {
      updateTagList(result.tags);
      updateEventLog(result.events);
      updateConsentToggles(result.consentState);
    }
  });
}

// Update GTM status display
function updateGTMStatusDisplay(result) {
  const gtmStatusElement = document.getElementById('gtmStatus');
  const consentModeStatusElement = document.getElementById('consentModeStatus');
  
  if (result.hasGTM) {
    gtmStatusElement.textContent = `GTM Found: ${result.gtmId}`;
    gtmStatusElement.className = 'status found';
    
    if (result.hasConsentMode) {
      consentModeStatusElement.textContent = 'Consent Mode is active';
      consentModeStatusElement.className = 'status found';
    } else {
      consentModeStatusElement.textContent = 'Consent Mode not detected';
      consentModeStatusElement.className = 'status not-found';
    }
  } else {
    gtmStatusElement.textContent = 'GTM not detected on this page';
    gtmStatusElement.className = 'status not-found';
    consentModeStatusElement.textContent = 'Consent Mode not applicable';
    consentModeStatusElement.className = 'status not-found';
  }
}

// Set up periodic refresh
function setupPeriodicRefresh() {
  setInterval(function() {
    if (document.visibilityState === 'visible') {
      refreshTagStatus(contentScriptInterface);
      refreshEventLog(contentScriptInterface);
    }
  }, 5000);
}

// Content script functions to be exported to separate modules
// These will be moved to appropriate modules