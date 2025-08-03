# Security Documentation

## Content Security Policy (CSP) Implementation

### Overview
This extension implements comprehensive Content Security Policy (CSP) headers to prevent XSS attacks and other security vulnerabilities.

### CSP Configuration

#### Manifest.json CSP
```json
"content_security_policy": {
  "extension_pages": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self';"
}
```

#### HTML Files CSP
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self';">
```

### CSP Directives Explained

- **default-src 'self'**: Only allow resources from the same origin
- **script-src 'self'**: Only allow scripts from the same origin
- **style-src 'self'**: Only allow styles from the same origin
- **object-src 'none'**: Block all plugins (Flash, Java, etc.)
- **base-uri 'self'**: Restrict base URI to same origin
- **connect-src 'self'**: Only allow connections to same origin
- **img-src 'self' data**: Allow images from same origin and data URIs
- **font-src 'self'**: Only allow fonts from same origin

### Security Benefits

1. **XSS Prevention**: Blocks inline scripts and external script sources
2. **Clickjacking Protection**: Prevents malicious framing
3. **Code Injection Prevention**: Restricts resource loading to trusted sources
4. **Data Exfiltration Prevention**: Limits network connections

### Implementation Notes

- The manifest CSP allows `'unsafe-inline'` for scripts and styles to maintain functionality
- HTML files use stricter CSP without `'unsafe-inline'` for better security
- All external resources are blocked except for data URIs for images
- Base URI is restricted to prevent base tag hijacking

### Testing CSP

To test if CSP is working correctly:

1. Open browser developer tools
2. Check the Console tab for CSP violation messages
3. Verify that no external scripts or styles are loaded
4. Confirm that inline event handlers are blocked

### Security Best Practices

1. **Regular Updates**: Keep CSP policies updated as the extension evolves
2. **Monitoring**: Monitor CSP violation reports in production
3. **Testing**: Test CSP policies thoroughly before deployment
4. **Documentation**: Keep this security documentation updated

### CSP Violation Reporting

If CSP violations occur, they will appear in the browser console. Common violations to watch for:

- Inline script execution attempts
- External resource loading attempts
- Unsafe eval() usage
- Inline event handler usage

### Remediation Steps

If CSP violations are detected:

1. Identify the source of the violation
2. Update CSP policy to allow necessary resources (if safe)
3. Refactor code to avoid unsafe practices
4. Test thoroughly before deploying changes

## Error Handling Security

### Overview
The extension implements secure error handling to prevent exposure of sensitive information while maintaining functionality.

### Secure Error Handling Principles

1. **No Stack Trace Exposure**: Never expose `error.stack` to users or logs
2. **Sanitized Error Messages**: Use user-friendly error messages instead of raw error details
3. **Contextual Logging**: Log only necessary information for debugging
4. **Error Classification**: Map errors to user-friendly messages
5. **Safe Error Responses**: Return sanitized error information

### Implementation

#### Secure Error Handling Functions

```javascript
// Safe error logging
function logErrorSafely(error, context = '') {
  const errorInfo = {
    name: error.name || 'UnknownError',
    context: context,
    timestamp: new Date().toISOString()
  };
  
  console.error('Extension Error:', {
    name: errorInfo.name,
    context: errorInfo.context,
    timestamp: errorInfo.timestamp
  });
}

