// src/content/overlay-ui.js
// Module for creating and managing the overlay UI

/**
 * Creates and manages the overlay UI on the page
 */
export class OverlayUI {
  /**
   * @param {GTMDetector} detector - GTM detector instance
   * @param {ConsentManager} consentManager - Consent manager instance
   * @param {TagMonitor} tagMonitor - Tag monitor instance
   * @param {EventLogger} eventLogger - Event logger instance
   */
  constructor(detector, consentManager, tagMonitor, eventLogger) {
    this.detector = detector;
    this.consentManager = consentManager;
    this.tagMonitor = tagMonitor;
    this.eventLogger = eventLogger;
    this.visible = false;
  }
  
  /**
   * Toggle overlay visibility
   */
  toggle() {
    this.visible = !this.visible;
    
    let overlay = document.getElementById('gtm-consent-inspector-overlay');
    
    if (overlay) {
      overlay.style.display = this.visible ? 'block' : 'none';
    } else if (this.visible) {
      this.create();
    }
  }
  
  /**
   * Create the overlay element
   */
  create() {
    const overlay = document.createElement('div');
    overlay.id = 'gtm-consent-inspector-overlay';
    
    document.body.appendChild(overlay);
    this.update();
  }
  
  /**
   * Update the overlay content
   */
  update() {
    const overlay = document.getElementById('gtm-consent-inspector-overlay');
    if (!overlay) return;
    
    const consentState = this.consentManager.getCurrentConsentState();
    const tags = this.tagMonitor.getTagStatus(consentState);
    
    // Group tags by category
    const tagsByCategory = {
      analytics: [],
      advertising: [],
      personalization: [],
      functionality: [],
      other: []
    };
    
    tags.forEach(tag => {
      tagsByCategory[tag.category].push(tag);
    });
    
    // Build consent status HTML
    let consentHtml = '<h3>Consent Mode Status</h3>';
    for (const [key, value] of Object.entries(consentState)) {
      const color = value === 'granted' ? '#28a745' : '#dc3545';
      consentHtml += `<div><strong>${key}:</strong> <span style="color: ${color}">${value}</span></div>`;
    }
    
    // Build tags status HTML
    let tagsHtml = '<h3>Tags Status</h3>';
    
    if (tags.length === 0) {
      tagsHtml += '<div>No tags detected</div>';
    } else {
      // Add tag counts by status
      const allowedCount = tags.filter(t => t.allowed).length;
      const blockedCount = tags.filter(t => !t.allowed).length;
      
      tagsHtml += `
        <div style="margin-bottom: 8px;">
          <span style="color: #28a745; font-weight: bold;">${allowedCount} Allowed</span> | 
          <span style="color: #dc3545; font-weight: bold;">${blockedCount} Blocked</span>
        </div>
      `;
      
      // Add tags by category
      for (const [category, categoryTags] of Object.entries(tagsByCategory)) {
        if (categoryTags.length === 0) continue;
        
        const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
        tagsHtml += `<div style="margin-top: 8px; font-weight: bold;">${categoryLabel} (${categoryTags.length})</div>`;
        
        categoryTags.forEach(tag => {
          const statusColor = tag.allowed ? '#28a745' : '#dc3545';
          const statusText = tag.allowed ? 'Allowed' : 'Blocked';
          
          tagsHtml += `
            <div style="margin: 5px 0; padding-left: 10px; border-left: 3px solid ${this.getCategoryColor(category)};">
              <div>${tag.name}: <span style="color: ${statusColor}">${statusText}</span></div>
            </div>
          `;
        });
      }
    }
    
    // Build recent events HTML
    let eventsHtml = '<h3>Recent Events</h3>';
    
    const events = this.eventLogger.getEvents();
    if (events.length === 0) {
      eventsHtml += '<div>No events recorded yet</div>';
    } else {
      // Show only the 5 most recent events
      const recentEvents = events.slice(-5).reverse();
      
      recentEvents.forEach(event => {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        
        eventsHtml += `
          <div style="margin-bottom: 5px; font-size: 11px;">
            <span style="color: #666;">[${timestamp}]</span>
            <span style="font-weight: bold;">${event.type}:</span>
            <span>${event.details.substring(0, 50)}${event.details.length > 50 ? '...' : ''}</span>
          </div>
        `;
      });
    }
    
    // Combine all sections
    overlay.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h2 style="margin: 0; font-size: 14px;">GTM Consent Inspector</h2>
        <button id="close-overlay" style="background: none; border: none; cursor: pointer; font-size: 16px;">×</button>
      </div>
      ${consentHtml}
      ${tagsHtml}
      ${eventsHtml}
      <div style="margin-top: 10px; text-align: center;">
        <button id="overlay-refresh" style="background: #f8f9fa; border: 1px solid #ddd; padding: 4px 8px; font-size: 11px; cursor: pointer; border-radius: 4px;">Refresh Data</button>
      </div>
    `;
    
    // Add event listeners
    document.getElementById('close-overlay').addEventListener('click', () => {
      this.toggle();
    });
    
    document.getElementById('overlay-refresh').addEventListener('click', () => {
      this.update();
    });
  }
  
  /**
   * Helper to get category color
   * 
   * @param {string} category - Tag category
   * @returns {string} Color code for the category
   */
  getCategoryColor(category) {
    const colors = {
      'analytics': '#4285f4',
      'advertising': '#ea4335',
      'personalization': '#fbbc05',
      'functionality': '#34a853',
      'other': '#9aa0a6'
    };
    
    return colors[category] || colors['other'];
  }
}