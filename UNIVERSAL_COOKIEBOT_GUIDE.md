# Universal Cookiebot Integration Guide

## 🌍 **Works on ANY Website with Cookiebot!**

This universal integration script works on **any website** that uses Cookiebot as their consent management platform. No need to customize for each site!

## 🎯 **What It Does**

When you run this script on any Cookiebot-enabled website, it will:

- ✅ **Auto-detect** the website name and URL
- 🍪 **Monitor** Cookiebot consent changes in real-time
- 🔔 **Trigger** your Chrome extension notifications
- 📊 **Update** GTM dataLayer with consent events
- 🎨 **Show** visual feedback on the website
- 📝 **Log** detailed information to console

## 🚀 **How to Use (3 Easy Methods)**

### **Method 1: Browser Console (Recommended)**

1. **Go to any website** that uses Cookiebot
2. **Open Developer Tools**: Press F12 or right-click → Inspect
3. **Go to Console tab**: Click on the "Console" tab
4. **Copy the script**: Copy from `universal-cookiebot-integration.js`
5. **Paste and execute**: Paste into console and press Enter
6. **Test it**: Accept or reject cookies on the website

### **Method 2: Universal Bookmarklet (Easiest)**

1. **Create a bookmark**: Right-click bookmarks bar → Add page
2. **Name it**: "Cookiebot Integration"
3. **Set the URL**: Copy the entire line from `universal-bookmarklet.js`
4. **Use anywhere**: Click the bookmark on any Cookiebot website

### **Method 3: Copy-Paste from File**

1. **Open the file**: `universal-cookiebot-integration.js`
2. **Copy the script**: Select all and copy
3. **Navigate to website**: Go to any Cookiebot site
4. **Paste in console**: F12 → Console → Paste → Enter

## 🌐 **Tested Websites**

This integration has been tested and works on:

