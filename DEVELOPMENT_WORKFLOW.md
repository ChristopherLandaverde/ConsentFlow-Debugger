# Development Workflow Guide

## Pre-Development Checklist
1. **Understand the Architecture**: Review content script isolation and message passing
2. **Run Tests**: Ensure all existing tests pass before making changes
3. **Document Current State**: Note what's working before making changes

## During Development
1. **Test Incrementally**: Test each change immediately, don't batch large changes
2. **Use Console Logging**: Add temporary logs to verify communication flow
3. **Test on Real Sites**: Don't rely only on test pages - test on actual GTM sites
4. **Check Console Errors**: Monitor for "Receiving end does not exist" or similar errors

## Post-Development Validation
1. **Run Integration Tests**: Verify the complete communication chain works
2. **Test on Multiple Sites**: Test on sites with different GTM configurations
3. **Check Performance**: Monitor for memory leaks or performance regressions
4. **Validate UI**: Ensure the popup shows correct information

## Debugging Checklist
When something breaks:

1. **Check Console Logs**: Look for content script and injected script logs
2. **Verify Script Injection**: Ensure `injected-script.js` is loading
3. **Test Message Passing**: Verify postMessage communication works
4. **Check GTM Detection**: Ensure actual container IDs are being detected
5. **Validate Manifest**: Check content script registration and permissions

## Common Debugging Commands
```bash
# Check if content script is loaded
# Look for: "🟢 GTM Inspector Content Script Loading..."

# Check if injected script is loaded  
# Look for: "🔵 GTM Inspector: External injected script loading..."

# Check for ConsentInspector creation
# Look for: "🔵 ConsentInspector created successfully"

# Check for message passing
# Look for: "🔵 Received message from content script:"
```

## Emergency Rollback
If a change breaks the extension:
1. **Revert to Last Working Commit**: `git reset --hard HEAD~1`
2. **Test Immediately**: Verify the rollback fixed the issue
3. **Document the Problem**: Note what caused the issue for future reference
4. **Make Smaller Changes**: Break down the problematic change into smaller pieces 