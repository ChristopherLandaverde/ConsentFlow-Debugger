// IAB TCF Framework Module
const IABTCF = (function() {
  let contentInterface = null;
  let currentTCFData = null;
  let currentCMPData = null;

  // Purpose definitions for TCF v2.2
  const TCF_PURPOSES = {
    1: 'Store and/or access information on a device',
    2: 'Select basic ads',
    3: 'Create a personalised ads profile',
    4: 'Select personalised ads',
    5: 'Create a personalised content profile',
    6: 'Select personalised content',
    7: 'Measure ad performance',
    8: 'Measure content performance',
    9: 'Apply market research to generate audience insights',
    10: 'Develop and improve products',
    11: 'Use limited data to select content',
    12: 'Ensure security, prevent fraud, and debug',
    13: 'Technically deliver ads or content',
    14: 'Match and combine offline data sources',
    15: 'Link different devices',
    16: 'Receive and use automatically-sent device characteristics for identification',
    17: 'Ensure security, prevent fraud, and debug',
    18: 'Identify devices based on information transmitted automatically',
    19: 'Use real-time geolocation data',
    20: 'Actively scan device characteristics for identification',
    21: 'Use precise geolocation data',
    22: 'Use scanning of device characteristics for identification',
    23: 'Ensure security, prevent fraud, and debug',
    24: 'Use precise geolocation data',
    25: 'Measure ad performance',
    26: 'Develop and improve products',
    27: 'Use limited data to select content',
    28: 'Ensure security, prevent fraud, and debug',
    29: 'Technically deliver ads or content',
    30: 'Match and combine offline data sources',
    31: 'Link different devices',
    32: 'Receive and use automatically-sent device characteristics for identification',
    33: 'Ensure security, prevent fraud, and debug',
    34: 'Identify devices based on information transmitted automatically',
    35: 'Use real-time geolocation data',
    36: 'Actively scan device characteristics for identification',
    37: 'Use precise geolocation data',
    38: 'Use scanning of device characteristics for identification',
    39: 'Ensure security, prevent fraud, and debug',
    40: 'Use precise geolocation data',
    41: 'Measure ad performance',
    42: 'Develop and improve products',
    43: 'Use limited data to select content',
    44: 'Ensure security, prevent fraud, and debug',
    45: 'Technically deliver ads or content',
    46: 'Match and combine offline data sources',
    47: 'Link different devices',
    48: 'Receive and use automatically-sent device characteristics for identification',
    49: 'Ensure security, prevent fraud, and debug',
    50: 'Identify devices based on information transmitted automatically'
  };

  function init(interface) {
    contentInterface = interface;
    setupEventListeners();
    loadTCFData();
  }

  function setupEventListeners() {
    // Refresh TCF data
    const refreshBtn = document.getElementById('refreshTCF');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadTCFData);
    }

    // Parse consent string
    const parseBtn = document.getElementById('parseConsentString');
    if (parseBtn) {
      parseBtn.addEventListener('click', parseConsentString);
    }
  }

  async function loadTCFData() {
    try {
      // Get TCF data from injected script
      const tcfData = await contentInterface.sendMessage('detectIABTCF');
      const cmpData = await contentInterface.sendMessage('detectCMP');
      
      currentTCFData = tcfData;
      currentCMPData = cmpData;
      
      updateTCFDisplay(tcfData, cmpData);
    } catch (error) {
      console.error('Error loading TCF data:', error);
      showError('Failed to load TCF data');
    }
  }

  function updateTCFDisplay(tcfData, cmpData) {
    // Update overview values
    const tcfVersionEl = document.getElementById('tcfVersionValue');
    const cmpNameEl = document.getElementById('cmpNameValue');
    const gdprAppliesEl = document.getElementById('gdprAppliesValue');
    const consentStringEl = document.getElementById('consentStringValue');

    if (tcfVersionEl) {
      tcfVersionEl.textContent = tcfData.version || 'Not detected';
      tcfVersionEl.className = tcfData.detected ? 'value detected' : 'value not-detected';
    }

    if (cmpNameEl) {
      cmpNameEl.textContent = cmpData.detected ? `${cmpData.name} (ID: ${cmpData.cmpId})` : 'None';
      cmpNameEl.className = cmpData.detected ? 'value detected' : 'value not-detected';
    }

    if (gdprAppliesEl) {
      gdprAppliesEl.textContent = tcfData.gdprApplies ? 'Yes' : 'No';
      gdprAppliesEl.className = tcfData.gdprApplies ? 'value yes' : 'value no';
    }

    if (consentStringEl) {
      if (tcfData.consentString) {
        const shortString = tcfData.consentString.length > 20 ? 
          tcfData.consentString.substring(0, 20) + '...' : 
          tcfData.consentString;
        consentStringEl.textContent = shortString;
        consentStringEl.title = tcfData.consentString;
        consentStringEl.className = 'value detected';
      } else {
        consentStringEl.textContent = 'None';
        consentStringEl.className = 'value not-detected';
      }
    }

    // Update purpose consents
    updatePurposeConsents(tcfData.purposeConsents);
    
    // Update vendor consents
    updateVendorConsents(tcfData.vendorConsents);
  }

  function updatePurposeConsents(purposeConsents) {
    const container = document.getElementById('purposeConsents');
    if (!container) return;

    if (!purposeConsents || Object.keys(purposeConsents).length === 0) {
      container.innerHTML = '<div class="empty-state">No purpose consents detected</div>';
      return;
    }

    const html = Object.entries(purposeConsents).map(([purposeId, granted]) => {
      const purposeName = TCF_PURPOSES[purposeId] || `Purpose ${purposeId}`;
      const statusClass = granted ? 'granted' : 'denied';
      const statusText = granted ? 'Granted' : 'Denied';
      
      return `
        <div class="consent-item ${statusClass}">
          <div class="consent-header">
            <span class="consent-id">${purposeId}</span>
            <span class="consent-status">${statusText}</span>
          </div>
          <div class="consent-description">${purposeName}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  function updateVendorConsents(vendorConsents) {
    const container = document.getElementById('vendorConsents');
    if (!container) return;

    if (!vendorConsents || Object.keys(vendorConsents).length === 0) {
      container.innerHTML = '<div class="empty-state">No vendor consents detected</div>';
      return;
    }

    const html = Object.entries(vendorConsents).map(([vendorId, granted]) => {
      const statusClass = granted ? 'granted' : 'denied';
      const statusText = granted ? 'Granted' : 'Denied';
      
      return `
        <div class="consent-item ${statusClass}">
          <div class="consent-header">
            <span class="consent-id">Vendor ${vendorId}</span>
            <span class="consent-status">${statusText}</span>
          </div>
          <div class="consent-description">Vendor ID: ${vendorId}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  async function parseConsentString() {
    if (!currentTCFData || !currentTCFData.consentString) {
      showError('No consent string available to parse');
      return;
    }

    try {
      const parsed = await contentInterface.sendMessage('parseTCFConsentString', currentTCFData.consentString);
      
      if (parsed) {
        showInfo('Consent String Parsed', `
          <strong>Raw:</strong> ${parsed.raw}<br>
          <strong>Length:</strong> ${parsed.length}<br>
          <strong>Version:</strong> ${parsed.version}<br>
          <strong>Decoded:</strong> ${parsed.decoded.substring(0, 100)}...
        `);
      } else {
        showError('Failed to parse consent string');
      }
    } catch (error) {
      console.error('Error parsing consent string:', error);
      showError('Failed to parse consent string');
    }
  }

  function showError(message) {
    // Create a temporary error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #ff4444;
      color: white;
      padding: 10px;
      border-radius: 4px;
      z-index: 1000;
      max-width: 300px;
    `;
    
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
  }

  function showInfo(title, content) {
    // Create a temporary info message
    const infoDiv = document.createElement('div');
    infoDiv.className = 'info-message';
    infoDiv.innerHTML = `<strong>${title}</strong><br>${content}`;
    infoDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #4444ff;
      color: white;
      padding: 10px;
      border-radius: 4px;
      z-index: 1000;
      max-width: 300px;
    `;
    
    document.body.appendChild(infoDiv);
    setTimeout(() => infoDiv.remove(), 5000);
  }

  function show() {
    // Called when tab is shown
    loadTCFData();
  }

  function hide() {
    // Called when tab is hidden
    // Clean up if needed
  }

  return {
    init,
    show,
    hide
  };
})(); 