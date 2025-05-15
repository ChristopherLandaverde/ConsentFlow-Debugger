// src/content/message-handler.js
// Module for handling message communication with the popup

/**
 * Handles message passing between content script and popup
 */
export class MessageHandler {
  /**
   * @param {GTMDetector} detector - GTM detector instance
   * @param {ConsentManager} consentManager - Consent manager instance
   * @param {TagMonitor} tagMonitor - Tag monitor instance
   * @param {EventLogger} eventLogger - Event logger instance
   * @param {QATester} qaTester - QA tester instance
   * @param {OverlayUI} overlay - Overlay UI instance
   */
  constructor(detector, consentManager, tagMonitor, eventLogger, qaTester, overlay) {
    this.detector = detector;
    this.consentManager = consentManager;
    this.tagMonitor = tagMonitor;
    this.eventLogger = eventLogger;
    this.qaTester = qaTester;
    this.overlay = overlay;
  }
  
  /**
   * Initialize message listener
   */
  init() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }
  
  /**
   * Handle messages from popup
   * 
   * @param {Object} request - Message request
   * @param {Object} sender - Message sender
   * @param {Function} sendResponse - Function to send response
   * @returns {boolean} Whether the response will be sent asynchronously
   */
  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'checkGTM':
        sendResponse(this.getGTMInfo());
        break;
        
      case 'applyConsent':
        sendResponse(this.consentManager.applyConsentSettings(request.settings));
        break;
        
      case 'getTagStatus':
        const consentState = this.consentManager.getCurrentConsentState();
        sendResponse(this.tagMonitor.getTagStatus(consentState));
        break;
        
      case 'getEventLog':
        sendResponse(this.eventLogger.getEvents());
        break;
        
      case 'clearEventLog':
        sendResponse(this.eventLogger.clearEvents());
        break;
        
      case 'runConsentTest':
        sendResponse(this.consentManager.runConsentTest());
        break;
        
      case 'runTagTest':
        sendResponse(this.tagMonitor.runTagTest(
          this.consentManager.getCurrentConsentState.bind(this.consentManager)
        ));
        break;
        
      case 'toggleOverlay':
        this.overlay.toggle();
        sendResponse({success: true});
        break;
        
      default:
        sendResponse({error: 'Unknown action'});
    }
    
    return true; // Keeps the message channel open for async responses
  }
  
  /**
   * Get all GTM and consent information
   * 
   * @returns {Object} Combined GTM and consent information
   */
  getGTMInfo() {
    const detectionResults = this.detector.detect();
    const consentState = this.consentManager.getCurrentConsentState();
    const tags = this.tagMonitor.getTagStatus(consentState);
    const events = this.eventLogger.getEvents();
    
    return {
      hasGTM: detectionResults.gtmDetected,
      gtmId: detectionResults.gtmId,
      hasConsentMode: detectionResults.consentModeActive,
      consentState: consentState,
      tags: tags,
      events: events
    };
  }
}