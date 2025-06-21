// event-logger.js - Memory-efficient event logging

const MAX_EVENTS = 50; // Limit events to prevent memory issues
let currentEvents = [];
let currentEventFilter = 'all';

// Initialize event logger
export function initializeEventLogger(contentScriptInterface) {
  initializeEventFilters();
  
  // Debounced clear log
  let clearTimeout = null;
  document.getElementById('clearLog').addEventListener('click', function() {
    if (clearTimeout) return;
    
    clearTimeout = setTimeout(() => {
      clearEventLog(contentScriptInterface);
      clearTimeout = null;
    }, 300);
  });
  
  // Optimized export
  document.getElementById('exportLog').addEventListener('click', function() {
    exportEventLog(contentScriptInterface);
  });
}

// Event filters with delegation
function initializeEventFilters() {
  const filterContainer = document.querySelector('#events-tab .filter-controls');
  
  filterContainer.addEventListener('click', function(e) {
    if (!e.target.matches('.filter-btn[data-event-filter]')) return;
    
    const filterValue = e.target.getAttribute('data-event-filter');
    
    // Update active state
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn === e.target);
    });
    
    currentEventFilter = filterValue;
    filterEvents(filterValue);
  });
}

// Efficient event filtering with CSS
function filterEvents(category) {
  const eventLog = document.getElementById('eventLog');
  eventLog.className = `event-log filter-${category}`;
  
  // Add filter styles if not present
  if (!document.getElementById('event-filter-styles')) {
    const style = document.createElement('style');
    style.id = 'event-filter-styles';
    style.textContent = `
      .event-log.filter-all .event-item { display: block; }
      .event-log.filter-consent .event-item:not([data-event-type="consent"]) { display: none; }
      .event-log.filter-tag .event-item:not([data-event-type="tag"]) { display: none; }
      .event-log.filter-gtm .event-item:not([data-event-type="gtm"]) { display: none; }
    `;
    document.head.appendChild(style);
  }
}

// Optimized event log update
export function updateEventLog(events) {
  const eventLogElement = document.getElementById('eventLog');
  
  if (!events || events.length === 0) {
    eventLogElement.innerHTML = '<div class="event-item empty-state">No events recorded yet</div>';
    return;
  }
  
  // Limit events and check for changes
  const limitedEvents = events.slice(-MAX_EVENTS);
  if (JSON.stringify(limitedEvents) === JSON.stringify(currentEvents)) {
    return; // No changes
  }
  
  currentEvents = [...limitedEvents];
  
  // Use DocumentFragment for efficient updates
  const fragment = document.createDocumentFragment();
  
  // Process events in reverse order (newest first)
  limitedEvents.reverse().forEach(event => {
    const eventElement = createEventElement(event);
    fragment.appendChild(eventElement);
  });
  
  // Single DOM update
  eventLogElement.innerHTML = '';
  eventLogElement.appendChild(fragment);
  
  // Reapply filter
  filterEvents(currentEventFilter);
  
  // Auto-scroll to top for new events
  eventLogElement.scrollTop = 0;
}

// Create event element efficiently
function createEventElement(event) {
  const eventItem = document.createElement('div');
  eventItem.className = 'event-item';
  eventItem.setAttribute('data-event-type', event.category || 'other');
  
  const timestamp = new Date(event.timestamp).toLocaleTimeString();
  
  // Use template for performance
  eventItem.innerHTML = `
    <div class="event-header">
      <span class="event-time">[${timestamp}]</span>
      <span class="event-type ${event.category || 'other'}">${escapeHtml(event.type || 'Event')}</span>
    </div>
    <div class="event-detail">${escapeHtml(truncateText(event.details || '', 100))}</div>
  `;
  
  return eventItem;
}