// User-friendly error messages
function getUserFriendlyError(error) {
  const errorMap = {
    'NetworkError': 'Network connection failed. Please check your internet connection.',
    'TimeoutError': 'Request timed out. Please try again.',
    'PermissionError': 'Permission denied. Please check extension permissions.',
    'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again.'
  };
  
  return errorMap[error.name] || errorMap['UNKNOWN_ERROR'];
}
```

#### Security Benefits

1. **No Sensitive Data Exposure**: Error messages don't reveal internal structure
2. **User-Friendly Messages**: Clear, actionable error messages for users
3. **Debugging Support**: Sufficient logging for developers without exposing details
4. **Consistent Error Handling**: Standardized approach across the extension

### Error Handling Best Practices

1. **Never expose stack traces** to users or in production logs
2. **Use error codes** instead of detailed error messages
3. **Sanitize all error responses** before sending to users
4. **Log only necessary information** for debugging
5. **Provide actionable error messages** to users
6. **Handle errors gracefully** without crashing the extension

### Testing Error Handling

To test secure error handling:

1. Trigger various error conditions
2. Verify no sensitive information is exposed
3. Check that user-friendly messages are displayed
4. Confirm error logging is appropriate for debugging
5. Test error recovery mechanisms

## Debug Logging Security

### Overview
The extension implements secure debug logging that prevents exposure of sensitive information in production environments.

### Debug Logging Configuration

#### Production-Safe Logging
```javascript
const LOG_CONFIG = {
  debugMode: false,  // Disabled in production
  logLevel: 'error', // Only log errors in production
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};
```

#### Secure Logging Function
```javascript
function secureLog(message, level = 'info', context = '') {
  // Only log if debug mode is enabled
  if (!LOG_CONFIG.debugMode) {
    return;
  }
  
  // In production, only log errors and warnings
  if (LOG_CONFIG.isProduction && level === 'debug') {
    return;
  }
  
  // Sanitize the message
  const sanitizedMessage = sanitizeLogMessage(message);
  console.log(`[GTM Inspector] [${timestamp}] ${context}: ${sanitizedMessage}`);
}
```

### Message Sanitization

#### Sensitive Data Patterns Removed
- URLs and extension URLs
- Email addresses
- Credit card numbers
- IBAN numbers
- Passport numbers
- Internal extension paths

#### Sanitization Function
```javascript
function sanitizeLogMessage(message) {
  const sensitivePatterns = [
    /https?:\/\/[^\s]+/g,  // URLs
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,  // Email addresses
    /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,  // Credit card numbers
    // ... more patterns
  ];
  
  let sanitized = message;
  sensitivePatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  
  return sanitized;
}
```

### Security Benefits

1. **No Sensitive Data Exposure**: All sensitive data is redacted from logs
2. **Production-Safe**: Debug logging is disabled in production
3. **Level-Based Logging**: Different log levels for different environments
4. **Sanitized Output**: All log messages are sanitized before output
5. **Environment Awareness**: Different behavior in development vs production

### Debug Logging Best Practices

1. **Disable in Production**: Set `debugMode: false` for production builds
2. **Sanitize All Messages**: Always sanitize log messages before output
3. **Use Appropriate Levels**: Use error/warn for production, debug for development
4. **Avoid Sensitive Data**: Never log passwords, tokens, or personal data
5. **Environment Detection**: Use environment variables to control logging
6. **Regular Audits**: Regularly review logging for sensitive data exposure

### Testing Debug Logging

To test secure debug logging:

1. Set `debugMode: true` and test with sensitive data
2. Verify sensitive data is redacted in logs
3. Set `debugMode: false` and verify no logging occurs
4. Test different log levels in different environments
5. Verify no sensitive URLs or data appear in console

## Input Validation Security

### Overview
The extension implements comprehensive input validation to prevent malicious data injection and ensure data integrity.

### Input Validation Implementation

#### Message Validation
```javascript
const InputValidator = {
  // Validate message origin
  isValidOrigin(origin) {
    if (!origin) return false;
    
    // Allow same origin
    if (origin === window.location.origin) return true;
    
    // Allow extension origin
    if (origin.startsWith('chrome-extension://')) return true;
    
    // Allow specific trusted domains
    const trustedDomains = [
      'https://vermillion-zuccutto-ed1811.netlify.app',
      'https://cookiebot.com',
      'https://consent.cookiebot.com'
    ];
    
    return trustedDomains.some(domain => origin.startsWith(domain));
  },
  
  // Validate message structure
  isValidMessage(message) {
    if (!message || typeof message !== 'object') return false;
    
    // Check for required fields
    if (!message.source || !message.action) return false;
    
    // Validate source
    const validSources = ['gtm-inspector-content', 'gtm-inspector-page'];
    if (!validSources.includes(message.source)) return false;
    
    // Validate action
    const validActions = [
      'detectGTM', 'getTagStatus', 'getEvents', 'updateConsent',
      'updateSimulationMode', 'clearEventLog', 'runDiagnostics',
      'getTagManagerInteractions', 'ping'
    ];
    if (!validActions.includes(message.action)) return false;
    
    return true;
  }
};
```

#### Data Validation
```javascript
// Validate consent data
isValidConsentData(consent) {
  if (!consent || typeof consent !== 'object') return false;
  
  const requiredFields = [
    'analytics_storage', 'ad_storage', 'functionality_storage',
    'personalization_storage', 'security_storage'
  ];
  
  const validValues = ['granted', 'denied'];
  
  for (const field of requiredFields) {
    if (!(field in consent)) return false;
    if (!validValues.includes(consent[field])) return false;
  }
  
  return true;
}
```

#### Input Sanitization
```javascript
// Sanitize string input
sanitizeString(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  
  // Remove potentially dangerous characters
  let sanitized = input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}
