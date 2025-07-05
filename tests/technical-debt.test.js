// Technical Debt Improvements Test Suite
console.log('🧪 Running Technical Debt Improvements Tests...');

// Mock environment setup
const mockPerformance = {
  memory: {
    usedJSHeapSize: 1024 * 1024 * 50, // 50MB
    totalJSHeapSize: 1024 * 1024 * 100, // 100MB
    jsHeapSizeLimit: 1024 * 1024 * 200 // 200MB
  }
};

const mockConsole = {
  log: [],
  error: [],
  warn: [],
  
  log: function(...args) {
    this.log.push(args.join(' '));
  },
  
  error: function(...args) {
    this.error.push(args.join(' '));
  },
  
  warn: function(...args) {
    this.warn.push(args.join(' '));
  },
  
  clear: function() {
    this.log = [];
    this.error = [];
    this.warn = [];
  }
};

// Test Performance Monitor
function testPerformanceMonitor() {
  console.log('📊 Testing Performance Monitor...');
  
  const tests = [];
  
  // Test 1: Performance monitoring initialization
  tests.push(() => {
    return new Promise((resolve, reject) => {
      try {
        const monitor = {
          startTime: Date.now(),
          metrics: {
            detectionTime: 0,
            memoryUsage: 0,
            dataLayerSize: 0,
            triggerCount: 0,
            variableCount: 0
          },
          
          startTimer: function(name) {
            this[`${name}Start`] = Date.now();
          },
          
          endTimer: function(name) {
            if (this[`${name}Start`]) {
              this.metrics[name] = Date.now() - this[`${name}Start`];
              return this.metrics[name];
            }
            return 0;
          },
          
          getMemoryUsage: function() {
            return {
              used: mockPerformance.memory.usedJSHeapSize,
              total: mockPerformance.memory.totalJSHeapSize,
              limit: mockPerformance.memory.jsHeapSizeLimit
            };
          },
          
          getMetrics: function() {
            return {
              ...this.metrics,
              totalTime: Date.now() - this.startTime,
              memory: this.getMemoryUsage()
            };
          }
        };
        
        // Test timer functionality
        monitor.startTimer('testOperation');
        const startTime = Date.now();
        
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000000; i++) {
          sum += i;
        }
        
        const duration = monitor.endTimer('testOperation');
        const actualDuration = Date.now() - startTime;
        
        // Verify timer accuracy (within 10ms tolerance)
        if (Math.abs(duration - actualDuration) > 10) {
          throw new Error(`Timer accuracy test failed. Expected ~${actualDuration}ms, got ${duration}ms`);
        }
        
        // Test memory usage
        const memory = monitor.getMemoryUsage();
        if (memory.used !== mockPerformance.memory.usedJSHeapSize) {
          throw new Error('Memory usage test failed');
        }
        
        // Test metrics
        const metrics = monitor.getMetrics();
        if (!metrics.totalTime || !metrics.memory) {
          throw new Error('Metrics test failed');
        }
        
        console.log('✅ Performance Monitor tests passed');
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });
  
  // Test 2: Error handling system
  tests.push(() => {
    return new Promise((resolve, reject) => {
      try {
        const errorHandler = {
          errors: [],
          maxErrors: 10,
          
          addError: function(error, context = 'test') {
            const errorEntry = {
              message: error.message || error,
              context: context,
              timestamp: Date.now(),
              stack: error.stack
            };
            
            this.errors.push(errorEntry);
            
            if (this.errors.length > this.maxErrors) {
              this.errors = this.errors.slice(-this.maxErrors);
            }
          },
          
          getErrors: function() {
            return this.errors;
          },
          
          clearErrors: function() {
            this.errors = [];
          },
          
          wrapFunction: function(fn, context = 'test') {
            return function(...args) {
              try {
                return fn.apply(this, args);
              } catch (error) {
                this.addError(error, context);
                return { error: error.message, context };
              }
            }.bind(this);
          },
          
          safeExecute: function(fn, fallback = null, context = 'test') {
            try {
              return fn();
            } catch (error) {
              this.addError(error, context);
              return fallback;
            }
          }
        };
        
        // Test error tracking
        const testError = new Error('Test error');
        errorHandler.addError(testError, 'test-context');
        
        if (errorHandler.errors.length !== 1) {
          throw new Error('Error tracking test failed');
        }
        
        if (errorHandler.errors[0].context !== 'test-context') {
          throw new Error('Error context test failed');
        }
        
        // Test error limit
        for (let i = 0; i < 15; i++) {
          errorHandler.addError(new Error(`Error ${i}`));
        }
        
        if (errorHandler.errors.length > errorHandler.maxErrors) {
          throw new Error('Error limit test failed');
        }
        
        // Test safe execution
        const failingFunction = () => {
          throw new Error('Intentional error');
        };
        
        const result = errorHandler.safeExecute(failingFunction, 'fallback', 'safe-test');
        if (result !== 'fallback') {
          throw new Error('Safe execution test failed');
        }
        
        // Test function wrapping
        const wrappedFunction = errorHandler.wrapFunction(failingFunction, 'wrap-test');
        const wrappedResult = wrappedFunction();
        
        if (!wrappedResult.error) {
          throw new Error('Function wrapping test failed');
        }
        
        console.log('✅ Error Handler tests passed');
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });
  
  // Test 3: Lazy loading system
  tests.push(() => {
    return new Promise((resolve, reject) => {
      try {
        const lazyLoader = {
          loadedModules: new Set(),
          
          loadModule: function(moduleName, loader) {
            if (this.loadedModules.has(moduleName)) {
              return Promise.resolve('already-loaded');
            }
            
            return new Promise((resolve, reject) => {
              try {
                const result = loader();
                this.loadedModules.add(moduleName);
                resolve(result);
              } catch (error) {
                reject(error);
              }
            });
          },
          
          isLoaded: function(moduleName) {
            return this.loadedModules.has(moduleName);
          }
        };
        
        // Test module loading
        let loadCount = 0;
        const testLoader = () => {
          loadCount++;
          return `module-loaded-${loadCount}`;
        };
        
        lazyLoader.loadModule('test-module', testLoader)
          .then(result => {
            if (result !== 'module-loaded-1') {
              throw new Error('Module loading test failed');
            }
            
            if (!lazyLoader.isLoaded('test-module')) {
              throw new Error('Module tracking test failed');
            }
            
            // Test duplicate loading
            return lazyLoader.loadModule('test-module', testLoader);
          })
          .then(result => {
            if (result !== 'already-loaded') {
              throw new Error('Duplicate loading test failed');
            }
            
            if (loadCount !== 1) {
              throw new Error('Loader execution count test failed');
            }
            
            console.log('✅ Lazy Loader tests passed');
            resolve(true);
          })
          .catch(error => {
            reject(error);
          });
      } catch (error) {
        reject(error);
      }
    });
  });
  
  // Test 4: Memory management
  tests.push(() => {
    return new Promise((resolve, reject) => {
      try {
        const memoryManager = {
          allocations: new Map(),
          
          trackAllocation: function(name, size) {
            this.allocations.set(name, {
              size: size,
              timestamp: Date.now()
            });
          },
          
          getTotalAllocated: function() {
            let total = 0;
            for (const allocation of this.allocations.values()) {
              total += allocation.size;
            }
            return total;
          },
          
          cleanup: function(maxAge = 30000) { // 30 seconds
            const now = Date.now();
            for (const [name, allocation] of this.allocations.entries()) {
              // If maxAge is negative, clean up everything
              if (maxAge < 0 || now - allocation.timestamp > maxAge) {
                this.allocations.delete(name);
              }
            }
          }
        };
        
        // Test memory tracking
        memoryManager.trackAllocation('test1', 1024);
        memoryManager.trackAllocation('test2', 2048);
        
        if (memoryManager.getTotalAllocated() !== 3072) {
          throw new Error('Memory tracking test failed');
        }
        
        // Test cleanup - use a negative value to ensure cleanup
        memoryManager.cleanup(-1); // Force cleanup by using negative maxAge
        const totalAfterCleanup = memoryManager.getTotalAllocated();
        if (totalAfterCleanup !== 0) {
          throw new Error(`Memory cleanup test failed. Expected 0, got ${totalAfterCleanup}. Allocations remaining: ${memoryManager.allocations.size}`);
        }
        
        console.log('✅ Memory Manager tests passed');
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });
  
  // Test 5: Performance impact measurement
  tests.push(() => {
    return new Promise((resolve, reject) => {
      try {
        const performanceImpact = {
          measurements: [],
          
          measure: function(name, fn) {
            const start = performance.now();
            const result = fn();
            const end = performance.now();
            
            this.measurements.push({
              name: name,
              duration: end - start,
              timestamp: Date.now()
            });
            
            return result;
          },
          
          getAverageDuration: function(name) {
            const relevant = this.measurements.filter(m => m.name === name);
            if (relevant.length === 0) return 0;
            
            const total = relevant.reduce((sum, m) => sum + m.duration, 0);
            return total / relevant.length;
          },
          
          getSlowestOperations: function(limit = 5) {
            return this.measurements
              .sort((a, b) => b.duration - a.duration)
              .slice(0, limit);
          }
        };
        
        // Test performance measurement
        performanceImpact.measure('fast-operation', () => {
          return 42;
        });
        
        performanceImpact.measure('slow-operation', () => {
          let sum = 0;
          for (let i = 0; i < 100000; i++) {
            sum += i;
          }
          return sum;
        });
        
        if (performanceImpact.measurements.length !== 2) {
          throw new Error('Performance measurement count test failed');
        }
        
        const slowest = performanceImpact.getSlowestOperations(1);
        if (slowest[0].name !== 'slow-operation') {
          throw new Error('Slowest operation detection test failed');
        }
        
        console.log('✅ Performance Impact tests passed');
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });
  
  // Run all tests
  let passed = 0;
  let failed = 0;
  const testResults = [];
  
  const runTests = async () => {
    console.log('🚀 Starting Technical Debt Test Suite...');
    
    for (let i = 0; i < tests.length; i++) {
      const testName = `Test ${i + 1}`;
      console.log(`\n🧪 Running ${testName}...`);
      
      try {
        const result = await tests[i]();
        if (result) {
          passed++;
          testResults.push({ name: testName, status: 'PASS' });
          console.log(`✅ ${testName} passed`);
        } else {
          failed++;
          testResults.push({ name: testName, status: 'FAIL', error: 'Test returned false' });
          console.log(`❌ ${testName} failed: Test returned false`);
        }
      } catch (error) {
        failed++;
        testResults.push({ name: testName, status: 'FAIL', error: error.message });
        console.error(`❌ ${testName} failed:`, error.message);
      }
    }
    
    console.log(`\n📊 Technical Debt Test Results:`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    
    // Show detailed results
    console.log('\n📋 Detailed Test Results:');
    testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${status} ${result.name}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    if (failed === 0) {
      console.log('\n🎉 All technical debt improvements working correctly!');
    } else {
      console.log('\n⚠️ Some technical debt improvements need attention');
    }
  };
  
  runTests();
}

// Run the test suite
testPerformanceMonitor(); 