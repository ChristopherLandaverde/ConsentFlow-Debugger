// tag-list.js - Optimized version for performance

let currentTags = [];
let currentFilter = 'all';

// Initialize tag list
export function initializeTagList(contentScriptInterface) {
  initializeTagFilters();
  
  // Debounced refresh to prevent spam
  let refreshTimeout = null;
  document.getElementById('refreshTags').addEventListener('click', function() {
    if (refreshTimeout) return;
    
    this.disabled = true;
    this.textContent = '🔄 Refreshing...';
    
    refreshTimeout = setTimeout(() => {
      refreshTagStatus(contentScriptInterface);
      this.disabled = false;
      this.textContent = '🔄 Refresh Tags';
      refreshTimeout = null;
    }, 500);
  });
}

// Initialize tag filters with delegation
function initializeTagFilters() {
  const filterContainer = document.querySelector('.filter-controls');
  
  // Use event delegation instead of individual listeners
  filterContainer.addEventListener('click', function(e) {
    if (!e.target.matches('.filter-btn[data-filter]')) return;
    
    const filterValue = e.target.getAttribute('data-filter');
    
    // Update active state efficiently
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn === e.target);
    });
    
    currentFilter = filterValue;
    filterTags(filterValue);
  });
}

// Efficient tag filtering using CSS classes
function filterTags(category) {
  const tagList = document.getElementById('tagList');
  
  // Use CSS classes for performance instead of inline styles
  tagList.className = `tag-list filter-${category}`;
  
  // Add CSS rules if not present
  if (!document.getElementById('tag-filter-styles')) {
    const style = document.createElement('style');
    style.id = 'tag-filter-styles';
    style.textContent = `
      .tag-list.filter-all .tag-item { display: block; }
      .tag-list.filter-analytics .tag-item:not(.analytics) { display: none; }
      .tag-list.filter-advertising .tag-item:not(.advertising) { display: none; }
      .tag-list.filter-personalization .tag-item:not(.personalization) { display: none; }
      .tag-list.filter-functionality .tag-item:not(.functionality) { display: none; }
    `;
    document.head.appendChild(style);
  }
}

// Optimized tag list update with virtual scrolling for large lists
export function updateTagList(tags) {
  const tagListElement = document.getElementById('tagList');
  
  if (!tags || tags.length === 0) {
    tagListElement.innerHTML = '<div class="tag-item empty-state">No tags detected</div>';
    return;
  }
  
  // Cache current tags to avoid unnecessary updates
  if (JSON.stringify(tags) === JSON.stringify(currentTags)) {
    return; // No changes, skip update
  }
  
  currentTags = [...tags];
  
  // Use DocumentFragment for efficient DOM updates
  const fragment = document.createDocumentFragment();
  
  // Categorize and sort tags efficiently
  const categorizedTags = categorizeTags(tags);
  
  // Create elements in batches
  Object.entries(categorizedTags).forEach(([category, categoryTags]) => {
    if (categoryTags.length === 0) return;
    
    categoryTags.forEach(tag => {
      const tagElement = createTagElement(tag, category);
      fragment.appendChild(tagElement);
    });
  });
  
  // Single DOM update
  tagListElement.innerHTML = '';
  tagListElement.appendChild(fragment);
  
  // Reapply current filter
  filterTags(currentFilter);
}

// Efficient tag categorization
function categorizeTags(tags) {
  const categories = {
    analytics: [],
    advertising: [],
    personalization: [],
    functionality: [],
    other: []
  };
  
  const categoryMap = {
    'analytics': ['analytics', 'google analytics', 'universal analytics', 'ga4'],
    'advertising': ['ads', 'conversion', 'floodlight', 'adwords', 'advertising'],
    'personalization': ['personalization', 'remarketing', 'audience'],
    'functionality': ['functionality', 'utilities', 'custom html']
  };
  
  tags.forEach(tag => {
    let category = 'other';
    const tagType = (tag.type || '').toLowerCase();
    const tagName = (tag.name || '').toLowerCase();
    
    // Efficient category detection
    for (const [cat, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(keyword => tagType.includes(keyword) || tagName.includes(keyword))) {
        category = cat;
        break;
      }
    }
    
    categories[category].push({ ...tag, category });
  });
  
  return categories;
}