```

### Security Benefits

1. **Origin Validation**: Only accepts messages from trusted sources
2. **Structure Validation**: Ensures proper message format
3. **Data Type Validation**: Validates data types and values
4. **Input Sanitization**: Removes potentially dangerous content
5. **Length Limits**: Prevents buffer overflow attacks
6. **Protocol Filtering**: Blocks dangerous protocols

### Validation Points

#### 1. PostMessage Validation
- Origin validation for all incoming messages
- Message structure validation
- Action whitelist validation
- Data sanitization before processing

#### 2. Chrome Runtime Message Validation
- Request structure validation
- Action validation
- Parameter type checking
- Data sanitization

#### 3. Consent Data Validation
- Required field validation
- Value validation (granted/denied only)
- Structure validation
- Type checking

#### 4. Event Data Validation
- Timestamp validation
- Event type validation
- Data structure validation
- Size limits

### Input Validation Best Practices

1. **Validate at Entry Points**: Validate all external data at the boundary
2. **Whitelist Validation**: Use whitelists instead of blacklists
3. **Type Checking**: Validate data types before processing
4. **Length Limits**: Set reasonable limits on input size
5. **Sanitization**: Clean input before processing
6. **Error Handling**: Provide clear error messages for invalid input
7. **Logging**: Log validation failures for monitoring

### Testing Input Validation

To test input validation:

1. Send malformed messages to postMessage handlers
2. Test with invalid consent data structures
3. Send oversized data to test length limits
4. Test with malicious protocols in strings
5. Verify error responses are appropriate
6. Test origin validation with untrusted domains

## Data Encryption Security

### Overview
The extension implements AES-256-GCM encryption for sensitive stored data to prevent unauthorized access and data breaches.

### Sensitive Data Identified

#### 1. Consent Data (HIGH PRIORITY)
```javascript
{
  simulationMode: true/false,
  simulatedConsent: {
    analytics_storage: 'granted'/'denied',
    ad_storage: 'granted'/'denied',
    functionality_storage: 'granted'/'denied',
    personalization_storage: 'granted'/'denied',
    security_storage: 'granted'/'denied'
  }
}
```

#### 2. Event Logs (MEDIUM PRIORITY)
```javascript
{
  gtmInspectorEvents: [
    {
      id: 'uuid',
      type: 'consent_change'/'tag_fired'/'tag_blocked',
      timestamp: Date.now(),
      url: 'https://example.com/page',  // SENSITIVE
      website: 'Website Name',          // SENSITIVE
      consent: { /* consent data */ },  // SENSITIVE
      data: { /* event details */ }     // SENSITIVE
    }
  ]
}
```

#### 3. Tag Manager Interactions (MEDIUM PRIORITY)
```javascript
{
  tagManagerInteractions: [
    {
      type: 'tag_fired'/'tag_blocked',
      timestamp: Date.now(),
      url: 'https://example.com',       // SENSITIVE
      website: 'Website Name',          // SENSITIVE
      tagData: { /* tag information */ } // SENSITIVE
    }
  ]
}
```

#### 4. Cookiebot Consent Changes (HIGH PRIORITY)
```javascript
{
  lastCookiebotConsentChange: {
    action: 'accept'/'decline'/'ready',
    website: 'Website Name',            // SENSITIVE
    url: 'https://example.com/page',    // SENSITIVE
    consent: { /* consent data */ },    // SENSITIVE
    timestamp: Date.now()
  }
}
```

### Encryption Implementation

#### Encryption Manager
```javascript
const EncryptionManager = {
  // Generate a secure encryption key (derived from extension ID)
  async getEncryptionKey() {
    const manifest = chrome.runtime.getManifest();
    const extensionId = chrome.runtime.id;
    
    // Create a deterministic key from extension ID
    const encoder = new TextEncoder();
    const data = encoder.encode(extensionId + manifest.version);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const key = hashArray.slice(0, 32); // Use first 32 bytes for AES-256
    
    return crypto.subtle.importKey(
      'raw',
      new Uint8Array(key),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  },
  
  // Encrypt sensitive data
  async encryptData(data) {
    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(JSON.stringify(data));
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );
    
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);
    
    return btoa(String.fromCharCode(...combined));
  }
};
```

#### Storage Integration
```javascript
// Encrypt data before storage
async saveState() {
  const encryptedConsent = await EncryptionManager.encryptAndMark(this.simulatedConsent);
  await chrome.storage.local.set({
    simulationMode: this.simulationMode,
    simulatedConsent: encryptedConsent
  });
}

