#!/usr/bin/env node

/**
 * Architecture validation script
 * This script would have caught the content script isolation issue
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating GTM Inspector Architecture...\n');

let hasErrors = false;

// Check content script isolation
function validateContentScriptIsolation() {
  console.log('📋 Checking content script isolation...');
  
  const contentScript = fs.readFileSync('content.js', 'utf8');
  
  // Check for direct access to page context
  const violations = [
    { pattern: 'window.ConsentInspector', description: 'Direct access to ConsentInspector' },
    { pattern: 'window.google_tag_manager', description: 'Direct access to google_tag_manager' },
    { pattern: 'window.dataLayer', description: 'Direct access to dataLayer' },
    { pattern: 'window.gtag', description: 'Direct access to gtag' }
  ].filter(({ pattern }) => contentScript.includes(pattern));
  
  if (violations.length > 0) {
    console.error('❌ Content script isolation violations detected:');
    violations.forEach(v => console.error(`   - ${v.description}`));
    hasErrors = true;
  } else {
    console.log('✅ Content script isolation validated');
  }
  
  // Check for proper message passing
  if (!contentScript.includes('postMessage')) {
    console.error('❌ Missing postMessage communication in content script');
    hasErrors = true;
  } else {
    console.log('✅ PostMessage communication detected');
  }
  
  // Check for message listener
  if (!contentScript.includes('addEventListener') || !contentScript.includes('message')) {
    console.error('❌ Missing message event listener in content script');
    hasErrors = true;
  } else {
    console.log('✅ Message event listener detected');
  }
}

// Check injected script message handling
function validateInjectedScript() {
  console.log('\n📋 Checking injected script message handling...');
  
  const injectedScript = fs.readFileSync('injected-script.js', 'utf8');
  
  // Check for message listener
  if (!injectedScript.includes('addEventListener') || !injectedScript.includes('message')) {
    console.error('❌ Missing message event listener in injected script');
    hasErrors = true;
  } else {
    console.log('✅ Message event listener detected');
  }
  
  // Check for proper message source filtering
  if (!injectedScript.includes('gtm-inspector-content')) {
    console.error('❌ Missing message source filtering in injected script');
    hasErrors = true;
  } else {
    console.log('✅ Message source filtering detected');
  }
  
  // Check for GTM ID filtering logic
  if (!injectedScript.includes('GTM-') || !injectedScript.includes('filter')) {
    console.error('❌ Missing GTM ID filtering logic');
    hasErrors = true;
  } else {
    console.log('✅ GTM ID filtering logic detected');
  }
}

// Check manifest.json
function validateManifest() {
  console.log('\n📋 Checking manifest.json...');
  
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  
  // Check content scripts
  if (!manifest.content_scripts || manifest.content_scripts.length === 0) {
    console.error('❌ No content scripts defined in manifest.json');
    hasErrors = true;
  } else {
    console.log('✅ Content scripts defined');
  }
  
  // Check web accessible resources
  if (!manifest.web_accessible_resources || manifest.web_accessible_resources.length === 0) {
    console.error('❌ No web accessible resources defined');
    hasErrors = true;
  } else {
    console.log('✅ Web accessible resources defined');
  }
  
  // Check permissions
  const requiredPermissions = ['activeTab', 'scripting'];
  const missingPermissions = requiredPermissions.filter(p => !manifest.permissions.includes(p));
  
  if (missingPermissions.length > 0) {
    console.error(`❌ Missing required permissions: ${missingPermissions.join(', ')}`);
    hasErrors = true;
  } else {
    console.log('✅ Required permissions present');
  }
}

// Check file structure
function validateFileStructure() {
  console.log('\n📋 Checking file structure...');
  
  const requiredFiles = [
    'manifest.json',
    'content.js',
    'injected-script.js',
    'background.js',
    'popup/popup.html'
  ];
  
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
  
  if (missingFiles.length > 0) {
    console.error(`❌ Missing required files: ${missingFiles.join(', ')}`);
    hasErrors = true;
  } else {
    console.log('✅ All required files present');
  }
}

// Run all validations
validateContentScriptIsolation();
validateInjectedScript();
validateManifest();
validateFileStructure();

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('❌ Architecture validation failed!');
  console.error('Please fix the issues above before proceeding.');
  process.exit(1);
} else {
  console.log('✅ Architecture validation passed!');
  console.log('The extension architecture is sound and ready for deployment.');
}

console.log('\n💡 Tips to prevent future issues:');
console.log('   - Always use postMessage for cross-context communication');
console.log('   - Test on real GTM-enabled sites, not just test pages');
console.log('   - Run integration tests before deploying');
console.log('   - Monitor console logs for "Receiving end does not exist" errors'); 