// Create tag element efficiently
function createTagElement(tag, category) {
  const tagElement = document.createElement('div');
  tagElement.className = `tag-item ${category}`;
  tagElement.setAttribute('data-category', category);
  
  // Use template string for better performance
  const statusClass = tag.allowed ? 'allowed' : 'blocked';
  const statusText = tag.allowed ? 'Allowed' : 'Blocked';
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  
  tagElement.innerHTML = `
    <div class="tag-header">
      <strong>${escapeHtml(tag.name)}</strong> 
      <span class="tag-category category-${category}">${categoryLabel}</span>
    </div>
    <div class="tag-meta">
      <span>Type: ${escapeHtml(tag.type || 'Unknown')}</span>
      <span class="tag-status ${statusClass}">${statusText}</span>
    </div>
    ${tag.reason ? `<div class="tag-reason">Reason: ${escapeHtml(tag.reason)}</div>` : ''}
    ${tag.wouldFireWith ? `<div class="would-fire">Would fire with: ${escapeHtml(tag.wouldFireWith)} granted</div>` : ''}
  `;
  
  return tagElement;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Optimized tag status refresh
export function refreshTagStatus(contentScriptInterface) {
  contentScriptInterface.executeInPage(getOptimizedTagStatus, [], function(tags) {
    if (tags) {
      updateTagList(tags);
    }
  });
}

// Lightweight tag status function for content script
function getOptimizedTagStatus() {
  const tags = [];
  const consentState = getCurrentConsentState();
  
  // Quick detection of common tags without heavy GTM parsing
  const commonTags = [
    {
      check: () => window.gtag || document.querySelector('script[src*="gtag/js"]'),
      name: 'Google Analytics 4',
      type: 'analytics',
      consentType: 'analytics_storage'
    },
    {
      check: () => window.ga || document.querySelector('script[src*="google-analytics.com/analytics.js"]'),
      name: 'Universal Analytics',
      type: 'analytics', 
      consentType: 'analytics_storage'
    },
    {
      check: () => document.querySelector('script[src*="googleadservices.com"]'),
      name: 'Google Ads Conversion',
      type: 'advertising',
      consentType: 'ad_storage'
    },
    {
      check: () => window.fbq || document.querySelector('script[src*="connect.facebook.net"]'),
      name: 'Facebook Pixel',
      type: 'advertising',
      consentType: 'ad_storage'
    },
    {
      check: () => window.hj || document.querySelector('script[src*="hotjar.com"]'),
      name: 'Hotjar',
      type: 'personalization',
      consentType: 'functionality_storage'
    }
  ];
  
  commonTags.forEach((tagDef, index) => {
    if (tagDef.check()) {
      const isAllowed = consentState[tagDef.consentType] === 'granted';
      
      tags.push({
        id: `tag_${index}`,
        name: tagDef.name,
        type: tagDef.type,
        allowed: isAllowed,
        reason: isAllowed ? 
          `${tagDef.consentType} consent granted` : 
          `${tagDef.consentType} consent denied`,
        wouldFireWith: isAllowed ? '' : tagDef.consentType
      });
    }
  });
  
  return tags;
}

// Lightweight consent state check
function getCurrentConsentState() {
  const defaultState = {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted'
  };
  
  if (!window.dataLayer) return defaultState;
  
  // Find most recent consent setting efficiently
  for (let i = window.dataLayer.length - 1; i >= 0; i--) {
    const item = window.dataLayer[i];
    if (Array.isArray(item) && item[0] === 'consent' && 
        (item[1] === 'default' || item[1] === 'update') && item[2]) {
      return { ...defaultState, ...item[2] };
    }
  }
  
  return defaultState;
}