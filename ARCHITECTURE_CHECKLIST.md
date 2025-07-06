# Extension Architecture Validation Checklist

## Before Major Changes
- [ ] Document current communication flow
- [ ] Run integration tests
- [ ] Test on multiple GTM-enabled sites
- [ ] Verify content script isolation is respected

## After Major Changes
- [ ] Verify content script ↔ page context communication
- [ ] Test GTM detection accuracy
- [ ] Check for console errors
- [ ] Validate message passing reliability
- [ ] Test on sites with debug groups

## Critical Architecture Rules

### Content Script Isolation
- ❌ Never access `window.ConsentInspector` directly from content script
- ✅ Always use `postMessage` for page context communication
- ✅ Use unique message IDs for request/response matching
- ✅ Implement timeout handling for message responses

### GTM Detection
- ❌ Don't assume first key in `google_tag_manager` is the container ID
- ✅ Filter for actual GTM container IDs (`GTM-XXXXXXX` pattern)
- ✅ Prioritize script tag IDs over debug groups
- ✅ Mark debug groups clearly in results

### Error Handling
- ✅ Implement fallback detection methods
- ✅ Add comprehensive error logging
- ✅ Graceful degradation when features fail

## Testing Requirements

### Manual Testing
- [ ] Test on site with single GTM container
- [ ] Test on site with multiple GTM containers
- [ ] Test on site with debug groups enabled
- [ ] Test on site with no GTM
- [ ] Test on site with consent mode disabled

### Automated Testing
- [ ] Integration tests for communication flow
- [ ] Unit tests for GTM detection logic
- [ ] Error handling tests
- [ ] Performance impact tests

## Common Pitfalls to Avoid

1. **Content Script Isolation**: Always remember content scripts can't directly access page context
2. **GTM ID Detection**: Don't assume object key order - filter for actual container IDs
3. **Message Passing**: Always implement proper request/response matching with timeouts
4. **Error Recovery**: Don't let one failure break the entire extension
5. **Performance**: Monitor memory usage and cleanup resources properly 