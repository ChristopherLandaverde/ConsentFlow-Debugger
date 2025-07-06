// popup/containers-panel.js - REAL Multi-container Implementation
const ContainersPanel = (function() {
  let contentScriptInterface = null;
  let currentContainers = [];
  let selectedContainer = null;
  
  function initialize(contentInterface) {
    contentScriptInterface = contentInterface;
    console.log('📦 Containers Panel: Initialized with real multi-container support');
    
    addContainerSection();
    setupContainerSwitching();
    setupContainerActions();
  }
  
  function addContainerSection() {
    const statusContainer = document.querySelector('.status-container');
    if (!statusContainer || document.getElementById('containersSection')) return;
    
    const containersSection = document.createElement('div');
    containersSection.id = 'containersSection';
    containersSection.className = 'containers-section';
    containersSection.style.display = 'none';
    
    containersSection.innerHTML = `
      <div class="containers-header">
        <h3>📦 GTM Containers (<span id="containerCount">0</span>)</h3>
        <div class="container-controls">
          <button id="refreshContainers" class="refresh-btn">🔄</button>
          <button id="containerSettings" class="settings-btn">⚙️</button>
        </div>
      </div>
      <div id="containersList" class="containers-list">
        <!-- Container items will be populated here -->
      </div>
      <div id="containerActions" class="container-actions" style="display: none;">
        <button id="switchContainer" class="action-button">Switch Active</button>
        <button id="compareContainers" class="action-button">Compare</button>
        <button id="analyzeContainer" class="action-button">Analyze</button>
      </div>
    `;
    
    statusContainer.appendChild(containersSection);
  }
  
  function setupContainerSwitching() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('container-item')) {
        selectContainer(e.target.dataset.containerId);
      }
    });
  }
  
  function setupContainerActions() {
    const refreshBtn = document.getElementById('refreshContainers');
    const settingsBtn = document.getElementById('containerSettings');
    const switchBtn = document.getElementById('switchContainer');
    const compareBtn = document.getElementById('compareContainers');
    const analyzeBtn = document.getElementById('analyzeContainer');
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', refreshContainers);
    }
    
    if (settingsBtn) {
      settingsBtn.addEventListener('click', showContainerSettings);
    }
    
    if (switchBtn) {
      switchBtn.addEventListener('click', switchActiveContainer);
    }
    
    if (compareBtn) {
      compareBtn.addEventListener('click', compareContainers);
    }
    
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', analyzeSelectedContainer);
    }
  }
  
  function updateContainers(containers) {
    currentContainers = containers || [];
    
    const containersSection = document.getElementById('containersSection');
    const containersList = document.getElementById('containersList');
    const containerCount = document.getElementById('containerCount');
    const containerActions = document.getElementById('containerActions');
    
    if (!containersSection || !containersList) return;
    
    // Update count
    if (containerCount) {
      containerCount.textContent = currentContainers.length;
    }
    
    // Show/hide section based on container count
    if (currentContainers.length <= 1) {
      containersSection.style.display = 'none';
      return;
    }
    
    containersSection.style.display = 'block';
    
    // Clear existing list
    containersList.innerHTML = '';
    
    // Add each container with enhanced info
    currentContainers.forEach((container, index) => {
      const containerItem = createEnhancedContainerItem(container, index);
      containersList.appendChild(containerItem);
    });
    
    // Show actions if we have multiple containers
    if (containerActions) {
      containerActions.style.display = currentContainers.length > 1 ? 'block' : 'none';
    }
    
    // Auto-select first container if none selected
    if (!selectedContainer && currentContainers.length > 0) {
      selectContainer(currentContainers[0].id);
    }
  }
  
  function createEnhancedContainerItem(container, index) {
    const item = document.createElement('div');
    item.className = 'container-item enhanced';
    item.dataset.containerId = container.id;
    
    const isPrimary = index === 0;
    const isSelected = selectedContainer === container.id;
    const consentIcon = container.hasConsentMode ? '🔒' : '⚠️';
    const statusIcon = getContainerStatusIcon(container);
    
    item.style.cssText = `
      border: 1px solid ${isSelected ? '#007bff' : '#e0e0e0'};
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
      background: ${isSelected ? '#f0f8ff' : '#f8f9fa'};
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 12px;
    `;
    
    const primaryBadge = isPrimary ? 
      '<span class="primary-badge" style="background: #007bff; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">PRIMARY</span>' : '';
    
    const statusBadge = getStatusBadge(container);
    
    item.innerHTML = `
      <div class="container-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div class="container-title">
          <strong style="color: #333;">${container.id}</strong>
          ${primaryBadge}
        </div>
        <div class="container-status">
          ${statusIcon} ${statusBadge}
        </div>
      </div>
      <div class="container-details" style="color: #666; margin-bottom: 4px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Method: ${container.method}</span>
          <span>Consent: ${consentIcon}</span>
        </div>
        <div style="margin-top: 4px;">
          <span>DataLayer: ${typeof container.dataLayer === 'number' ? container.dataLayer : 0} events</span>
        </div>
      </div>
      <div class="container-metrics" style="display: ${isSelected ? 'block' : 'none'};">
        <div style="color: #888; font-size: 11px; padding-top: 8px; border-top: 1px solid #ddd;">
          <div>Tags: ${container.tagCount || 0}</div>
          <div>Triggers: ${container.triggerCount || 0}</div>
          <div>Variables: ${container.variableCount || 0}</div>
        </div>
      </div>
    `;
    
    // Add hover effects
    item.addEventListener('mouseenter', () => {
      if (!isSelected) {
        item.style.backgroundColor = '#e9ecef';
        item.style.transform = 'translateY(-1px)';
      }
    });
    
    item.addEventListener('mouseleave', () => {
      if (!isSelected) {
        item.style.backgroundColor = '#f8f9fa';
        item.style.transform = 'translateY(0)';
      }
    });
    
    return item;
  }
  
  function getContainerStatusIcon(container) {
    if (container.hasConsentMode && container.tagCount > 0) {
      return '🟢'; // Healthy
    } else if (container.hasConsentMode) {
      return '🟡'; // Warning
    } else {
      return '🔴'; // Issue
    }
  }
  
  function getStatusBadge(container) {
    if (container.hasConsentMode && container.tagCount > 0) {
      return '<span style="background: #28a745; color: white; padding: 1px 4px; border-radius: 2px; font-size: 9px;">ACTIVE</span>';
    } else if (container.hasConsentMode) {
      return '<span style="background: #ffc107; color: black; padding: 1px 4px; border-radius: 2px; font-size: 9px;">SETUP</span>';
    } else {
      return '<span style="background: #dc3545; color: white; padding: 1px 4px; border-radius: 2px; font-size: 9px;">ISSUE</span>';
    }
  }
  
  function selectContainer(containerId) {
    selectedContainer = containerId;
    
    // Update UI to show selection
    document.querySelectorAll('.container-item').forEach(item => {
      const isSelected = item.dataset.containerId === containerId;
      item.style.borderColor = isSelected ? '#007bff' : '#e0e0e0';
      item.style.backgroundColor = isSelected ? '#f0f8ff' : '#f8f9fa';
      
      const metrics = item.querySelector('.container-metrics');
      if (metrics) {
        metrics.style.display = isSelected ? 'block' : 'none';
      }
    });
    
    // Notify other components of container selection
    if (window.TagList) {
      window.TagList.setActiveContainer(containerId);
    }
    
    console.log(`📦 Selected container: ${containerId}`);
  }
  
  async function refreshContainers() {
    try {
      const result = await contentScriptInterface.sendMessage('checkGTM', { forceRefresh: true });
      if (result && result.containers) {
        updateContainers(result.containers);
      }
    } catch (error) {
      console.error('Error refreshing containers:', error);
    }
  }
  
  function showContainerSettings() {
    // Show container settings modal/panel
    alert('Container settings panel would open here');
  }
  
  function switchActiveContainer() {
    if (!selectedContainer) return;
    
    // Switch to selected container as primary
    const container = currentContainers.find(c => c.id === selectedContainer);
    if (container) {
      // Move selected container to primary position
      const index = currentContainers.indexOf(container);
      if (index > 0) {
        currentContainers.splice(index, 1);
        currentContainers.unshift(container);
        updateContainers(currentContainers);
      }
    }
  }
  
  function compareContainers() {
    if (currentContainers.length < 2) return;
    
    // Create comparison view
    const comparison = currentContainers.map(container => ({
      id: container.id,
      hasConsentMode: container.hasConsentMode,
      tagCount: container.tagCount || 0,
      dataLayerSize: container.dataLayer || 0
    }));
    
    console.table(comparison);
    alert('Container comparison logged to console');
  }
  
  function analyzeSelectedContainer() {
    if (!selectedContainer) return;
    
    const container = currentContainers.find(c => c.id === selectedContainer);
    if (container) {
      console.log('📊 Analyzing container:', container);
      alert(`Analyzing container ${container.id} - check console for details`);
    }
  }
  
  // Public API
  return {
    initialize,
    updateContainers,
    refreshContainers,
    getContainerInfo: (containerId) => currentContainers.find(c => c.id === containerId),
    getAllContainers: () => currentContainers,
    getPrimaryContainer: () => currentContainers[0] || null,
    getSelectedContainer: () => selectedContainer,
    selectContainer
  };
})();

window.ContainersPanel = ContainersPanel;