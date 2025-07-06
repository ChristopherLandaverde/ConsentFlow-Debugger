module.exports = {
  env: {
    browser: true,
    es2021: true,
    webextensions: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  globals: {
    chrome: 'readonly',
    dataLayer: 'readonly',
    gtag: 'readonly',
    google_tag_manager: 'readonly'
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off', // Allow console for debugging
    'no-undef': 'error',
    'prefer-const': 'warn',
    'no-var': 'error'
  },
  ignorePatterns: [
    'node_modules/',
    'tests/',
    '*.test.js'
  ]
}; 