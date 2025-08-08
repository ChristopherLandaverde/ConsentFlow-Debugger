# ConsentFlow Debugger

> **Professional Chrome Extension for Google Tag Manager Consent Mode Debugging**

[![Version](https://img.shields.io/badge/version-1.0.4-blue.svg)](https://github.com/yourusername/consentflow-debugger)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-brightgreen.svg)](https://chrome.google.com/webstore)

ConsentFlow Debugger is a powerful Chrome extension designed for developers, analysts, and compliance teams who need to debug, validate, and monitor Google Tag Manager Consent Mode implementations in real-time.

---

## ✨ Key Features

### 🔍 Real-Time Inspection
- **Live GTM Detection**: Automatically detects Google Tag Manager containers and consent implementations.
- **Consent State Monitoring**: Real-time visibility into `analytics_storage`, `ad_storage`, and other consent categories.
- **Tag Status Analysis**: See which tags are firing or being blocked based on current consent state.

### 🧪 Advanced Simulation
- **Consent Scenario Testing**: Simulate different user consent choices without affecting actual cookies.
- **Before/After Analysis**: Compare tag behavior under different consent configurations.
- **Impact Assessment**: Understand how consent changes affect your marketing stack.

### 📊 Comprehensive Event Logging
- **Activity Timeline**: Complete log of consent changes, tag firings, and CMP interactions.
- **Event Filtering**: Filter by consent events, GTM events, real vs simulated activities.
- **Export Capabilities**: Export debugging data for analysis and compliance reporting.

### 🛠️ Developer-Friendly Tools
- **CMP Integration**: Works with Cookiebot. (More CMPS coming soon)
- **Debug Diagnostics**: Automated checks for common implementation issues.
- **Performance Monitoring**: Track consent mode impact on page performance.

---

## 🚀 Quick Start

### Installation
1. Install from the [Chrome Web Store](https://chrome.google.com/webstore) *(link pending)*.
2. Pin the extension to your toolbar for easy access.
3. Navigate to any website with GTM and Consent Mode.
4. Click the extension icon to start debugging.

### Basic Usage

The extension automatically detects:
- ✅ GTM containers (e.g., `GTM-XXXXXX`)
- ✅ Consent Mode implementation
- ✅ Active consent management platforms
- ✅ Current consent state

---

## 💼 Use Cases

### For Developers
- Validate GTM Consent Mode implementation during development.
- Debug tag firing issues related to consent settings.
- Test consent flows before production deployment.

### For Analysts
- Understand which tags are affected by consent choices.
- Analyze the impact of consent mode on data collection.
- Troubleshoot discrepancies in analytics data.

### For Compliance Teams
- Verify GDPR compliance of tracking implementations.
- Document consent flows for audits.
- Monitor consent behavior across different user scenarios.

### For QA Teams
- Test consent implementations across different browsers.
- Validate consent behavior in various geographic regions.
- Ensure consistent consent experience.

---

## 🔧 Technical Details

### Supported Platforms
- ✅ Google Tag Manager
- ✅ Google Analytics 4
- ✅ Google Ads
- ✅ Cookiebot

### Browser Compatibility
- Chrome 88+
- Edge 88+
- Brave (Chromium-based)

### Privacy & Security
- 🔒 **No Data Collection**: Operates locally — no data sent to external servers.
- 🛡️ **Secure by Design**: Implements Content Security Policy and input validation.
- 🔐 **Encrypted Storage**: Sensitive debugging data encrypted using AES-256-GCM.
- ⚡ **Rate Limited**: Protection against abuse and performance issues.

---

## 📋 Requirements
- Chrome browser version 88 or higher.
- Website with Google Tag Manager implementation.
- Valid Consent Mode setup (for full functionality).

---

## 🎯 Getting Started

### 1. Basic Inspection
- Open the extension on any website.
- Check the "Overview" tab for GTM detection status.
- View current consent state and container information.

### 2. Tag Analysis
- Switch to "Tags" tab.
- See which tags are allowed/blocked.
- Filter by tag type (analytics, advertising, functionality).

### 3. Consent Simulation
- Go to "Consent" tab.
- Enable "Simulation Mode".
- Test different consent scenarios.
- Observe impact on tag behavior.

### 4. Event Monitoring
- Open "Events" tab.
- Monitor real-time consent and tag events.
- Filter events by type and source.
- Export data for further analysis.

---

## 🔍 Advanced Features

### Simulation Mode
Test consent scenarios without affecting actual user experience:
- Analytics Storage: ✅ Granted / ❌ Denied
- Ad Storage: ✅ Granted / ❌ Denied
- Functionality Storage: ✅ Granted / ❌ Denied
- Personalization Storage: ✅ Granted / ❌ Denied



### Diagnostic Reports
Automated checks for common issues:
- ❌ GTM not detected
- ⚠️ Consent Mode not implemented
- ✅ Proper consent flow detected
- 🔧 Configuration recommendations

---

## 📚 Documentation
- Installation Guide
- User Manual
- Developer Documentation
- Troubleshooting
- FAQ

---

## 🤝 Contributing

We welcome contributions! Please see our **Contributing Guide** for details.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/consentflow-debugger.git

# Install dependencies
cd consentflow-debugger
npm install

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the project directory

