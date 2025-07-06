// ui-utils.js - Enhanced UI utilities for better user experience
const UIUtils = (function() {
  
  // Notification system
  const notifications = [];
  
  function showNotification(message, type = 'info', duration = 4000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add to DOM
    document.body.appendChild(notification);
    notifications.push(notification);
    
    // Auto-remove after duration
    setTimeout(() => {
      removeNotification(notification);
    }, duration);
    
    // Add click to dismiss
    notification.addEventListener('click', () => {
      removeNotification(notification);
    });
    
    return notification;
  }
  
  function removeNotification(notification) {
    if (notification && notification.parentNode) {
      notification.style.animation = 'slideOutRight 0.3s ease-in-out';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
        const index = notifications.indexOf(notification);
        if (index > -1) {
          notifications.splice(index, 1);
        }
      }, 300);
    }
  }
  
  function clearAllNotifications() {
    notifications.forEach(notification => {
      removeNotification(notification);
    });
  }
  
  // Loading state management
  function setLoadingState(element, isLoading = true) {
    if (!element) return;
    
    if (isLoading) {
      element.classList.add('loading');
      element.disabled = true;
      
      // Add loading overlay for complex elements
      if (element.classList.contains('card') || element.classList.contains('section')) {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="loading-spinner"></div>';
        element.appendChild(overlay);
      }
    } else {
      element.classList.remove('loading');
      element.disabled = false;
      
      // Remove loading overlay
      const overlay = element.querySelector('.loading-overlay');
      if (overlay) {
        overlay.remove();
      }
    }
  }
  
  // Enhanced button states
  function setButtonLoading(button, isLoading = true, loadingText = 'Loading...') {
    if (!button) return;
    
    if (isLoading) {
      button.classList.add('loading');
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
    } else {
      button.classList.remove('loading');
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
      button.disabled = false;
    }
  }
  
  // Tooltip management
  function addTooltip(element, text) {
    if (!element || !text) return;
    
    element.classList.add('tooltip');
    element.setAttribute('data-tooltip', text);
  }
  
  function removeTooltip(element) {
    if (!element) return;
    
    element.classList.remove('tooltip');
    element.removeAttribute('data-tooltip');
  }
  
  // Enhanced empty states
  function setEmptyState(element, type = 'default', message = null) {
    if (!element) return;
    
    // Remove existing empty state classes
    element.classList.remove('empty-state', 'loading', 'error', 'success');
    
    // Add appropriate class
    element.classList.add('empty-state', type);
    
    // Update message if provided
    if (message) {
      element.textContent = message;
    }
  }
  
  // Status indicators
  function createStatusIndicator(status, text) {
    const indicator = document.createElement('span');
    indicator.className = `status-indicator ${status}`;
    indicator.textContent = text;
    return indicator;
  }
  
  // Enhanced animations
  function animateElement(element, animation = 'fadeInUp') {
    if (!element) return;
    
    element.classList.add(animation);
    
    // Remove animation class after animation completes
    element.addEventListener('animationend', () => {
      element.classList.remove(animation);
    }, { once: true });
  }
  
  // Debounce utility
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Throttle utility
  function throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  // Enhanced error handling
  function handleError(error, context = 'Unknown') {
    console.error(`❌ Error in ${context}:`, error);
    
    // Show user-friendly error notification
    const message = error.message || 'An unexpected error occurred';
    showNotification(`Error: ${message}`, 'error', 6000);
    
    // Log to console for debugging
    console.group(`Error Details - ${context}`);
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error('Context:', context);
    console.groupEnd();
  }
  
  // Success feedback
  function showSuccess(message, duration = 3000) {
    return showNotification(message, 'success', duration);
  }
  
  // Warning feedback
  function showWarning(message, duration = 5000) {
    return showNotification(message, 'warning', duration);
  }
  
  // Info feedback
  function showInfo(message, duration = 4000) {
    return showNotification(message, 'info', duration);
  }
  
  // Enhanced focus management
  function trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    element.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    });
  }
  
  // Accessibility helpers
  function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.style.position = 'absolute';
    announcement.style.left = '-10000px';
    announcement.style.width = '1px';
    announcement.style.height = '1px';
    announcement.style.overflow = 'hidden';
    
    document.body.appendChild(announcement);
    announcement.textContent = message;
    
    setTimeout(() => {
      if (announcement.parentNode) {
        announcement.parentNode.removeChild(announcement);
      }
    }, 1000);
  }
  
  // Enhanced hover effects
  function addHoverEffects() {
    // Add hover-lift to cards
    document.querySelectorAll('.card, .status-item').forEach(element => {
      element.classList.add('hover-lift');
    });
    
    // Add hover-glow to interactive elements
    document.querySelectorAll('.action-button, .tab-button').forEach(element => {
      element.classList.add('hover-glow');
    });
  }
  
  // Initialize UI enhancements
  function initialize() {
    console.log('🎨 UI Utils: Initializing...');
    
    // Add hover effects
    addHoverEffects();
    
    // Add tooltips to common elements
    addCommonTooltips();
    
    // Add keyboard shortcuts
    addKeyboardShortcuts();
    
    console.log('✅ UI Utils: Initialized');
  }
  
  function addCommonTooltips() {
    // Add tooltips to action buttons
    const tooltipMap = {
      'refreshTags': 'Refresh the list of GTM tags',
      'applyConsent': 'Apply consent settings to the current page',
      'clearLog': 'Clear the event log',
      'exportLog': 'Export event log as JSON',
      'startMonitoring': 'Start real-time monitoring',
      'stopMonitoring': 'Stop real-time monitoring',
      'refreshPerformance': 'Refresh performance metrics',
      'exportPerformance': 'Export performance report'
    };
    
    Object.entries(tooltipMap).forEach(([id, tooltip]) => {
      const element = document.getElementById(id);
      if (element) {
        addTooltip(element, tooltip);
      }
    });
  }
  
  function addKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // Ctrl/Cmd + R to refresh
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        const refreshBtn = document.querySelector('.action-button[id*="refresh"]');
        if (refreshBtn) {
          refreshBtn.click();
        }
      }
      
      // Escape to close notifications
      if (e.key === 'Escape') {
        clearAllNotifications();
      }
    });
  }
  
  // Public API
  return {
    // Notifications
    showNotification,
    removeNotification,
    clearAllNotifications,
    showSuccess,
    showWarning,
    showInfo,
    
    // Loading states
    setLoadingState,
    setButtonLoading,
    
    // Tooltips
    addTooltip,
    removeTooltip,
    
    // Empty states
    setEmptyState,
    
    // Status indicators
    createStatusIndicator,
    
    // Animations
    animateElement,
    
    // Utilities
    debounce,
    throttle,
    handleError,
    
    // Accessibility
    trapFocus,
    announceToScreenReader,
    
    // Initialization
    initialize
  };
})();

// Make available globally
window.UIUtils = UIUtils; 