// Performance Monitor Module
const PerformanceMonitor = (function() {
  let performanceData = {
    metrics: {},
    errors: [],
    lastUpdate: null
  };

  function init(contentInterface) {
    console.log('🔧 Initializing Performance Monitor...');
    
    // Bind event listeners
    document.getElementById('refreshPerformance').addEventListener('click', () => {
      refreshPerformanceData(contentInterface);
    });
    
    document.getElementById('exportPerformance').addEventListener('click', () => {
      exportPerformanceReport();
    });
    
    document.getElementById('clearPerformanceData').addEventListener('click', () => {
      clearPerformanceData();
    });
    
    // Initial load
    refreshPerformanceData(contentInterface);
  }

  async function refreshPerformanceData(contentInterface) {
    try {
      console.log('📊 Refreshing performance data...');
      
      // Get performance metrics from injected script
      const metrics = await contentInterface.sendMessage('getPerformanceMetrics');
      
      if (metrics && !metrics.error) {
        performanceData.metrics = metrics;
        performanceData.lastUpdate = new Date();
        
        updatePerformanceDisplay();
      } else {
        console.error('❌ Failed to get performance metrics:', metrics?.error);
        showError('Failed to retrieve performance data');
      }
    } catch (error) {
      console.error('❌ Error refreshing performance data:', error);
      showError('Error refreshing performance data');
    }
  }

  function updatePerformanceDisplay() {
    const metrics = performanceData.metrics;
    
    // Update overview values
    document.getElementById('totalTimeValue').textContent = `${metrics.totalTime || 0}ms`;
    
    if (metrics.memory) {
      const usedMB = Math.round(metrics.memory.used / 1024 / 1024);
      document.getElementById('memoryUsedValue').textContent = `${usedMB}MB`;
    } else {
      document.getElementById('memoryUsedValue').textContent = 'N/A';
    }
    
    document.getElementById('triggerCountValue').textContent = metrics.triggerCount || 0;
    document.getElementById('variableCountValue').textContent = metrics.variableCount || 0;
    
    // Update timing breakdown
    updateTimingBreakdown(metrics);
    
    // Update memory info
    updateMemoryInfo(metrics.memory);
    
    // Update error log
    updateErrorLog();
  }

  function updateTimingBreakdown(metrics) {
    const timingList = document.getElementById('timingList');
    const timingItems = [];
    
    // Create timing items from metrics
    Object.entries(metrics).forEach(([key, value]) => {
      if (typeof value === 'number' && key !== 'totalTime' && key !== 'triggerCount' && key !== 'variableCount') {
        timingItems.push({
          name: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
          time: value,
          percentage: metrics.totalTime ? Math.round((value / metrics.totalTime) * 100) : 0
        });
      }
    });
    
    // Sort by time (descending)
    timingItems.sort((a, b) => b.time - a.time);
    
    if (timingItems.length === 0) {
      timingList.innerHTML = '<div class="timing-item empty-state">No timing data available...</div>';
      return;
    }
    
    timingList.innerHTML = timingItems.map(item => `
      <div class="timing-item">
        <div class="timing-name">${item.name}</div>
        <div class="timing-details">
          <span class="timing-time">${item.time}ms</span>
          <span class="timing-percentage">${item.percentage}%</span>
        </div>
        <div class="timing-bar">
          <div class="timing-bar-fill" style="width: ${item.percentage}%"></div>
        </div>
      </div>
    `).join('');
  }

  function updateMemoryInfo(memory) {
    const memoryInfo = document.getElementById('memoryInfo');
    
    if (!memory) {
      memoryInfo.innerHTML = '<div class="memory-item empty-state">Memory data not available</div>';
      return;
    }
    
    const usedMB = Math.round(memory.used / 1024 / 1024);
    const totalMB = Math.round(memory.total / 1024 / 1024);
    const limitMB = Math.round(memory.limit / 1024 / 1024);
    const usagePercentage = Math.round((memory.used / memory.limit) * 100);
    
    memoryInfo.innerHTML = `
      <div class="memory-item">
        <div class="memory-label">Used Memory</div>
        <div class="memory-value">${usedMB}MB / ${limitMB}MB</div>
        <div class="memory-bar">
          <div class="memory-bar-fill" style="width: ${usagePercentage}%"></div>
        </div>
        <div class="memory-percentage">${usagePercentage}%</div>
      </div>
      <div class="memory-item">
        <div class="memory-label">Total Allocated</div>
        <div class="memory-value">${totalMB}MB</div>
      </div>
      <div class="memory-item">
        <div class="memory-label">Memory Limit</div>
        <div class="memory-value">${limitMB}MB</div>
      </div>
    `;
  }

  function updateErrorLog() {
    const errorLog = document.getElementById('errorLog');
    
    if (performanceData.errors.length === 0) {
      errorLog.innerHTML = '<div class="error-item empty-state">No errors detected...</div>';
      return;
    }
    
    errorLog.innerHTML = performanceData.errors.map(error => `
      <div class="error-item">
        <div class="error-header">
          <span class="error-time">${new Date(error.timestamp).toLocaleTimeString()}</span>
          <span class="error-context">${error.context}</span>
        </div>
        <div class="error-message">${error.message}</div>
      </div>
    `).join('');
  }

  function addError(error, context = 'Performance Monitor') {
    performanceData.errors.push({
      message: error.message || error,
      context: context,
      timestamp: Date.now()
    });
    
    // Keep only last 10 errors
    if (performanceData.errors.length > 10) {
      performanceData.errors = performanceData.errors.slice(-10);
    }
    
    updateErrorLog();
  }

  function showError(message) {
    addError(message, 'UI Error');
  }

  function exportPerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      performanceData: performanceData,
      pageInfo: {
        url: window.location.href,
        userAgent: navigator.userAgent
      }
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  function clearPerformanceData() {
    performanceData = {
      metrics: {},
      errors: [],
      lastUpdate: null
    };
    
    updatePerformanceDisplay();
    console.log('🧹 Performance data cleared');
  }

  return {
    init: init,
    refreshPerformanceData: refreshPerformanceData,
    addError: addError
  };
})(); 