// tag-list.js - FIXED version with setActiveContainer
const TagList = (function() {
  let currentTags = [];
  let currentFilter = 'all';
  let activeContainer = null; // Add this
  let contentScriptInterface = null;

  function initialize(contentInterface) {
    contentScriptInterface = contentInterface;
    
    initializeTagFilters();
    initializeRefreshButton();
  }

  function initializeTagFilters() {
    const filterContainer = document.querySelector('#tags-tab .filter-controls');
    if (!filterContainer) {
      return;
    }
    
    filterContainer.addEventListener('click', function(e) {
      if (!e.target.matches('.filter-btn[data-filter]')) return;
      
      const filterValue = e.target.getAttribute('data-filter');
      
      // Update active state
      filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn === e.target);
      });
      
      currentFilter = filterValue;
      filterTags(filterValue);
    });
  }

  function initializeRefreshButton() {
    const refreshBtn = document.getElementById('refreshTags');
    if (!refreshBtn) {
      return;
    }
    
    refreshBtn.addEventListener('click', async function() {
      this.disabled = true;
      this.textContent = '🔄 Refreshing...';
      
      try {
        await refresh();
      } finally {
        this.disabled = false;
        this.textContent = '🔄 Refresh Tags';
      }
    });
  }



  async function refresh() {
    if (!contentScriptInterface) {
      return;
    }
    
    try {
      const result = await contentScriptInterface.sendMessage('getTagStatus');
      
      if (result && Array.isArray(result)) {
        updateTags(result);
      } else {
        updateTags([]);
      }
    } catch (error) {
      updateTags([]);
    }
  }

  function updateTags(tags) {
    const tagListElement = document.getElementById('tagList');
    if (!tagListElement) {
      return;
    }
    
    currentTags = tags;
    
    if (!tags || tags.length === 0) {
      tagListElement.innerHTML = '<div class="tag-item empty-state">No tags detected</div>';
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    tags.forEach(tag => {
      const tagElement = createTagElement(tag);
      fragment.appendChild(tagElement);
    });
    
    tagListElement.innerHTML = '';
    tagListElement.appendChild(fragment);
    
    // Reapply current filter
    filterTags(currentFilter);
  }

  function createTagElement(tag) {
    const tagElement = document.createElement('div');
    tagElement.className = `tag-item ${tag.type || 'other'}`;
    
    const statusIcon = tag.allowed ? '✅' : '❌';
    const statusColor = tag.allowed ? '#28a745' : '#dc3545';
    
    tagElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong>${escapeHtml(tag.name)}</strong>
        <span style="color: ${statusColor}; font-weight: 600;">
          ${statusIcon} ${tag.allowed ? 'Allowed' : 'Blocked'}
        </span>
      </div>
      <div style="font-size: 12px; color: #666;">
        Type: ${escapeHtml(tag.type || 'Unknown')}
      </div>
      ${tag.reason ? `<div style="font-size: 11px; color: #888; margin-top: 2px;">
        ${escapeHtml(tag.reason)}
      </div>` : ''}
    `;
    
    return tagElement;
  }

  function filterTags(category) {
    const tagItems = document.querySelectorAll('#tagList .tag-item:not(.empty-state)');
    
    tagItems.forEach(item => {
      if (category === 'all') {
        item.style.display = 'block';
      } else {
        const hasCategory = item.classList.contains(category);
        item.style.display = hasCategory ? 'block' : 'none';
      }
    });
  }

  // ADD THIS MISSING FUNCTION
  function setActiveContainer(containerId) {
    activeContainer = containerId;
    
    // Filter tags by container if needed
    if (currentTags.length > 0) {
      const containerTags = currentTags.filter(tag => 
        !tag.container || tag.container === containerId
      );
      
      if (containerTags.length !== currentTags.length) {
        updateTagDisplay(containerTags);
      }
    }
  }

  // ADD THIS HELPER FUNCTION
  function updateTagDisplay(tags) {
    const tagListElement = document.getElementById('tagList');
    if (!tagListElement) return;
    
    if (!tags || tags.length === 0) {
      tagListElement.innerHTML = '<div class="tag-item empty-state">No tags for this container</div>';
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    tags.forEach(tag => {
      const tagElement = createTagElement(tag);
      fragment.appendChild(tagElement);
    });
    
    tagListElement.innerHTML = '';
    tagListElement.appendChild(fragment);
    
    // Reapply current filter
    filterTags(currentFilter);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // FIXED: Include setActiveContainer in the return object
  return {
    initialize,
    refresh,
    updateTags,
    setActiveContainer  // ADD THIS LINE - This was missing!
  };
})();

// Make available globally
window.TagList = TagList;