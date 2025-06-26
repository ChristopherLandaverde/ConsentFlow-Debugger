// tag-list.js - Converted to IIFE pattern
const TagList = (function() {
  let currentTags = [];
  let currentFilter = 'all';
  let contentScriptInterface = null;

  function initialize(contentInterface) {
    console.log('🏷️ Initializing TagList...');
    contentScriptInterface = contentInterface;
    
    initializeTagFilters();
    initializeRefreshButton();
    initializeOverlayButton();
  }

  function initializeTagFilters() {
    const filterContainer = document.querySelector('#tags-tab .filter-controls');
    if (!filterContainer) {
      console.error('❌ Filter container not found');
      return;
    }
    
    filterContainer.addEventListener('click', function(e) {
      if (!e.target.matches('.filter-btn[data-filter]')) return;
      
      const filterValue = e.target.getAttribute('data-filter');
      console.log('🔍 Filter clicked:', filterValue);
      
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
      console.error('❌ Refresh button not found');
      return;
    }
    
    refreshBtn.addEventListener('click', async function() {
      console.log('🔄 Refresh tags clicked');
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

  function initializeOverlayButton() {
    const overlayBtn = document.getElementById('toggleOverlay');
    if (!overlayBtn) {
      console.error('❌ Overlay button not found');
      return;
    }
    
    overlayBtn.addEventListener('click', async function() {
      console.log('👁️ Toggle overlay clicked');
      this.disabled = true;
      
      try {
        const result = await contentScriptInterface.sendMessage('toggleOverlay');
        if (result.success) {
          this.textContent = result.action === 'created' ? '👁️ Hide' : '👁️ Show';
          console.log('✅ Overlay toggled:', result.action);
        }
      } catch (error) {
        console.error('❌ Overlay toggle failed:', error);
      } finally {
        this.disabled = false;
      }
    });
  }

  async function refresh() {
    if (!contentScriptInterface) {
      console.error('❌ No content script interface');
      return;
    }
    
    console.log('🔄 Refreshing tag status...');
    try {
      const result = await contentScriptInterface.sendMessage('getTagStatus');
      console.log('📊 Tag refresh result:', result);
      
      if (result && Array.isArray(result)) {
        updateTags(result);
      } else {
        console.warn('⚠️ No tags returned or invalid format');
      }
    } catch (error) {
      console.error('❌ Error refreshing tags:', error);
    }
  }

  function updateTags(tags) {
    console.log('📋 Updating tags:', tags.length, 'tags');
    const tagListElement = document.getElementById('tagList');
    if (!tagListElement) {
      console.error('❌ Tag list element not found');
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
    
    console.log('✅ Tags updated successfully');
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
    console.log('🔍 Filtering tags by:', category);
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

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public API
  return {
    initialize,
    refresh,
    updateTags
  };
})();

// Make available globally
window.TagList = TagList;