// src/content/index.js
// Main entry point for content script functionality

import { GTMDetector } from './gtm-detector';
import { ConsentManager } from './consent-manager';
import { TagMonitor } from './tag-monitor';
import { EventLogger } from './event-logger';
import { QATester } from './qa-tester';
import { OverlayUI } from './overlay-ui';
import { MessageHandler } from './message-handler';

/**
 * Initializes the GTM Consent Inspector.
 * This is the main entry point for the content script.
 */
class ConsentInspector {
  constructor() {
    this.initialized = false;
    this.overlayVisible = false;
    
    // Initialize the components
    this.detector = new GTMDetector();
    this.eventLogger = new EventLogger();
    this.consentManager = new ConsentManager(this.eventLogger);
    this.tagMonitor = new TagMonitor(this.eventLogger);
    this.qaTester = new QATester(this.consentManager, this.tagMonitor);
    this.overlay = new OverlayUI(
      this.detector, 
      this.consentManager,
      this.tagMonitor,
      this.eventLogger
    );
    
    // Initialize the message handler
    this.messageHandler = new MessageHandler(
      this.detector,
      this.consentManager,
      this.tagMonitor,
      this.eventLogger,
      this.qaTester,
      this.overlay
    );
  }
  
  /**
   * Initialize the inspector functionality
   */
  init() {
    if (this.initialized) return;
    
    // First detect if GTM is present
    const gtmInfo = this.detector.detect();
    
    if (gtmInfo.gtmDetected) {
      // Initialize event logging
      this.eventLogger.init();
      
      // Set up consent monitoring
      this.consentManager.init();
      
      // Set up tag monitoring
      this.tagMonitor.init(gtmInfo.gtmId);
    }
    
    // Initialize the message handler
    this.messageHandler.init();
    
    this.initialized = true;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const inspector = new ConsentInspector();
  inspector.init();
  
  // Store the inspector in window for debugging purposes
  window.ConsentInspector = inspector;
});