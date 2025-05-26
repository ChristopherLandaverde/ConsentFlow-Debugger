/**
 * Background Service Worker for GTM Consent Mode Inspector
 * 
 * Handles extension installation and button click events
 */

// Handle extension installation or update
chrome.runtime.onInstalled.addListener(() => {
  console.log('GTM Consent Mode Inspector installed');
  
  // Initialize storage with default values
  chrome.storage.local.set({
    'showOverlay': false,
    'eventLog': []
  });
});

// Handle toolbar icon click - show overlay directly
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Send message to content script to toggle overlay
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
    console.log('✅ Overlay toggle message sent');
  } catch (error) {
    console.error('❌ Error toggling overlay:', error);
    
    // If content script isn't loaded, inject it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      
      // Try again after injection
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
        } catch (e) {
          console.error('Still failed after injection:', e);
        }
      }, 100);
    } catch (injectionError) {
      console.error('Failed to inject content script:', injectionError);
    }
  }
});