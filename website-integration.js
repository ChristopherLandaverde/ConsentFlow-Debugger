// Website Integration Script for Premium Carpets Co
// This script detects Cookiebot consent changes and triggers the Chrome extension

(function() {
    'use strict';
    
    console.log('🔧 Premium Carpets Co - Cookiebot Integration Loaded');
    
    // Configuration
    const CONFIG = {
        websiteName: 'Premium Carpets Co',
        websiteUrl: 'https://vermillion-zuccutto-ed1811.netlify.app/',
        extensionName: 'GTM Consent Mode Inspector',
        debugMode: true
    };
    
    // State tracking
    let consentState = {
        analytics: null,
        advertising: null,
        functionality: null,
        personalization: null,
        necessary: null,
        lastUpdate: null
    };
    
    let extensionDetected = false;
    let consentChangeCount = 0;
    
    // Utility functions
    function log(message, type = 'info') {
        if (CONFIG.debugMode) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${CONFIG.websiteName}] [${timestamp}] ${message}`);
        }
    }
    
    function getCurrentConsent() {
        if (window.Cookiebot && window.Cookiebot.consent) {
            return {
                analytics: window.Cookiebot.consent.analytics,
                advertising: window.Cookiebot.consent.advertising,
                functionality: window.Cookiebot.consent.functionality,
                personalization: window.Cookiebot.consent.personalization,
                necessary: window.Cookiebot.consent.necessary
            };
        }
        return null;
    }
    
    function hasConsentChanged(newConsent) {
        if (!newConsent) return false;
        
        const oldConsent = consentState;
        return (
            oldConsent.analytics !== newConsent.analytics ||
            oldConsent.advertising !== newConsent.advertising ||
            oldConsent.functionality !== newConsent.functionality ||
            oldConsent.personalization !== newConsent.personalization ||
            oldConsent.necessary !== newConsent.necessary
        );
    }
    
    function updateConsentState(newConsent) {
        consentState = { ...newConsent, lastUpdate: Date.now() };
        consentChangeCount++;
        log(`Consent state updated (change #${consentChangeCount}):`, 'success');
        log(`Analytics: ${newConsent.analytics}, Advertising: ${newConsent.advertising}, Functionality: ${newConsent.functionality}, Personalization: ${newConsent.personalization}`, 'info');
    }
    
    // Chrome Extension Detection
    function detectChromeExtension() {
        // Method 1: Check for extension content script
        if (window.gtmInspectorContentLoaded) {
            extensionDetected = true;
            log('Chrome extension detected via content script', 'success');
            return true;
        }
        
        // Method 2: Check for extension injected script
        if (window.ConsentInspector) {
            extensionDetected = true;
            log('Chrome extension detected via injected script', 'success');
            return true;
        }
        
        // Method 3: Try to communicate with extension
        if (window.chrome && window.chrome.runtime) {
            try {
                // This will only work if the extension is installed and active
                chrome.runtime.sendMessage('ping', (response) => {
                    if (response && response.success) {
                        extensionDetected = true;
                        log('Chrome extension detected via runtime message', 'success');
                    }
                });
            } catch (e) {
                // Extension not available
            }
        }
        
        return false;
    }
    
    // Trigger extension notification
    function triggerExtensionNotification(consentAction) {
        if (!extensionDetected) {
            log('Extension not detected, attempting to detect...', 'warning');
            detectChromeExtension();
        }
        
        const notificationData = {
            website: CONFIG.websiteName,
            url: window.location.href,
            action: consentAction,
            consent: getCurrentConsent(),
            timestamp: Date.now(),
            changeCount: consentChangeCount
        };
        
        log(`Triggering extension notification for: ${consentAction}`, 'info');
        
        // Method 1: Post message to extension
        window.postMessage({
            type: 'COOKIEBOT_CONSENT_CHANGE',
            data: notificationData
        }, '*');
        
        // Method 2: Custom event
        const event = new CustomEvent('cookiebotConsentChange', {
            detail: notificationData
        });
        window.dispatchEvent(event);
        
        // Method 3: Try to communicate with extension directly
        if (window.chrome && window.chrome.runtime) {
            try {
                chrome.runtime.sendMessage({
                    action: 'cookiebotConsentChange',
                    data: notificationData
                });
            } catch (e) {
                // Extension not available
            }
        }
        
        // Method 4: Update dataLayer for GTM integration
        if (window.dataLayer) {
            window.dataLayer.push({
                'event': 'cookiebot_consent_change',
                'consent_action': consentAction,
                'consent_data': notificationData,
                'extension_triggered': extensionDetected
            });
        }
    }
    
    // Consent change handlers
    function handleConsentChange(action) {
        const currentConsent = getCurrentConsent();
        
        if (!currentConsent) {
            log('No consent data available', 'warning');
            return;
        }
        
        if (hasConsentChanged(currentConsent)) {
            updateConsentState(currentConsent);
            triggerExtensionNotification(action);
            
            // Show visual indicator
            showConsentIndicator(action);
        } else {
            log('No consent change detected', 'info');
        }
    }
    
    // Visual indicator for consent changes
    function showConsentIndicator(action) {
        // Remove existing indicator
        const existingIndicator = document.getElementById('consent-change-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Create new indicator
        const indicator = document.createElement('div');
        indicator.id = 'consent-change-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${action === 'accept' ? '#28a745' : '#dc3545'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            max-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;
        
        const icon = action === 'accept' ? '✅' : '❌';
        const message = action === 'accept' ? 
            'Cookies accepted! Chrome extension notified.' : 
            'Cookies rejected! Chrome extension notified.';
        
        indicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 18px;">${icon}</span>
                <div>
                    <div style="font-weight: bold;">${CONFIG.extensionName}</div>
                    <div style="font-size: 12px; opacity: 0.9;">${message}</div>
                </div>
            </div>
        `;
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(indicator);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => {
                    if (indicator.parentNode) {
                        indicator.remove();
                    }
                }, 300);
            }
        }, 5000);
        
        // Add slideOut animation
        const slideOutStyle = document.createElement('style');
        slideOutStyle.textContent = `
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(slideOutStyle);
    }
    
    // Event listeners for Cookiebot
    function setupCookiebotListeners() {
        // Cookiebot load event
        window.addEventListener('CookiebotOnLoad', function() {
            log('Cookiebot loaded', 'success');
            detectChromeExtension();
            
            // Check initial consent state
            const initialConsent = getCurrentConsent();
            if (initialConsent) {
                updateConsentState(initialConsent);
                log('Initial consent state detected', 'info');
            }
        });
        
        // Cookiebot accept event
        window.addEventListener('CookiebotOnAccept', function() {
            log('Cookiebot accept event fired', 'success');
            handleConsentChange('accept');
        });
        
        // Cookiebot decline event
        window.addEventListener('CookiebotOnDecline', function() {
            log('Cookiebot decline event fired', 'success');
            handleConsentChange('decline');
        });
        
        // Cookiebot consent update event
        window.addEventListener('CookiebotOnConsentReady', function() {
            log('Cookiebot consent ready event fired', 'success');
            const consent = getCurrentConsent();
            if (consent) {
                updateConsentState(consent);
                triggerExtensionNotification('update');
            }
        });
        
        // Listen for manual consent changes
        window.addEventListener('CookiebotOnDialogInit', function() {
            log('Cookiebot dialog initialized', 'info');
        });
        
        window.addEventListener('CookiebotOnDialogDisplay', function() {
            log('Cookiebot dialog displayed', 'info');
        });
    }
    
    // Monitor for consent changes
    function startConsentMonitoring() {
        let lastConsent = getCurrentConsent();
        
        setInterval(() => {
            const currentConsent = getCurrentConsent();
            if (currentConsent && lastConsent) {
                if (hasConsentChanged(currentConsent)) {
                    log('Consent change detected via monitoring', 'info');
                    updateConsentState(currentConsent);
                    triggerExtensionNotification('monitor');
                }
            }
            lastConsent = currentConsent;
        }, 2000); // Check every 2 seconds
    }
    
    // Initialize integration
    function initialize() {
        log('Initializing Premium Carpets Co Cookiebot integration...', 'info');
        
        // Setup event listeners
        setupCookiebotListeners();
        
        // Start monitoring
        startConsentMonitoring();
        
        // Detect extension
        detectChromeExtension();
        
        // Check if Cookiebot is already loaded
        if (window.Cookiebot) {
            log('Cookiebot already loaded, checking consent state', 'info');
            const consent = getCurrentConsent();
            if (consent) {
                updateConsentState(consent);
            }
        }
        
        log('Integration initialized successfully', 'success');
    }
    
    // Start integration when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    // Export for external access
    window.PremiumCarpetsCookiebotIntegration = {
        getConsentState: () => consentState,
        getExtensionDetected: () => extensionDetected,
        triggerNotification: triggerExtensionNotification,
        log: log
    };
    
})(); 