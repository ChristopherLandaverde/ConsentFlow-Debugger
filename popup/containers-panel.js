// containers-panel.js - Multi-container GTM support
const ContainersPanel = (function() {
  let contentScriptInterface = null;
  let currentContainers = [];
  
  function initialize(contentInterface) {
    contentScriptInterface = contentInterface;
    console.log('📦 Containers Panel: Initialized');
    
    // Add container details to the popup if not already present
    addContainerSection();
  }
  
  function addContainerSection() {
    const statusContainer = document.querySelector('.status-container');
    if (!statusContainer) return;
    
    // Check if container section already exists
    if (document.getElementById('containersSection')) return;
    
    const containersSection = document.createElement('div');
    containersSection.id = 'containersSection';
    containersSection.className = 'containers-section';
    containersSection.style.display = 'none';
    
    containersSection.innerHTML = `
      <div class="containers-header">
        <h3>📦 GTM Containers</h3>
        <button id="refreshContainers" class="refresh-btn">🔄</button>
      </div>
      <div id="containersList" class="containers-list">
        <!-- Container items will be populated here -->
      </div>
    `;
    
    statusContainer.appendChild(containersSection);
    
    // Add event listener for refresh button
    document.getElementById('refreshContainers').addEventListener('click', () => {
      refreshContainers();
    });
  }
  
  function updateContainers(containers) {
    currentContainers = containers || [];
    
    const containersSection = document.getElementById('containersSection');
    const containersList = document.getElementById('containersList');
    
    if (!containersSection || !containersList) return;
    
    if (currentContainers.length <= 1) {
      containersSection.style.display = 'none';
      return;
    }
    
    // Show containers section for multiple containers
    containersSection.style.display = 'block';
    
    // Clear existing list
    containersList.innerHTML = '';
    
    // Add each container
    currentContainers.forEach((container, index) => {
      const containerItem = createContainerItem(container, index);
      containersList.appendChild(containerItem);
    });
  }
  
  function createContainerItem(container, index) {
    const item = document.createElement('div');
    item.className = 'container-item';
    item.style.cssText = `
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
      background: #f8f9fa;
      font-size: 12px;
    `;
    
    const isPrimary = index === 0;
    const consentIcon = container.hasConsentMode ? '🔒' : '⚠️';
    const primaryBadge = isPrimary ? '<span style="background: #007bff; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">PRIMARY</span>' : '';
    
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #333;">${container.id}</strong>
        ${primaryBadge}
      </div>
      <div style="color: #666; margin-bottom: 4px;">
        <span>Method: ${container.method}</span>
        <span style="margin-left: 12px;">Consent: ${consentIcon}</span>
      </div>
      <div style="color: #888; font-size: 11px;">
        DataLayer events: ${typeof container.dataLayer === 'number' ? container.dataLayer : 0}
      </div>
    `;
    
    return item;
  }
  
  async function refreshContainers() {
    try {
      const result = await contentScriptInterface.sendMessage('checkGTM');
      if (result && result.containers) {
        updateContainers(result.containers);
      }
    } catch (error) {
      console.error('Error refreshing containers:', error);
    }
  }
  
  function getContainerInfo(containerId) {
    return currentContainers.find(c => c.id === containerId);
  }
  
  function getAllContainers() {
    return currentContainers;
  }
  
  function getPrimaryContainer() {
    return currentContainers[0] || null;
  }
  
  return {
    initialize,
    updateContainers,
    refreshContainers,
    getContainerInfo,
    getAllContainers,
    getPrimaryContainer
  };
})(); 