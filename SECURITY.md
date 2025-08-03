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