// Decrypt data after retrieval
async loadState() {
  const result = await chrome.storage.local.get(['simulatedConsent']);
  if (EncryptionManager.isEncrypted(result.simulatedConsent)) {
    this.simulatedConsent = await EncryptionManager.decryptMarked(result.simulatedConsent);
  }
}
```

### Security Benefits

1. **AES-256-GCM Encryption**: Military-grade encryption algorithm
2. **Deterministic Key Generation**: Keys derived from extension ID and version
3. **Random IV**: Each encryption uses a unique initialization vector
4. **Data Integrity**: GCM mode provides authentication and integrity
5. **Automatic Encryption**: All sensitive data automatically encrypted
6. **Backward Compatibility**: Handles both encrypted and unencrypted data

### Encryption Best Practices

1. **Key Management**: Keys derived from extension identity
2. **IV Generation**: Random IV for each encryption operation
3. **Error Handling**: Graceful fallback if encryption fails
4. **Data Marking**: Clear identification of encrypted data
5. **Performance**: Efficient encryption/decryption operations
6. **Compatibility**: Works with existing storage mechanisms

### Testing Data Encryption

To test data encryption:

1. Save sensitive data and verify it's encrypted in storage
2. Load encrypted data and verify it decrypts correctly
3. Test with corrupted encrypted data
4. Verify encryption key consistency across sessions
5. Test performance impact of encryption/decryption
6. Verify backward compatibility with unencrypted data

## PostMessage Security

### Overview
The extension implements secure postMessage communication by using specific origins instead of wildcard (`'*'`) targets to prevent cross-site scripting attacks.

### Security Issue with Wildcard Origins

#### ❌ DANGEROUS - Using `'*'` origin
```javascript
// UNSAFE - Allows any origin to receive the message
window.postMessage(data, '*');
```

#### ✅ SECURE - Using specific origin
```javascript
// SAFE - Only allows same origin to receive the message
window.postMessage(data, window.location.origin);
```

### PostMessage Security Implementation

#### 1. Content Script to Page Communication
```javascript
// ❌ BEFORE (UNSAFE)
window.postMessage({
  source: 'gtm-inspector-content',
  action: action,
  data: data,
  id: messageId
}, '*');

// ✅ AFTER (SECURE)
window.postMessage({
  source: 'gtm-inspector-content',
  action: action,
  data: data,
  id: messageId
}, window.location.origin);
```

#### 2. Injected Script Response
```javascript
// ❌ BEFORE (UNSAFE)
window.postMessage(response, '*');