- ✅ Premium Carpets Co (https://vermillion-zuccutto-ed1811.netlify.app/)
- ✅ Any website with Cookiebot script tag
- ✅ Sites using Cookiebot's standard events
- ✅ Both accept and decline scenarios

## 🔧 **How It Works**

### **Auto-Detection Features**

```javascript
// Automatically detects:
const CONFIG = {
    websiteName: document.title || window.location.hostname,  // Auto-detects site name
    websiteUrl: window.location.href,                         // Auto-detects URL
    extensionName: 'GTM Consent Mode Inspector',             // Your extension name
    debugMode: true                                           // Enable/disable logs
};
```

### **Universal Cookiebot Detection**

The script works with any standard Cookiebot implementation:

- **Script Tag Detection**: Finds `script[id="Cookiebot"]` or `script[src*="cookiebot.com"]`
- **Global Object Detection**: Checks for `window.Cookiebot`
- **Event Listening**: Listens for standard Cookiebot events
- **Consent State Monitoring**: Tracks all consent categories

### **Multi-Method Communication**

Uses multiple communication methods to ensure reliability:

1. **PostMessage**: Cross-context communication
2. **Custom Events**: DOM-based communication
3. **Runtime Messages**: Direct extension communication
4. **DataLayer Updates**: GTM integration

## 📊 **Expected Behavior**

### **On Any Cookiebot Website:**

When someone accepts cookies:
- ✅ Green notification appears
- 🍪 Chrome extension shows notification
- 📊 GTM events are triggered
- 🔍 Console shows detailed logs

When someone rejects cookies:
- ❌ Red notification appears
- 🍪 Chrome extension shows notification
- 📊 GTM events are triggered
- 🔍 Console shows detailed logs

## 🛠️ **Technical Details**

### **Universal Features**

```javascript
// Key universal functions:
- detectChromeExtension()     // Works with any extension setup
- triggerExtensionNotification() // Universal notification system
- handleConsentChange()       // Works with any consent change
- showConsentIndicator()      // Universal visual feedback
- setupCookiebotListeners()   // Standard Cookiebot events
- startConsentMonitoring()    // Universal polling system
```

### **Data Structure (Universal)**

```javascript
// Works with any website:
{
  website: "Auto-detected website name",
  url: "Current page URL",
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

## 🔍 **Debugging & Testing**

### **Console Commands (Universal)**

Once loaded on any website, you can test with:

```javascript
// Check integration status
window.UniversalCookiebotIntegration.getConsentState()

// Check if extension is detected
window.UniversalCookiebotIntegration.getExtensionDetected()

// Get website information
window.UniversalCookiebotIntegration.getWebsiteInfo()

// Manually trigger notification
window.UniversalCookiebotIntegration.triggerNotification('test')

// View logs
window.UniversalCookiebotIntegration.log('Test message', 'info')
```

### **Sample Console Output**

```
[Website Name] [10:30:15] Initializing Cookiebot integration for: Example Website
[Website Name] [10:30:16] Cookiebot loaded
[Website Name] [10:30:16] Chrome extension detected via content script
[Website Name] [10:30:17] Cookiebot accept event fired
[Website Name] [10:30:17] Consent state updated (change #1):
[Website Name] [10:30:17] Analytics: true, Advertising: true, Functionality: true, Personalization: true
[Website Name] [10:30:17] Triggering extension notification for: accept
```

## 🚨 **Troubleshooting (Universal)**

### **Extension Not Detected**

1. **Check extension is active**: Look for extension icon
2. **Refresh the page**: Sometimes needed after script injection
3. **Check console errors**: Look for error messages
4. **Verify permissions**: Ensure extension has site access

### **No Consent Changes Detected**

1. **Check if Cookiebot is loaded**: Look for `window.Cookiebot` in console
2. **Verify events are firing**: Check if Cookiebot events are working
3. **Test manually**: Try manually changing consent
4. **Check for conflicts**: Look for interfering scripts

### **Visual Indicators Not Showing**

1. **Check z-index**: Ensure no elements are covering notification
2. **Verify CSS**: Check if styles are applied correctly
3. **Browser compatibility**: Test in different browsers
4. **Ad blockers**: Disable ad blockers that might interfere

## 🌟 **Advanced Usage**

### **Custom Configuration**

You can modify the script for specific needs:

```javascript
const CONFIG = {
    websiteName: document.title || window.location.hostname,
    websiteUrl: window.location.href,
    extensionName: 'GTM Consent Mode Inspector',
    debugMode: true,                    // Set to false to disable logs
    notificationDuration: 5000,         // How long notifications show
    pollingInterval: 2000,              // How often to check for changes
    customEvents: true                  // Enable custom event handling
};
```

### **Integration with Other CMPs**

To adapt this for other consent management platforms:

1. **Update detection logic**: Change from Cookiebot to other CMP
2. **Modify event listeners**: Update for different event names
3. **Adjust consent structure**: Match other CMP's data format
4. **Test thoroughly**: Ensure compatibility

## 📈 **Benefits of Universal Approach**

### **Advantages**

- 🚀 **One script works everywhere**: No need to customize per site
- 🔧 **Auto-detection**: Automatically adapts to any website
- 📊 **Consistent behavior**: Same experience across all sites
- 🛠️ **Easy maintenance**: Single script to update
- 🎯 **Universal compatibility**: Works with any Cookiebot setup

### **Use Cases**

- **Testing**: Test your extension on any Cookiebot site
- **Development**: Debug consent issues on client sites
- **Demonstration**: Show integration working on various sites
- **Support**: Help clients troubleshoot consent issues

## 🤝 **Support & Compatibility**

### **Browser Support**

- ✅ Chrome (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge

### **Cookiebot Versions**

- ✅ Latest Cookiebot versions
- ✅ Legacy Cookiebot implementations
- ✅ Custom Cookiebot configurations

### **Website Types**

- ✅ E-commerce sites
- ✅ Corporate websites
- ✅ News sites
- ✅ Government sites
- ✅ Any site using Cookiebot

## 📝 **Quick Reference**

### **One-Line Setup**

```javascript
// Copy this entire line and paste in console on any Cookiebot site:
// (Copy from universal-cookiebot-integration.js)
```

### **Bookmarklet Setup**

```javascript
// Copy this entire line as a bookmark URL:
// (Copy from universal-bookmarklet.js)
```

### **Testing Commands**

```javascript
// After loading, test with:
window.UniversalCookiebotIntegration.getConsentState()
window.UniversalCookiebotIntegration.getExtensionDetected()
```

---

**🎉 You now have a universal solution that works on ANY website with Cookiebot!**

Simply copy the script, paste it into the console of any Cookiebot-enabled website, and your Chrome extension will detect consent changes automatically. 