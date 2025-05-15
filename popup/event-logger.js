// event-logger.js - Event log display

// Initialize event logger
export function initializeEventLogger(contentScriptInterface) {
  // Initialize event filters
  initializeEventFilters();
  
  // Add event listener to clear log button
  document.getElementById('clearLog').addEventListener('click', function() {
    clearEventLog(contentScriptInterface);
  });
  
  // Add event listener to export log button
  document.getElementById('exportLog').addEventListener('click', function() {
    exportEventLog(contentScriptInterface);
  });
}

// Initialize event filters
function initializeEventFilters() {
  const eventFilterButtons = document.querySelectorAll('.filter-btn[data-event-filter]');
  
  eventFilterButtons.forEach(button => {
    button.addEventListener('click', function() {
      const filterValue = this.getAttribute('data-event-filter');
      
      // Remove active class from all filter buttons
      eventFilterButtons.forEach(b => b.classList.remove('active'));
      
      // Add active class to clicked button
      this.classList.add('active');
      
      // Apply filter to event log
      filterEvents(filterValue);
    });
  });
}

// Filter events by category
function filterEvents(category) {
  const eventItems = document.querySelectorAll('.event-item');
  
  eventItems.forEach(item => {
    if (category === 'all') {
      item.style.display = 'block';
    } else {
      const eventCategory = item.getAttribute('data-event-type');
      item.style.display = eventCategory === category ? 'block' : 'none';
    }
  });
}

// Update event log
export function updateEventLog(events) {
  const eventLogElement = document.getElementById('eventLog');
  
  if (!events || events.length === 0) {
    eventLogElement.innerHTML = '<div class="event-item">No events recorded yet</div>';
    return;
  }
  
  // Clear the log
  eventLogElement.innerHTML = '';
  
  // Add events to the log (newest first)
  events.slice().reverse().forEach(event => {
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    eventItem.setAttribute('data-event-type', event.category);
    
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    
    eventItem.innerHTML = `
      <span class="event-time">[${timestamp}]</span>
      <span class="event-type">${event.type}:</span>
      <span class="event-detail">${event.details}</span>
    `;
    
    eventLogElement.appendChild(eventItem);
  });
  
  // Re-apply any active filter
  const activeFilter = document.querySelector('.filter-btn[data-event-filter].active');
  if (activeFilter) {
    filterEvents(activeFilter.getAttribute('data-event-filter'));
  }
}

// Refresh event log
export function refreshEventLog(contentScriptInterface) {
  contentScriptInterface.executeInPage(getEventLog, [], function(events) {
    if (events) {
      updateEventLog(events);
    }
  });
}

// Clear event log
export function clearEventLog(contentScriptInterface) {
  contentScriptInterface.executeInPage(clearEventLogFunc, [], function(result) {
    if (result) {
      const eventLogElement = document.getElementById('eventLog');
      eventLogElement.innerHTML = '<div class="event-item">Waiting for events...</div>';
    }
  });
}

// Export event log
export function exportEventLog(contentScriptInterface) {
  contentScriptInterface.executeInPage(getEventLog, [], function(events) {
    if (events) {
      // Export the event log as JSON
      const blob = new Blob([JSON.stringify(events, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      
      // Create a download link
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gtm-consent-events.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  });
}

// Content script function - Get event log
function getEventLog() {
  if (!window.gtmConsentInspector) {
    return [];
  }
  
  return window.gtmConsentInspector.events;
}

// Content script function - Clear event log
function clearEventLogFunc() {
  if (window.gtmConsentInspector) {
    window.gtmConsentInspector.events = [];
  }
  
  return true;
}