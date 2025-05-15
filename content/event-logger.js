// src/content/event-logger.js
// Module for logging events from dataLayer and tag actions

/**
 * Logs events from GTM dataLayer, gtag calls, and tag execution
 */
export class EventLogger {
  constructor() {
    this.events = [];
    this.originalHandlers = {
      dataLayerPush: null
    };
    this.maxEvents = 1000;
  }
  
  /**
   * Initialize event logging
   */
  init() {
    // Only set up if not already done
    if (this.originalHandlers.dataLayerPush !== null) return;
    
    // Set up dataLayer monitoring
    if (window.dataLayer) {
      this.setupDataLayerObserver();
    }
  }
  
  /**
   * Set up observer for dataLayer.push events
   */
  setupDataLayerObserver() {
    // Store the original dataLayer.push method
    this.originalHandlers.dataLayerPush = window.dataLayer.push;
    
    // Override dataLayer.push to log events
    window.dataLayer.push = (...args) => {
      // Call the original push method
      const result = this.originalHandlers.dataLayerPush.apply(window.dataLayer, args);
      
      // Log the event
      try {
        const event = args[0];
        
        // Skip internal GTM events
        if (typeof event === 'object' && !Array.isArray(event) && event.event && 
            !event.event.startsWith('gtm.')) {
          this.logEvent(
            'dataLayer.push', 
            'gtm',
            `Event: ${event.event}, Data: ${JSON.stringify(event).substring(0, 100)}...`
          );
        }
        
        // Log consent events specifically
        if (Array.isArray(event) && event[0] === 'consent') {
          this.logEvent(
            'Consent Update', 
            'consent', 
            `Action: ${event[1]}, Settings: ${JSON.stringify(event[2])}`
          );
        }
      } catch (e) {
        console.error('Error logging dataLayer event:', e);
      }
      
      return result;
    };
  }
  
  /**
   * Log an event with timestamp and details
   * 
   * @param {string} type - Event type
   * @param {string} category - Event category (consent, gtm, tag)
   * @param {string} details - Event details
   */
  logEvent(type, category, details) {
    const event = {
      timestamp: new Date().getTime(),
      type,
      category,
      details
    };
    
    this.events.push(event);
    
    // Limit event log size
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }
  
  /**
   * Get all logged events
   * 
   * @returns {Array} Array of event objects
   */
  getEvents() {
    return this.events;
  }
  
  /**
   * Clear all logged events
   * 
   * @returns {boolean} Success status
   */
  clearEvents() {
    this.events = [];
    return true;
  }
}