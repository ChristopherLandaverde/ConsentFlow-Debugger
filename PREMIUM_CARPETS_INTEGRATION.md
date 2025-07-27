# Premium Carpets Co - Cookiebot Integration

This integration allows your GTM Consent Mode Inspector Chrome extension to detect and respond to Cookiebot consent changes on the Premium Carpets Co website.

## 🎯 Overview

When users accept or reject cookies on the Premium Carpets Co website, your Chrome extension will:
- Detect the consent change in real-time
- Show a visual notification
- Update the extension's state
- Trigger GTM events for tracking
- Provide detailed consent information

## 📋 Prerequisites

1. **Chrome Extension**: Your GTM Consent Mode Inspector extension must be installed and active
2. **Target Website**: Access to https://vermillion-zuccutto-ed1811.netlify.app/
3. **Browser Console**: Ability to open developer tools (F12)

## 🚀 Quick Start

### Method 1: Browser Console (Recommended)

1. **Navigate to the website**: Go to https://vermillion-zuccutto-ed1811.netlify.app/
2. **Open Developer Tools**: Press F12 or right-click → Inspect
3. **Go to Console tab**: Click on the "Console" tab
4. **Copy the integration script**: Copy the script from `website-integration.js`
5. **Paste and execute**: Paste the script into the console and press Enter
6. **Test the integration**: Interact with the Cookiebot banner

### Method 2: Bookmarklet

1. **Create a bookmark**: Right-click your bookmarks bar → Add page
2. **Name it**: "Premium Carpets Integration"
3. **Set the URL**: Copy the entire line from `bookmarklet.js`
4. **Use it**: Click the bookmark when on the Premium Carpets Co website

### Method 3: Integration Page

1. **Open the integration page**: Open `premium-carpets-integration.html` in your browser
2. **Copy the script**: Click the "Copy Script" button
3. **Navigate to the website**: Go to the Premium Carpets Co website
4. **Paste in console**: Open console (F12) and paste the script

## 🔧 How It Works

### 1. Detection Methods

The integration uses multiple methods to detect your Chrome extension:

- **Content Script Detection**: Checks for `window.gtmInspectorContentLoaded`
- **Injected Script Detection**: Checks for `window.ConsentInspector`
- **Runtime Communication**: Attempts to send messages to the extension

### 2. Consent Monitoring

The integration monitors Cookiebot consent changes through:

- **Event Listeners**: Listens for Cookiebot events (`CookiebotOnAccept`, `CookiebotOnDecline`, etc.)
- **Polling**: Checks consent state every 2 seconds
- **DataLayer Monitoring**: Watches for consent-related GTM events

### 3. Notification System

When consent changes are detected:

- **Visual Indicator**: Shows a notification on the website
- **Extension Notification**: Sends data to your Chrome extension
- **GTM Events**: Updates the dataLayer with consent change events
- **Console Logging**: Provides detailed logs for debugging

## 📊 Expected Behavior

### When Cookies Are Accepted:
- ✅ Green notification appears on the website
- 🍪 Chrome extension shows a notification
- 📊 GTM events are triggered
- 🔍 Console shows detailed logs

### When Cookies Are Rejected:
- ❌ Red notification appears on the website
- 🍪 Chrome extension shows a notification
- 📊 GTM events are triggered
- 🔍 Console shows detailed logs

## 🛠️ Technical Details

### Integration Script Features

```javascript
// Key functions in the integration script:
- detectChromeExtension()     // Detects if your extension is active
- triggerExtensionNotification() // Sends data to your extension
- handleConsentChange()       // Processes consent changes
- showConsentIndicator()      // Shows visual feedback
- setupCookiebotListeners()   // Sets up event listeners
- startConsentMonitoring()    // Starts polling for changes
```

### Communication Methods

1. **PostMessage**: `window.postMessage()` for cross-context communication
2. **Custom Events**: `CustomEvent` for DOM-based communication
3. **Runtime Messages**: `chrome.runtime.sendMessage()` for extension communication
4. **DataLayer**: GTM dataLayer updates for tracking

