// src/content/qa-tester.js
// Module for running QA tests on GTM and Consent Mode

/**
 * Runs QA tests for consent and tag handling
 */
export class QATester {
  /**
   * @param {ConsentManager} consentManager - Consent manager instance
   * @param {TagMonitor} tagMonitor - Tag monitor instance
   */
  constructor(consentManager, tagMonitor) {
    this.consentManager = consentManager;
    this.tagMonitor = tagMonitor;
  }
  
  /**
   * Run all QA tests
   * 
   * @returns {Object} Combined test results
   */
  runAllTests() {
    const consentResults = this.runConsentTest();
    const tagResults = this.runTagTest();
    
    return {
      consentTests: consentResults,
      tagTests: tagResults,
      allPassed: consentResults.every(r => r.passed) && tagResults.every(r => r.passed)
    };
  }
  
  /**
   * Run consent mode tests
   * 
   * @returns {Array} Consent test results
   */
  runConsentTest() {
    return this.consentManager.runConsentTest();
  }
  
  /**
   * Run tag firing tests
   * 
   * @returns {Array} Tag test results
   */
  runTagTest() {
    return this.tagMonitor.runTagTest(
      this.consentManager.getCurrentConsentState.bind(this.consentManager)
    );
  }
}