// src/shared/messaging.js
// Utilities for message passing between components

/**
 * Message action types
 */
export const MESSAGE_ACTIONS = {
  CHECK_GTM: 'checkGTM',
  APPLY_CONSENT: 'applyConsent',
  GET_TAG_STATUS: 'getTagStatus',
  GET_EVENT_LOG: 'getEventLog',
  CLEAR_EVENT_LOG: 'clearEventLog',
  RUN_CONSENT_TEST: 'runConsentTest',
  RUN_TAG_TEST: 'runTagTest',
  TOGGLE_OVERLAY: 'toggleOverlay'
};

/**
 * Send a message to the active tab's content script
 * 
 * @param {Object} message - Message to send
 * @returns {Promise} Promise resolving with the response
 */
export function sendToContentScript(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        reject(new Error('No active tab found'));
        return;
      }
      
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        resolve(response);
      });
    });
  });
}

/**
 * Execute script in the active tab
 * 
 * @param {Function} func - Function to execute
 * @param {Array} args - Arguments to pass to the function
 * @returns {Promise} Promise resolving with the result
 */
export function executeInTab(func, args = []) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        reject(new Error('No active tab found'));
        return;
      }
      
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: func,
        args: args
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (!results || !results[0]) {
          reject(new Error('No results returned'));
          return;
        }
        
        resolve(results[0].result);
      });
    });
  });
}