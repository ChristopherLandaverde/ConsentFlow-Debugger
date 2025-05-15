// tag-list.js - Tag list display

// Initialize tag list
export function initializeTagList(contentScriptInterface) {
  // Initialize tag filters
  initializeTagFilters();
  
  // Add event listener to refresh button
  document.getElementById('refreshTags').addEventListener('click', function() {
    refreshTagStatus(contentScriptInterface);
  });
}

// Initialize tag filters
function initializeTagFilters() {
  const filterButtons = document.querySelectorAll('.filter-btn[data-filter]');
  
  filterButtons.forEach(button => {
    button.addEventListener('click', function() {
      const filterValue = this.getAttribute('data-filter');
      
      // Remove active class from all filter buttons
      filterButtons.forEach(b => b.classList.remove('active'));
      
      // Add active class to clicked button
      this.classList.add('active');
      
      // Apply filter to tag list
      filterTags(filterValue);
    });
  });
}

// Filter tags by category
function filterTags(category) {
  const tagItems = document.querySelectorAll('.tag-item');
  
  tagItems.forEach(item => {
    if (category === 'all') {
      item.style.display = 'block';
    } else {
      const tagCategory = item.getAttribute('data-category');
      item.style.display = tagCategory === category ? 'block' : 'none';
    }
  });
}

// Update tag list
export function updateTagList(tags) {
  const tagListElement = document.getElementById('tagList');
  
  if (!tags || tags.length === 0) {
    tagListElement.innerHTML = '<div class="tag-item">No tags detected</div>';
    return;
  }
  
  // Group tags by category
  const tagsByCategory = {
    analytics: [],
    advertising: [],
    personalization: [],
    functionality: [],
    other: []
  };
  
  tags.forEach(tag => {
    let category = 'other';
    
    // Categorize tag based on type
    if (tag.type.toLowerCase().includes('analytics') || tag.type === 'Universal Analytics' || tag.type === 'Google Analytics 4') {
      category = 'analytics';
    } else if (tag.type.toLowerCase().includes('ads') || tag.type.toLowerCase().includes('conversion') || tag.type === 'Google Ads Conversion Tracking' || tag.type.toLowerCase().includes('floodlight')) {
      category = 'advertising';
    } else if (tag.type.toLowerCase().includes('personalization') || tag.type === 'Personalization') {
      category = 'personalization';
    } else if (tag.type.toLowerCase().includes('functionality') || tag.type.toLowerCase().includes('utilities')) {
      category = 'functionality';
    }
    
    tagsByCategory[category].push({...tag, category});
  });
  
  // Clear the list
  tagListElement.innerHTML = '';
  
  // Add tags to the list by category
  for (const [category, categoryTags] of Object.entries(tagsByCategory)) {
    if (categoryTags.length === 0) continue;
    
    for (const tag of categoryTags) {
      const tagElement = document.createElement('div');
      tagElement.className = `tag-item ${category}`;
      tagElement.setAttribute('data-category', category);
      
      const statusClass = tag.allowed ? 'allowed' : 'blocked';
      const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
      
      tagElement.innerHTML = `
        <div><strong>${tag.name}</strong> <span class="tag-category category-${category}">${categoryLabel}</span></div>
        <div>Type: ${tag.type}</div>
        <div>Status: <span class="${statusClass}">${tag.allowed ? 'Allowed' : 'Blocked'}</span></div>
        <div>Reason: ${tag.reason}</div>
        ${tag.wouldFireWith ? `<div class="would-fire">Would fire with: ${tag.wouldFireWith} granted</div>` : ''}
      `;
      
      tagListElement.appendChild(tagElement);
    }
  }
  
  // Re-apply any active filter
  const activeFilter = document.querySelector('.filter-btn[data-filter].active');
  if (activeFilter) {
    filterTags(activeFilter.getAttribute('data-filter'));
  }
}

// Refresh tag status
export function refreshTagStatus(contentScriptInterface) {
  contentScriptInterface.executeInPage(getTagStatus, [], function(tags) {
    if (tags) {
      updateTagList(tags);
    }
  });
}

// Content script function - Get tag status
function getTagStatus() {
  const tags = [];
  
  if (!window.google_tag_manager) {
    return tags;
  }
  
  // Get GTM container
  const gtmId = Object.keys(window.google_tag_manager).find(key => key.startsWith('GTM-'));
  if (!gtmId) return tags;
  
  const gtmContainer = window.google_tag_manager[gtmId];
  
  try {
    const consentState = getCurrentConsentState();
    
    // Loop through known tag types and check their status
    const tagTypes = {
      'ua': 'Universal Analytics',
      'ga4': 'Google Analytics 4',
      'awct': 'Google Ads Conversion Tracking',
      'flc': 'Floodlight Counter',
      'fls': 'Floodlight Sales',
      'pcm': 'Personalization',
      'gclidw': 'GCLID Writes'
    };
    
    for (const tagId in gtmContainer.dataLayer.helper.dataLayer.data.load) {
      const tagData = gtmContainer.dataLayer.helper.dataLayer.data.load[tagId];
      if (tagData && tagData.tagTypeId) {
        const tagType = tagTypes[tagData.tagTypeId] || tagData.tagTypeId;
        const tagName = tagData.name || `Tag ${tagId}`;
        
        // Determine if tag is allowed based on consent settings
        let allowed = true;
        let reason = 'Default allowed';
        let wouldFireWith = '';
        
        // Check if tag requires specific consent
        if (tagData.tagTypeId === 'ua' || tagData.tagTypeId === 'ga4') {
          if (consentState.analytics_storage === 'denied') {
            allowed = false;
            reason = 'analytics_storage consent denied';
            wouldFireWith = 'analytics_storage';
          } else {
            reason = 'analytics_storage consent granted';
          }
        } else if (tagData.tagTypeId === 'awct' || tagData.tagTypeId === 'flc' || tagData.tagTypeId === 'fls') {
          if (consentState.ad_storage === 'denied') {
            allowed = false;
            reason = 'ad_storage consent denied';
            wouldFireWith = 'ad_storage';
          } else {
            reason = 'ad_storage consent granted';
          }
        } else if (tagData.tagTypeId === 'pcm') {
          if (consentState.personalization_storage === 'denied') {
            allowed = false;
            reason = 'personalization_storage consent denied';
            wouldFireWith = 'personalization_storage';
          } else {
            reason = 'personalization_storage consent granted';
          }
        }
        
        tags.push({
          id: tagId,
          name: tagName,
          type: tagType,
          allowed: allowed,
          reason: reason,
          wouldFireWith: wouldFireWith,
          executionTime: tagData.executionTime || null
        });
      }
    }
  } catch (e) {
    console.error('Error getting tag status:', e);
  }
  
  return tags;
}

// Helper function - Get current consent state
function getCurrentConsentState() {
  const consentState = {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted'
  };
  
  // Try to get current consent state from dataLayer
  const dataLayer = window.dataLayer || [];
  for (let i = dataLayer.length - 1; i >= 0; i--) {
    if (Array.isArray(dataLayer[i]) && 
        (dataLayer[i][0] === 'consent' && (dataLayer[i][1] === 'default' || dataLayer[i][1] === 'update'))) {
      const consentUpdate = dataLayer[i][2] || {};
      for (const key in consentUpdate) {
        consentState[key] = consentUpdate[key];
      }
    }
  }
  
  return consentState;
}