### Data Structure

```javascript
// Consent change notification data:
{
  website: "Premium Carpets Co",
  url: "https://vermillion-zuccutto-ed1811.netlify.app/",
  action: "accept" | "decline" | "update" | "monitor",
  consent: {
    analytics: boolean,
    advertising: boolean,
    functionality: boolean,
    personalization: boolean,
    necessary: boolean
  },
  timestamp: number,
  changeCount: number
}
```

## 🔍 Debugging

### Console Logs

The integration provides detailed console logs:

```
[Premium Carpets Co] [10:30:15] Initializing Premium Carpets Co Cookiebot integration...
[Premium Carpets Co] [10:30:16] Cookiebot loaded
[Premium Carpets Co] [10:30:16] Chrome extension detected via content script
[Premium Carpets Co] [10:30:17] Cookiebot accept event fired
[Premium Carpets Co] [10:30:17] Consent state updated (change #1):
[Premium Carpets Co] [10:30:17] Analytics: true, Advertising: true, Functionality: true, Personalization: true
[Premium Carpets Co] [10:30:17] Triggering extension notification for: accept
```

### Testing Commands

Once the integration is loaded, you can test it in the console:

```javascript
// Check integration status
window.PremiumCarpetsCookiebotIntegration.getConsentState()

// Check if extension is detected
window.PremiumCarpetsCookiebotIntegration.getExtensionDetected()

// Manually trigger a notification
window.PremiumCarpetsCookiebotIntegration.triggerNotification('test')

// View logs
window.PremiumCarpetsCookiebotIntegration.log('Test message', 'info')
```

## 🚨 Troubleshooting

### Extension Not Detected

1. **Check if extension is active**: Look for the extension icon in your browser
2. **Refresh the page**: Sometimes the extension needs a page refresh
3. **Check console for errors**: Look for any error messages
4. **Verify permissions**: Ensure the extension has access to the website

### No Consent Changes Detected

1. **Check if Cookiebot is loaded**: Look for `window.Cookiebot` in console
2. **Verify event listeners**: Check if Cookiebot events are firing
3. **Test manually**: Try manually changing consent in console
4. **Check for conflicts**: Look for other scripts that might interfere

### Visual Indicators Not Showing

1. **Check z-index**: Ensure no other elements are covering the notification
2. **Verify CSS**: Check if styles are being applied correctly
3. **Browser compatibility**: Test in different browsers
4. **Ad blockers**: Disable ad blockers that might interfere

## 📈 Advanced Usage

### Custom Configuration

You can modify the integration script to customize behavior:

```javascript
const CONFIG = {
    websiteName: 'Premium Carpets Co',
    websiteUrl: 'https://vermillion-zuccutto-ed1811.netlify.app/',
    extensionName: 'GTM Consent Mode Inspector',
    debugMode: true,  // Set to false to disable console logs
    notificationDuration: 5000,  // How long notifications show
    pollingInterval: 2000  // How often to check for changes
};
```

### Integration with Other Websites

To use this integration with other websites:

1. **Update the configuration**: Change `websiteName` and `websiteUrl`
2. **Modify detection logic**: Adjust for different CMP implementations
3. **Test thoroughly**: Ensure compatibility with the target website
4. **Update event listeners**: Modify for different CMP event names

## 🤝 Support

If you encounter issues:

1. **Check the console logs** for detailed error messages
2. **Verify the extension is working** on other websites
3. **Test with the provided test page** (`test-cookiebot.html`)
4. **Check browser compatibility** and extension permissions

## 📝 Changelog

### Version 1.0.0
- Initial integration script
- Cookiebot event detection
- Chrome extension communication
- Visual notifications
- GTM dataLayer integration
- Comprehensive logging and debugging

---

**Note**: This integration is specifically designed for the Premium Carpets Co website with Cookiebot. For other websites or CMPs, modifications may be required. 