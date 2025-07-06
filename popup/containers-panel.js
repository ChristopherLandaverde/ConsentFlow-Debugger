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
  
  // FIXED: Only auto-select if we don't have a selected container yet
  // and only if TagList supports it
  if (!selectedContainer && currentContainers.length > 0) {
    if (window.TagList && typeof window.TagList.setActiveContainer === 'function') {
      selectContainer(currentContainers[0].id);
    } else {
      // Just set the selected container without calling TagList
      selectedContainer = currentContainers[0].id;
    }
  }
}