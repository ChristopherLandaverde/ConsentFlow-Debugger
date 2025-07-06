// Jest setup file for GTM Inspector tests

// Mock Chrome extension APIs
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`)
  },
  tabs: {
    sendMessage: jest.fn(),
    query: jest.fn(),
    get: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  scripting: {
    executeScript: jest.fn()
  }
};

// Mock DOM APIs for Node.js environment
global.window = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  postMessage: jest.fn(),
  location: {
    href: 'https://example.com'
  },
  document: {
    createElement: jest.fn(),
    getElementById: jest.fn(),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn()
  }
};

global.document = global.window.document;

// Mock console for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock setTimeout and setInterval
global.setTimeout = jest.fn((callback, delay) => {
  return setTimeout(callback, delay);
});

global.setInterval = jest.fn((callback, delay) => {
  return setInterval(callback, delay);
});

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn()
};

// Mock localStorage
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

// Mock sessionStorage
global.sessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

// Mock GTM globals
global.dataLayer = [];
global.gtag = jest.fn();
global.google_tag_manager = {
  'GTM-TEST': {
    dataLayer: global.dataLayer
  }
};

// Mock consent mode
global.gtag = jest.fn();
global.gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted'
});

// Test utilities
global.testUtils = {
  createMockGTM: (containerId = 'GTM-TEST') => {
    global.google_tag_manager[containerId] = {
      dataLayer: []
    };
    return global.google_tag_manager[containerId];
  },
  
  createMockConsent: (consent = {}) => {
    return {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
      ...consent
    };
  },
  
  resetMocks: () => {
    global.dataLayer = [];
    global.chrome.runtime.sendMessage.mockClear();
    global.chrome.tabs.sendMessage.mockClear();
    global.window.postMessage.mockClear();
    global.console.log.mockClear();
    global.console.error.mockClear();
  }
};

// Clean up after each test
afterEach(() => {
  testUtils.resetMocks();
}); 