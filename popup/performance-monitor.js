// popup/performance-monitor.js - COMPLETE Implementation
const PerformanceMonitor = (function() {
  let performanceData = {
    metrics: {},
    errors: [],
    lastUpdate: null,
    isMonitoring: false
  };

  function init(contentInterface) {
    
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
    
    // Start real-time monitoring
    startRealTimeMonitoring(contentInterface);
    
    // Initial load
    refreshPerformanceData(contentInterface);
  }

  function startRealTimeMonitoring(contentInterface) {
    if (performanceData.isMonitoring) return;
    
    performanceData.isMonitoring = true;
    
    // Monitor every 5 seconds
    setInterval(async () => {
      try {
        const metrics = await contentInterface.sendMessage('getPerformanceMetrics');
        if (metrics && !metrics.error) {
          performanceData.metrics = metrics;
          performanceData.lastUpdate = new Date();
          updatePerformanceDisplay();
        }
      } catch (error) {
        addError(error, 'Real-time monitoring');
      }
    }, 5000);
  }

  async function refreshPerformanceData(contentInterface) {
    try {
      
      // Get metrics from all sources
      const [metrics, errors] = await Promise.all([
        contentInterface.sendMessage('getPerformanceMetrics'),
        contentInterface.sendMessage('getErrors')
      ]);
      
      if (metrics && !metrics.error) {
        performanceData.metrics = metrics;
        performanceData.lastUpdate = new Date();
        updatePerformanceDisplay();
      }
      
      if (errors && Array.isArray(errors)) {
        performanceData.errors = errors;
        updateErrorLog();
      }
      
    } catch (error) {
      showError('Failed to retrieve performance data');
    }
  }

  function updatePerformanceDisplay() {
    const metrics = performanceData.metrics;
    
    // Update overview values with null checks
    const totalTimeEl = document.getElementById('totalTimeValue');
    const memoryUsedEl = document.getElementById('memoryUsedValue');
    const triggerCountEl = document.getElementById('triggerCountValue');
    const variableCountEl = document.getElementById('variableCountValue');
    
    if (totalTimeEl) totalTimeEl.textContent = `${metrics.totalTime || 0}ms`;
    
    if (memoryUsedEl) {
      if (metrics.memory) {
        const usedMB = Math.round(metrics.memory.used / 1024 / 1024);
        memoryUsedEl.textContent = `${usedMB}MB`;
      } else {
        memoryUsedEl.textContent = 'N/A';
      }
    }
    
    if (triggerCountEl) triggerCountEl.textContent = metrics.triggerCount || 0;
    if (variableCountEl) variableCountEl.textContent = metrics.variableCount || 0;
    
    // Update detailed sections
    updateTimingBreakdown(metrics);
    updateMemoryInfo(metrics.memory);
    updateErrorLog();
  }

  function updateTimingBreakdown(metrics) {
    const timingList = document.getElementById('timingList');
    if (!timingList) return;
    
    const timingItems = [];
    
    // Extract timing metrics
    Object.entries(metrics).forEach(([key, value]) => {
      if (typeof value === 'number' && key.includes('Time') && key !== 'totalTime') {
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
    if (!memoryInfo) return;
    
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
          <div class="memory-bar-fill" style="width: ${Math.min(usagePercentage, 100)}%"></div>
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
    if (!errorLog) return;
    
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
        url: 'Extension Context',
        userAgent: navigator.userAgent
      }
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `gtm-performance-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  function clearPerformanceData() {
    performanceData = {
      metrics: {},
      errors: [],
      lastUpdate: null,
      isMonitoring: performanceData.isMonitoring
    };
    
    updatePerformanceDisplay();
  }

  return {
    init: init,
    refreshPerformanceData: refreshPerformanceData,
    addError: addError
  };
})();

window.PerformanceMonitor = PerformanceMonitor;