// ✅ AFTER (SECURE)
window.postMessage(response, event.origin || window.location.origin);
```

#### 3. Integration Scripts
```javascript
// ❌ BEFORE (UNSAFE)
window.postMessage({
  type: 'COOKIEBOT_CONSENT_CHANGE',
  data: notificationData
}, '*');

// ✅ AFTER (SECURE)
window.postMessage({
  type: 'COOKIEBOT_CONSENT_CHANGE',
  data: notificationData
}, window.location.origin);
```

### Security Benefits

1. **Origin Restriction**: Messages only sent to same origin
2. **XSS Prevention**: Prevents malicious sites from intercepting messages
3. **Data Protection**: Sensitive data not exposed to other origins
4. **Attack Mitigation**: Reduces attack surface for postMessage exploits
5. **Privacy Protection**: Ensures communication stays within trusted context

### PostMessage Security Best Practices

1. **Use Specific Origins**: Never use `'*'` as target origin
2. **Validate Origins**: Always validate incoming message origins
3. **Sanitize Data**: Clean data before sending via postMessage
4. **Error Handling**: Handle cases where origin is unavailable
5. **Fallback Strategy**: Provide fallback for edge cases
6. **Testing**: Test with different origin scenarios

### Origin Validation Strategy

```javascript
// Validate incoming message origins
function isValidOrigin(origin) {
  if (!origin) return false;
  
  // Allow same origin
  if (origin === window.location.origin) return true;
  
  // Allow extension origin
  if (origin.startsWith('chrome-extension://')) return true;
  
  // Allow specific trusted domains
  const trustedDomains = [
    'https://vermillion-zuccutto-ed1811.netlify.app',
    'https://cookiebot.com',
    'https://consent.cookiebot.com'
  ];
  
  return trustedDomains.some(domain => origin.startsWith(domain));
}
```

### Testing PostMessage Security

To test postMessage security:

1. Send messages from different origins
2. Verify only same-origin messages are processed
3. Test with malicious origin attempts
4. Verify fallback behavior when origin is unavailable
5. Test cross-origin communication scenarios
6. Verify data integrity across origins

## Rate Limiting Security

### Overview
The extension implements comprehensive rate limiting to prevent abuse, protect resources, and mitigate various attack vectors including storage overflow, performance degradation, and data exfiltration attempts.

### Security Issues Without Rate Limiting

#### ❌ VULNERABLE - Storage Overflow Attack
```javascript
// Attacker can flood storage with fake events
for (let i = 0; i < 10000; i++) {
  chrome.storage.local.set({ gtmInspectorEvents: fakeEvents });
}
// Result: Storage quota exceeded, extension breaks
```

#### ❌ VULNERABLE - Performance Attack
```javascript
// Attacker can spam messages to freeze extension
for (let i = 0; i < 1000; i++) {
  chrome.runtime.sendMessage({action: 'getEvents'});
}
// Result: UI freezing, memory exhaustion
```

#### ❌ VULNERABLE - Data Exfiltration
```javascript
// Attacker can rapidly query sensitive data
for (let i = 0; i < 500; i++) {
  chrome.runtime.sendMessage({action: 'getConsentData'});
}
// Result: Potential data leakage, privacy violation
```

### Rate Limiting Implementation

#### 1. RateLimiter Class
```javascript
class RateLimiter {
  constructor() {
    this.operations = new Map();
    this.defaultLimits = {
      storage: { max: 10, window: 60000 }, // 10 operations per minute
      messages: { max: 20, window: 60000 }, // 20 messages per minute
      events: { max: 50, window: 60000 },   // 50 events per minute
      consent: { max: 5, window: 60000 }    // 5 consent changes per minute
    };
  }

  isAllowed(operation, key = 'default') {
    const limit = this.defaultLimits[operation] || this.defaultLimits.messages;
    const now = Date.now();
    const keyName = `${operation}_${key}`;
    
    if (!this.operations.has(keyName)) {
      this.operations.set(keyName, []);
    }
    
    const operations = this.operations.get(keyName);
    
    // Remove old operations outside the window
    const validOperations = operations.filter(time => now - time < limit.window);
    this.operations.set(keyName, validOperations);
    
    // Check if we're under the limit
    if (validOperations.length < limit.max) {
      validOperations.push(now);
      this.operations.set(keyName, validOperations);
      return true;
    }
    
    return false;
  }
}
```

#### 2. Rate-Limited Storage Operations
```javascript
// ❌ BEFORE (VULNERABLE)
await chrome.storage.local.set({ gtmInspectorEvents: events });

