// triggers-vars.js - Triggers & Variables Analysis Module
const TriggersVarsModule = (function() {
  let currentAnalysis = null;
  let currentFilters = {
    triggers: 'all',
    variables: 'all'
  };

  function init(contentInterface) {
    console.log('🔍 Initializing Triggers & Variables module...');
    
    // Set up event listeners
    setupEventListeners();
    
    // Initial load
    loadAnalysis();
  }

  function setupEventListeners() {
    // Filter buttons for triggers
    document.querySelectorAll('[data-trigger-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const filter = e.target.dataset.triggerFilter;
        setTriggerFilter(filter);
      });
    });

    // Filter buttons for variables
    document.querySelectorAll('[data-variable-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const filter = e.target.dataset.variableFilter;
        setVariableFilter(filter);
      });
    });

    // Action buttons
    document.getElementById('refreshAnalysis').addEventListener('click', loadAnalysis);
    document.getElementById('exportAnalysis').addEventListener('click', exportAnalysis);
    document.getElementById('showConsentDependencies').addEventListener('click', showConsentDependencies);
  }

  async function loadAnalysis() {
    try {
      console.log('🔍 Loading comprehensive tag analysis...');
      
      // Show loading state
      showLoading();
      
      // Get comprehensive analysis from page
      const analysis = await contentInterface.sendMessage('getComprehensiveTagAnalysis');
      
      if (analysis && !analysis.error) {
        currentAnalysis = analysis;
        updateOverview(analysis);
        renderTriggers(analysis.triggers);
        renderVariables(analysis.variables);
        renderMappings(analysis.tagTriggerMap);
        hideLoading();
      } else {
        console.error('❌ Error loading analysis:', analysis?.error);
        showError('Failed to load analysis: ' + (analysis?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Error in loadAnalysis:', error);
      showError('Failed to load analysis: ' + error.message);
    }
  }

  function updateOverview(analysis) {
    const { summary } = analysis;
    
    document.getElementById('totalTagsValue').textContent = summary.totalTags;
    document.getElementById('totalTriggersValue').textContent = summary.totalTriggers;
    document.getElementById('totalVariablesValue').textContent = summary.totalVariables;
    document.getElementById('mappedTagsValue').textContent = summary.tagsWithTriggers;
  }

  function renderTriggers(triggers) {
    const container = document.getElementById('triggerList');
    
    if (!triggers || triggers.length === 0) {
      container.innerHTML = '<div class="trigger-item empty-state">No triggers detected...</div>';
      return;
    }

    const filteredTriggers = filterTriggers(triggers, currentFilters.triggers);
    
    container.innerHTML = filteredTriggers.map(trigger => `
      <div class="trigger-item">
        <div class="trigger-header">
          <span class="trigger-name">${escapeHtml(trigger.name)}</span>
          <span class="trigger-type">${escapeHtml(trigger.type || 'unknown')}</span>
        </div>
        <div class="trigger-details">
          <strong>Event:</strong> ${escapeHtml(trigger.event || 'N/A')}<br>
          <strong>Source:</strong> ${escapeHtml(trigger.source || 'unknown')}<br>
          ${trigger.timestamp ? `<strong>Time:</strong> ${new Date(trigger.timestamp).toLocaleTimeString()}<br>` : ''}
          ${trigger.dataLayerIndex !== undefined ? `<strong>DataLayer Index:</strong> ${trigger.dataLayerIndex}<br>` : ''}
        </div>
        ${trigger.consentType ? `
          <div class="trigger-consent ${trigger.consentType}">
            <strong>Consent Required:</strong> ${trigger.consentType.replace('_', ' ')}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function renderVariables(variables) {
    const container = document.getElementById('variableList');
    
    if (!variables || variables.length === 0) {
      container.innerHTML = '<div class="variable-item empty-state">No variables detected...</div>';
      return;
    }

    const filteredVariables = filterVariables(variables, currentFilters.variables);
    
    container.innerHTML = filteredVariables.map(variable => `
      <div class="variable-item">
        <div class="variable-header">
          <span class="variable-name">${escapeHtml(variable.name)}</span>
          <span class="variable-type">${escapeHtml(variable.type || 'unknown')}</span>
        </div>
        <div class="variable-details">
          <strong>Source:</strong> ${escapeHtml(variable.source || 'unknown')}<br>
          <strong>Data Type:</strong> ${escapeHtml(variable.dataType || 'unknown')}<br>
          ${variable.container ? `<strong>Container:</strong> ${escapeHtml(variable.container)}<br>` : ''}
          ${variable.dataLayerIndex !== undefined ? `<strong>DataLayer Index:</strong> ${variable.dataLayerIndex}<br>` : ''}
        </div>
        <div class="variable-value">${escapeHtml(variable.value)}</div>
      </div>
    `).join('');
  }

  function renderMappings(mappings) {
    const container = document.getElementById('mappingList');
    
    if (!mappings || mappings.length === 0) {
      container.innerHTML = '<div class="mapping-item empty-state">No tag-trigger mappings detected...</div>';
      return;
    }

    container.innerHTML = mappings.map(mapping => `
      <div class="mapping-item">
        <div class="mapping-header">
          <span class="mapping-name">Tag-Trigger Mapping</span>
          <span class="mapping-type">${escapeHtml(mapping.container || 'unknown')}</span>
        </div>
        <div class="mapping-details">
          <span class="mapping-tag">${escapeHtml(mapping.tag || 'Unknown Tag')}</span>
          <span class="mapping-trigger">${escapeHtml(mapping.trigger || 'Unknown Trigger')}</span>
        </div>
      </div>
    `).join('');
  }

  function filterTriggers(triggers, filter) {
    if (filter === 'all') return triggers;
    
    return triggers.filter(trigger => {
      const name = trigger.name.toLowerCase();
      switch (filter) {
        case 'page-view':
          return name.includes('page view') || name.includes('pageview');
        case 'custom-event':
          return name.includes('custom event') || name.includes('event');
        case 'consent':
          return name.includes('consent') || trigger.consentType;
        case 'e-commerce':
          return name.includes('e-commerce') || name.includes('commerce') || 
                 (trigger.event && ['purchase', 'add_to_cart', 'view_item'].includes(trigger.event));
        default:
          return true;
      }
    });
  }

  function filterVariables(variables, filter) {
    if (filter === 'all') return variables;
    
    return variables.filter(variable => {
      const type = variable.type.toLowerCase();
      const source = variable.source.toLowerCase();
      
      switch (filter) {
        case 'datalayer':
          return type === 'datalayer' || source === 'datalayer';
        case 'config':
          return type === 'config' || type === 'gtag_config';
        case 'custom':
          return type === 'custom' || type === 'gtag_set';
        case 'measurement':
          return type === 'measurement_id' || type === 'container_id' || type === 'conversion_id';
        default:
          return true;
      }
    });
  }

  function setTriggerFilter(filter) {
    currentFilters.triggers = filter;
    
    // Update active button
    document.querySelectorAll('[data-trigger-filter]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.triggerFilter === filter);
    });
    
    // Re-render triggers
    if (currentAnalysis) {
      renderTriggers(currentAnalysis.triggers);
    }
  }

  function setVariableFilter(filter) {
    currentFilters.variables = filter;
    
    // Update active button
    document.querySelectorAll('[data-variable-filter]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.variableFilter === filter);
    });
    
    // Re-render variables
    if (currentAnalysis) {
      renderVariables(currentAnalysis.variables);
    }
  }

  function exportAnalysis() {
    if (!currentAnalysis) {
      showError('No analysis data to export');
      return;
    }

    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        analysis: currentAnalysis,
        filters: currentFilters
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `gtm-analysis-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('✅ Analysis exported successfully');
    } catch (error) {
      console.error('❌ Error exporting analysis:', error);
      showError('Failed to export analysis: ' + error.message);
    }
  }

  function showConsentDependencies() {
    if (!currentAnalysis) {
      showError('No analysis data available');
      return;
    }

    const { consentDependencies, tags } = currentAnalysis;
    
    let message = 'Consent Dependencies:\n\n';
    
    if (consentDependencies && consentDependencies.length > 0) {
      consentDependencies.forEach(dep => {
        message += `• ${dep.tag}: ${dep.consentType}\n`;
      });
    } else {
      message += 'No explicit consent dependencies found.\n\n';
    }

    message += '\nTag Consent Requirements:\n';
    tags.forEach(tag => {
      message += `• ${tag.name}: ${tag.consentType} (${tag.allowed ? 'Allowed' : 'Blocked'})\n`;
    });

    alert(message);
  }

  function showLoading() {
    const containers = ['triggerList', 'variableList', 'mappingList'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = '<div class="loading">Loading...</div>';
      }
    });
  }

  function hideLoading() {
    // Loading state is cleared when content is rendered
  }

  function showError(message) {
    console.error('❌ Error:', message);
    // You could implement a more sophisticated error display here
    alert('Error: ' + message);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    init: init,
    loadAnalysis: loadAnalysis,
    refresh: loadAnalysis
  };
})(); 