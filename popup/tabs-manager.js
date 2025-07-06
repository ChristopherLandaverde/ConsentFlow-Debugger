// tabs-manager.js - Tab switching functionality
const TabsManager = (function() {
  
  function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');
        
        // Remove active class from all tabs and contents
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        this.classList.add('active');
        const targetContent = document.getElementById(`${tabName}-tab`);
        if (targetContent) {
          targetContent.classList.add('active');
        }
        
        // Trigger refresh for certain tabs
        if (tabName === 'tags' && window.TagList) {
          window.TagList.refresh();
        } else if (tabName === 'events' && window.EventLogger) {
          window.EventLogger.refresh();
        }
      });
    });
  }
  
  // Public API
  return {
    initialize: initializeTabs
  };
})();

// Make available globally
window.TabsManager = TabsManager;