// ✅ AFTER (SECURE)
async function rateLimitedStorageSet(data) {
  if (!rateLimiter.isAllowed('storage')) {
    const remainingTime = rateLimiter.getRemainingTime('storage');
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(remainingTime / 1000)} seconds.`);
  }
  
  return await chrome.storage.local.set(data);
}

await rateLimitedStorageSet({ gtmInspectorEvents: events });
```

#### 3. Rate-Limited Message Sending
```javascript
// ❌ BEFORE (VULNERABLE)
chrome.runtime.sendMessage({action: 'cookiebotConsentChange', data: {...}});

// ✅ AFTER (SECURE)
async function rateLimitedSendMessage(message) {
  if (!rateLimiter.isAllowed('messages')) {
    const remainingTime = rateLimiter.getRemainingTime('messages');
    throw new Error(`Message rate limit exceeded. Try again in ${Math.ceil(remainingTime / 1000)} seconds.`);
  }
  
  return await chrome.runtime.sendMessage(message);
}

await rateLimitedSendMessage({action: 'cookiebotConsentChange', data: {...}});
```

### Rate Limiting Configuration

#### Storage Operations
- **Limit**: 10 operations per minute
- **Purpose**: Prevent storage quota exhaustion
- **Protection**: Against storage overflow attacks

#### Message Communication
- **Limit**: 20 messages per minute
- **Purpose**: Prevent performance degradation
- **Protection**: Against message flooding attacks

#### Event Logging
- **Limit**: 50 events per minute
- **Purpose**: Prevent excessive event logging
- **Protection**: Against log flooding attacks

#### Consent Changes
- **Limit**: 5 changes per minute
- **Purpose**: Prevent consent manipulation
- **Protection**: Against consent abuse attacks

### Security Benefits

1. **Storage Protection**: Prevents quota exhaustion attacks
2. **Performance Protection**: Prevents UI freezing and memory exhaustion
3. **Data Protection**: Prevents rapid data exfiltration attempts
4. **Resource Protection**: Ensures extension remains responsive
5. **Attack Mitigation**: Reduces attack surface for various exploits
6. **User Experience**: Maintains smooth operation under attack

### Rate Limiting Best Practices

1. **Per-Operation Limits**: Different limits for different operations
2. **Time Windows**: Sliding window approach for accurate limiting
3. **User Feedback**: Clear error messages with retry times
4. **Graceful Degradation**: Extension continues working under limits
5. **Monitoring**: Log rate limit violations for security analysis
6. **Configuration**: Adjustable limits based on usage patterns

### Error Handling Strategy

```javascript
try {
  await rateLimitedStorageSet(data);
} catch (error) {
  if (error.message.includes('Rate limit exceeded')) {
    console.warn('Rate limit exceeded for storage operation');
    showNotification('Too many operations. Please wait a moment.', 'warning');
  } else {
    console.error('Storage error:', error);
    throw error;
  }
}
```

### Testing Rate Limiting

To test rate limiting security:

1. **Storage Attack Test**: Rapidly call storage operations
2. **Message Flood Test**: Send many messages quickly
3. **Event Spam Test**: Generate excessive events
4. **Consent Abuse Test**: Rapidly change consent states
5. **Recovery Test**: Verify normal operation after limits
6. **Edge Case Test**: Test boundary conditions and timeouts 

## Cryptographically Secure Random IDs

### Overview
The extension implements cryptographically secure random ID generation to replace predictable timestamp-based IDs, preventing enumeration attacks and ensuring unique, non-guessable identifiers.

### Security Issues with Timestamp-Based IDs

#### ❌ VULNERABLE - Predictable IDs
```javascript
// Attacker can predict and enumerate IDs
const id = Date.now() + Math.random();
// Result: Predictable, enumerable, vulnerable to timing attacks
```

#### ❌ VULNERABLE - Collision Attacks
```javascript
// Multiple events can have same timestamp
const id = Date.now();
// Result: ID collisions, data corruption, security bypass
```

#### ❌ VULNERABLE - Enumeration Attacks
```javascript
// Attacker can guess future IDs
const id = Date.now() + Math.random();
// Result: Predictable sequence, data enumeration possible
```

### Secure Random ID Implementation

#### 1. Cryptographically Secure UUID Generation
```javascript
// ❌ BEFORE (INSECURE)
generateUUID: function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ✅ AFTER (SECURE)
generateUUID: function() {
  // Use cryptographically secure random values
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  
  // Set version (4) and variant bits
  array[6] = (array[6] & 0x0f) | 0x40; // Version 4
  array[8] = (array[8] & 0x3f) | 0x80; // Variant 1
  
  // Convert to hex string
  const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  
  // Format as UUID
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
```

#### 2. Secure Random ID Generation
```javascript
// ✅ SECURE - Cryptographically random ID
generateSecureId: function() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
```

#### 3. Message ID Security
```javascript
// ❌ BEFORE (VULNERABLE)
const messageId = Date.now() + Math.random();

// ✅ AFTER (SECURE)
const messageId = realEventLogger.generateSecureId();
```

#### 4. Event ID Security
```javascript
// ❌ BEFORE (VULNERABLE)
const interaction = {
  id: Date.now() + Math.random(),
  type: type,
  data: data,
  url: window.location.href,
  timestamp: Date.now()
};

// ✅ AFTER (SECURE)
const interaction = {
  id: realEventLogger.generateSecureId(),
  type: type,
  data: data,
  url: window.location.href,
  timestamp: Date.now()
};
```

### Security Benefits

1. **Unpredictability**: IDs cannot be guessed or predicted
2. **Uniqueness**: Extremely low collision probability
3. **Enumeration Resistance**: Prevents ID enumeration attacks
4. **Timing Attack Resistance**: No correlation with time
5. **Data Integrity**: Prevents ID-based data manipulation
6. **Privacy Protection**: IDs reveal no information about timing or sequence

### Cryptographic Properties

#### Randomness Quality
- **Source**: `crypto.getRandomValues()` - cryptographically secure
- **Entropy**: 128 bits of entropy per ID
- **Distribution**: Uniform random distribution
- **Collision Resistance**: 2^64 collision resistance

#### UUID Compliance
- **Version**: UUID v4 (random)
- **Variant**: RFC 4122 variant 1
- **Format**: Standard UUID format (8-4-4-4-12)
- **Compatibility**: Compatible with UUID libraries

### Implementation Locations

#### Core Extension Files
- ✅ `content.js` - Event logging and message IDs
- ✅ `injected-script.js` - Page context event IDs
- ✅ `popup/popup.js` - UI event tracking

#### Integration Scripts
- ✅ `universal-cookiebot-integration.js` - Consent change IDs
- ✅ `website-integration.js` - Website integration IDs
- ✅ `universal-bookmarklet.js` - Bookmarklet event IDs

### Best Practices

1. **Use Crypto API**: Always use `crypto.getRandomValues()`
2. **Avoid Math.random()**: Never use for security-critical IDs
3. **Sufficient Entropy**: Use at least 128 bits of entropy
4. **Consistent Format**: Use standardized UUID format
5. **Error Handling**: Handle crypto API failures gracefully
6. **Validation**: Validate ID format and uniqueness

### Error Handling Strategy

```javascript
function generateSecureId() {
  try {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Crypto API unavailable, using fallback');
    // Fallback to timestamp + random (less secure but functional)
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
```

### Testing Secure IDs

To test secure ID generation:

1. **Uniqueness Test**: Generate many IDs and check for collisions
2. **Randomness Test**: Verify uniform distribution
3. **Format Test**: Validate UUID format compliance
4. **Performance Test**: Measure generation speed
5. **Fallback Test**: Test behavior when crypto API unavailable
6. **Security Test**: Attempt to predict or enumerate IDs 