// Truncate text for performance
function truncateText(text, maxLength) {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Efficient event log refresh
export function refreshEventLog(contentScriptInterface) {
  contentScriptInterface.executeInPage(getRecentEvents, [], function(events) {
    if (events) {
      updateEventLog(events);
    }
  });
}

// Clear event log
export function clearEventLog(contentScriptInterface) {
  contentScriptInterface.executeInPage(clearEventLogFunc, [], function(result) {
    if (result) {
      currentEvents = [];
      const eventLogElement = document.getElementById('eventLog');
      eventLogElement.innerHTML = '<div class="event-item empty-state">Event log cleared</div>';
    }
  });
}

// Export event log efficiently
export function exportEventLog(contentScriptInterface) {
  contentScriptInterface.executeInPage(getAllEvents, [], function(events) {
    if (events && events.length > 0) {
      try {
        // Create export data
        const exportData = {
          timestamp: new Date().toISOString(),
          url: location.href,
          events: events
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json'
        });
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gtm-events-${new Date().toISOString().split('T')[0]}.json`;
        
        // Trigger download
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Show success feedback
        showNotification('Events exported successfully', 'success');
      } catch (error) {
        showNotification('Export failed: ' + error.message, 'error');
      }
    } else {
      showNotification('No events to export', 'warning');
    }
  });
}

// Show notification helper
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    background-color: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#ffc107'};
    color: white;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// Content script functions for event management

// Get recent events (limited for performance)
function getRecentEvents() {
  if (!window.gtmConsentInspector || !window.gtmConsentInspector.events) {
    initializeLightweightEventLogger();
    return [];
  }
  
  // Return only recent events to prevent memory issues
  return window.gtmConsentInspector.events.slice(-MAX_EVENTS);
}

// Get all events for export
function getAllEvents() {
  if (!window.gtmConsentInspector || !window.gtmConsentInspector.events) {
    return [];
  }
  
  return window.gtmConsentInspector.events;
}

// Clear event log function
function clearEventLogFunc() {
  if (window.gtmConsentInspector) {
    window.gtmConsentInspector.events = [];
    addEvent('Event Log Cleared', 'system', 'All events cleared by user');
  }
  return true;
}

// Initialize lightweight event logger in content script
function initializeLightweightEventLogger() {
  if (window.gtmConsentInspector) return; // Already initialized
  
  window.gtmConsentInspector = {
    events: [],
    originalDataLayerPush: null,
    originalGtag: null,
    maxEvents: 100 // Limit to prevent memory issues
  };
  
  // Hook into dataLayer.push with throttling
  if (window.dataLayer && !window.gtmConsentInspector.originalDataLayerPush) {
    window.gtmConsentInspector.originalDataLayerPush = window.dataLayer.push;
    
    let lastLogTime = 0;
    const LOG_THROTTLE = 500; // 500ms throttle
    
    window.dataLayer.push = function() {
      // Call original method first
      const result = window.gtmConsentInspector.originalDataLayerPush.apply(this, arguments);
      
      // Throttle logging to prevent spam
      const now = Date.now();
      if (now - lastLogTime < LOG_THROTTLE) return result;
      lastLogTime = now;
      
      try {
        const event = arguments[0];
        
        if (typeof event === 'object' && event !== null) {
          if (Array.isArray(event)) {
            // Handle consent events
            if (event[0] === 'consent') {
              addEvent('Consent Update', 'consent', 
                `${event[1]}: ${JSON.stringify(event[2])}`);
            }
          } else if (event.event && !event.event.startsWith('gtm.')) {
            // Handle regular events (skip internal GTM events)
            addEvent('DataLayer Event', 'gtm', 
              `${event.event}: ${JSON.stringify(event).substring(0, 100)}...`);
          }
        }
      } catch (e) {
        // Silently fail to prevent breaking the page
      }
      
      return result;
    };
  }
  
  // Hook into gtag with throttling
  if (window.gtag && !window.gtmConsentInspector.originalGtag) {
    window.gtmConsentInspector.originalGtag = window.gtag;
    
    let lastGtagTime = 0;
    
    window.gtag = function() {
      // Call original function
      const result = window.gtmConsentInspector.originalGtag.apply(this, arguments);
      
      // Throttle logging
      const now = Date.now();
      if (now - lastGtagTime < LOG_THROTTLE) return result;
      lastGtagTime = now;
      
      try {
        const args = Array.from(arguments);
        
        if (args[0] === 'consent') {
          addEvent('gtag Consent', 'consent', 
            `${args[1]}: ${JSON.stringify(args[2])}`);
        } else if (args[0] === 'event') {
          addEvent('gtag Event', 'tag', 
            `${args[1]}: ${JSON.stringify(args[2] || {})}`);
        }
      } catch (e) {
        // Silently fail
      }
      
      return result;
    };
  }
  
  // Initial log
  addEvent('Event Logger Initialized', 'system', 'Monitoring started');
}

// Add event with memory management
function addEvent(type, category, details) {
  if (!window.gtmConsentInspector) return;
  
  const event = {
    timestamp: Date.now(),
    type,
    category,
    details
  };
  
  window.gtmConsentInspector.events.push(event);
  
  // Keep only recent events to prevent memory issues
  if (window.gtmConsentInspector.events.length > window.gtmConsentInspector.maxEvents) {
    window.gtmConsentInspector.events = window.gtmConsentInspector.events.slice(-50);
  }
}