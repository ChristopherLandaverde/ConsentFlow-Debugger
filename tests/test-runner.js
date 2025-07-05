// test-runner.js - Comprehensive test suite for GTM Consent Mode Inspector
class GTMInspectorTestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
    this.currentTest = null;
  }

  // Test registration
  describe(name, testFunction) {
    console.log(`\n🧪 Test Suite: ${name}`);
    this.currentTest = { name, tests: [] };
    testFunction.call(this); // Bind the context
    this.tests.push(this.currentTest);
  }

  it(description, testFunction) {
    if (!this.currentTest) {
      throw new Error('it() must be called within describe()');
    }
    this.currentTest.tests.push({ description, testFunction });
  }

  // Assertions
  expect(actual) {
    return {
      toBe: (expected) => {
        if (actual === expected) {
          return { pass: true };
        }
        return { 
          pass: false, 
          message: `Expected ${actual} to be ${expected}` 
        };
      },
      toEqual: (expected) => {
        if (JSON.stringify(actual) === JSON.stringify(expected)) {
          return { pass: true };
        }
        return { 
          pass: false, 
          message: `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}` 
        };
      },
      toContain: (expected) => {
        if (Array.isArray(actual) && actual.includes(expected)) {
          return { pass: true };
        }
        if (typeof actual === 'string' && actual.includes(expected)) {
          return { pass: true };
        }
        return { 
          pass: false, 
          message: `Expected ${actual} to contain ${expected}` 
        };
      },
      toBeDefined: () => {
        if (actual !== undefined) {
          return { pass: true };
        }
        return { 
          pass: false, 
          message: `Expected ${actual} to be defined` 
        };
      },
      toBeTruthy: () => {
        if (actual) {
          return { pass: true };
        }
        return { 
          pass: false, 
          message: `Expected ${actual} to be truthy` 
        };
      },
      toBeGreaterThanOrEqual: (expected) => {
        if (actual >= expected) {
          return { pass: true };
        }
        return { 
          pass: false, 
          message: `Expected ${actual} to be greater than or equal to ${expected}` 
        };
      },
      toBeGreaterThan: (expected) => {
        if (actual > expected) {
          return { pass: true };
        }
        return { 
          pass: false, 
          message: `Expected ${actual} to be greater than ${expected}` 
        };
      }
    };
  }

  // Test execution
  async runTests() {
    console.log('🚀 Starting GTM Inspector Test Suite...\n');
    
    for (const suite of this.tests) {
      console.log(`📋 Running: ${suite.name}`);
      
      for (const test of suite.tests) {
        try {
          const result = await test.testFunction();
          this.results.total++;
          
          if (result && result.pass) {
            console.log(`  ✅ ${test.description}`);
            this.results.passed++;
            this.results.details.push({
              suite: suite.name,
              test: test.description,
              status: 'PASS'
            });
          } else {
            console.log(`  ❌ ${test.description}`);
            if (result && result.message) {
              console.log(`     Error: ${result.message}`);
            }
            this.results.failed++;
            this.results.details.push({
              suite: suite.name,
              test: test.description,
              status: 'FAIL',
              error: result ? result.message : 'Unknown error'
            });
          }
        } catch (error) {
          console.log(`  ❌ ${test.description}`);
          console.log(`     Error: ${error.message}`);
          this.results.total++;
          this.results.failed++;
          this.results.details.push({
            suite: suite.name,
            test: test.description,
            status: 'FAIL',
            error: error.message
          });
        }
      }
    }
    
    this.printSummary();
    return this.results;
  }

  printSummary() {
    console.log('\n📊 Test Results Summary:');
    console.log(`Total Tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed} ✅`);
    console.log(`Failed: ${this.results.failed} ❌`);
    console.log(`Success Rate: ${this.results.total > 0 ? Math.round((this.results.passed / this.results.total) * 100) : 0}%`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.details
        .filter(detail => detail.status === 'FAIL')
        .forEach(detail => {
          console.log(`  - ${detail.suite}: ${detail.test}`);
          if (detail.error) {
            console.log(`    Error: ${detail.error}`);
          }
        });
    }
  }

  // Helper methods for testing
  async waitForElement(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Element ${selector} not found within ${timeout}ms`);
  }

  async waitForCondition(condition, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  // Mock GTM environment
  setupMockGTM() {
    // Clear existing GTM
    delete window.google_tag_manager;
    delete window.gtag;
    delete window.dataLayer;
    
    // Setup mock GTM
    window.dataLayer = [];
    window.google_tag_manager = {
      'GTM-TEST1': {
        dataLayer: window.dataLayer
      }
    };
    
    // Mock gtag function
    window.gtag = function() {
      window.dataLayer.push(Array.from(arguments));
    };
  }

  // Mock Chrome extension APIs
  setupMockChrome() {
    if (!window.chrome) {
      window.chrome = {};
    }
    
    if (!window.chrome.runtime) {
      window.chrome.runtime = {};
    }
    
    // Mock getURL function
    window.chrome.runtime.getURL = function(path) {
      // Return a mock URL for testing
      return `chrome-extension://abcdefghijklmnop/${path}`;
    };
    
    // Mock tabs API
    if (!window.chrome.tabs) {
      window.chrome.tabs = {
        query: function(options, callback) {
          // Mock active tab
          callback([{ id: 1, url: 'https://example.com' }]);
        },
        sendMessage: function(tabId, message, callback) {
          // Mock message response
          if (callback) {
            callback({ success: true });
          }
        }
      };
    }
  }

  // Clean up after tests
  cleanup() {
    delete window.google_tag_manager;
    delete window.gtag;
    delete window.dataLayer;
    delete window.ConsentInspector;
    // Don't delete window.chrome as it's a built-in browser object
  }
}

// Export for use in other test files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GTMInspectorTestRunner;
} else {
  window.GTMInspectorTestRunner = GTMInspectorTestRunner;
} 