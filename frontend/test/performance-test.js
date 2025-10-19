/**
 * 性能测试
 * 对比WASM和CryptoJS两种模式的性能表现
 */

import ImageDecryptor from '../src/js/imageDecryptor.js';
import CryptoJS from 'crypto-js';
import TestKeyGenerator from './utils/testKeyGenerator.js';

class PerformanceTester {
  constructor() {
    this.results = [];
  }

  // 生成测试数据
  generateTestData(size = 1024) {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }
    return data;
  }

  // 使用CryptoJS加密数据
  encryptWithCryptoJS(data, keyBase64, ivBase64) {
    const key = CryptoJS.enc.Base64.parse(keyBase64);
    const iv = CryptoJS.enc.Base64.parse(ivBase64);
    
    // 将Uint8Array转换为WordArray
    const words = [];
    for (let i = 0; i < data.length; i += 4) {
      let word = 0;
      for (let j = 0; j < 4 && i + j < data.length; j++) {
        word |= data[i + j] << (24 - j * 8);
      }
      words.push(word);
    }
    const wordArray = CryptoJS.lib.WordArray.create(words, data.length);
    
    // 加密
    const encrypted = CryptoJS.AES.encrypt(wordArray, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    // 转换为Uint8Array
    const encryptedWords = encrypted.ciphertext.words;
    const encryptedBytes = encrypted.ciphertext.sigBytes;
    const result = new Uint8Array(encryptedBytes);
    
    for (let i = 0; i < encryptedBytes; i++) {
      const wordIndex = Math.floor(i / 4);
      const byteIndex = i % 4;
      result[i] = (encryptedWords[wordIndex] >>> (24 - byteIndex * 8)) & 0xFF;
    }
    
    return result;
  }

  // 获取内存使用情况
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  // 强制垃圾回收
  forceGC() {
    if (window.gc) {
      window.gc();
    }
  }

  // 测试单次解密性能
  async testSingleDecryption(decryptor, testData, iterations = 10) {
    const results = {
      wasm: { times: [], errors: 0, memoryUsage: [] },
      cryptojs: { times: [], errors: 0, memoryUsage: [] }
    };

    // 测试WASM模式
    for (let i = 0; i < iterations; i++) {
      this.forceGC();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const memBefore = this.getMemoryUsage();
      const start = performance.now();
      
      try {
        await decryptor._decryptWithWasm(testData.encrypted, testData.key, testData.iv);
        const end = performance.now();
        results.wasm.times.push(end - start);
        
        const memAfter = this.getMemoryUsage();
        if (memBefore && memAfter) {
          results.wasm.memoryUsage.push(memAfter.used - memBefore.used);
        }
      } catch (error) {
        results.wasm.errors++;
        console.warn('WASM解密失败:', error.message);
      }
    }

    // 测试CryptoJS模式
    for (let i = 0; i < iterations; i++) {
      this.forceGC();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const memBefore = this.getMemoryUsage();
      const start = performance.now();
      
      try {
        await decryptor.fallbackDecryptor.decryptImage(testData.encrypted, testData.key, testData.iv);
        const end = performance.now();
        results.cryptojs.times.push(end - start);
        
        const memAfter = this.getMemoryUsage();
        if (memBefore && memAfter) {
          results.cryptojs.memoryUsage.push(memAfter.used - memBefore.used);
        }
      } catch (error) {
        results.cryptojs.errors++;
        console.warn('CryptoJS解密失败:', error.message);
      }
    }

    // 计算统计数据
    const wasmAvg = results.wasm.times.reduce((a, b) => a + b, 0) / results.wasm.times.length || 0;
    const cryptojsAvg = results.cryptojs.times.reduce((a, b) => a + b, 0) / results.cryptojs.times.length || 0;
    
    const wasmMemAvg = results.wasm.memoryUsage.reduce((a, b) => a + b, 0) / results.wasm.memoryUsage.length || 0;
    const cryptojsMemAvg = results.cryptojs.memoryUsage.reduce((a, b) => a + b, 0) / results.cryptojs.memoryUsage.length || 0;

    return {
      wasm: {
        avgTime: wasmAvg,
        minTime: Math.min(...results.wasm.times, Infinity),
        maxTime: Math.max(...results.wasm.times, 0),
        avgMemory: wasmMemAvg,
        errors: results.wasm.errors,
        throughput: testData.encrypted.length / wasmAvg * 1000 // bytes per second
      },
      cryptojs: {
        avgTime: cryptojsAvg,
        minTime: Math.min(...results.cryptojs.times, Infinity),
        maxTime: Math.max(...results.cryptojs.times, 0),
        avgMemory: cryptojsMemAvg,
        errors: results.cryptojs.errors,
        throughput: testData.encrypted.length / cryptojsAvg * 1000 // bytes per second
      },
      speedRatio: cryptojsAvg / wasmAvg,
      memoryRatio: wasmMemAvg / cryptojsMemAvg
    };
  }

  // 测试并发解密性能
  async testConcurrentDecryption(decryptor, testData, concurrency = 5) {
    const results = {
      wasm: { totalTime: 0, successful: 0, errors: 0 },
      cryptojs: { totalTime: 0, successful: 0, errors: 0 }
    };

    // 测试WASM并发
    const wasmStart = performance.now();
    const wasmPromises = Array(concurrency).fill().map(async () => {
      try {
        await decryptor._decryptWithWasm(testData.encrypted, testData.key, testData.iv);
        results.wasm.successful++;
      } catch (error) {
        results.wasm.errors++;
      }
    });
    
    await Promise.all(wasmPromises);
    results.wasm.totalTime = performance.now() - wasmStart;

    // 等待一段时间再测试CryptoJS
    await new Promise(resolve => setTimeout(resolve, 100));

    // 测试CryptoJS并发
    const cryptojsStart = performance.now();
    const cryptojsPromises = Array(concurrency).fill().map(async () => {
      try {
        await decryptor.fallbackDecryptor.decryptImage(testData.encrypted, testData.key, testData.iv);
        results.cryptojs.successful++;
      } catch (error) {
        results.cryptojs.errors++;
      }
    });
    
    await Promise.all(cryptojsPromises);
    results.cryptojs.totalTime = performance.now() - cryptojsStart;

    return results;
  }

  // 测试不同数据大小的性能
  async testScalability() {
    console.log('开始扩展性测试...');
    
    const decryptor = new ImageDecryptor();
    await decryptor.initialize();
    
    const testSizes = [
      { name: '小文件 (1KB)', size: 1024 },
      { name: '中等文件 (10KB)', size: 10 * 1024 },
      { name: '大文件 (100KB)', size: 100 * 1024 },
      { name: '超大文件 (1MB)', size: 1024 * 1024 }
    ];
    
    const results = [];
    
    for (const testSize of testSizes) {
      console.log(`测试 ${testSize.name}...`);
      
      const testData = this.generateTestData(testSize.size);
      const keyPair = TestKeyGenerator.generateDeterministicKeyPair(`scalability-${testSize.size}`);
      const encrypted = this.encryptWithCryptoJS(testData, keyPair.key, keyPair.iv);
      
      const testResult = await this.testSingleDecryption(decryptor, {
        encrypted,
        key: keyPair.key,
        iv: keyPair.iv
      }, 5);
      
      results.push({
        size: testSize.name,
        dataSize: testSize.size,
        ...testResult
      });
    }
    
    return results;
  }

  // 测试并发性能
  async testConcurrency() {
    console.log('测试并发性能...');
    
    const decryptor = new ImageDecryptor();
    await decryptor.initialize();
    
    const keyPair = TestKeyGenerator.generateDeterministicKeyPair('concurrency-test');
    const testData = {
      encrypted: this.encryptWithCryptoJS(
        this.generateTestData(1024 * 100), // 100KB
        keyPair.key,
        keyPair.iv
      ),
      key: keyPair.key,
      iv: keyPair.iv
    };
    
    const concurrencyLevels = [1, 2, 5, 10];
    const results = [];
    
    for (const concurrency of concurrencyLevels) {
      const result = await this.testConcurrentDecryption(decryptor, testData, concurrency);
      
      results.push({
        concurrency,
        wasm: {
          totalTime: result.wasm.totalTime,
          avgTimePerTask: result.wasm.totalTime / concurrency,
          successful: result.wasm.successful,
          errors: result.wasm.errors,
          successRate: result.wasm.successful / concurrency
        },
        cryptojs: {
          totalTime: result.cryptojs.totalTime,
          avgTimePerTask: result.cryptojs.totalTime / concurrency,
          successful: result.cryptojs.successful,
          errors: result.cryptojs.errors,
          successRate: result.cryptojs.successful / concurrency
        },
        speedRatio: result.cryptojs.totalTime / result.wasm.totalTime
      });
    }
    
    return results;
  }

  // 运行所有性能测试
  async runAllTests() {
    console.log('开始性能测试...');
    
    const results = {
      scalability: await this.testScalability(),
      concurrency: await this.testConcurrency()
    };
    
    this.printResults(results);
    return results;
  }

  // 打印测试结果
  printResults(results) {
    console.log('\n=== 性能测试结果 ===');
    
    // 扩展性结果
    console.log('\n1. 扩展性测试:');
    results.scalability.forEach(result => {
      console.log(`  ${result.size} (${result.dataSize} bytes):`);
      console.log(`    WASM: ${result.wasm.avgTime.toFixed(2)}ms (${(result.wasm.throughput / 1024 / 1024).toFixed(2)} MB/s)`);
      console.log(`    CryptoJS: ${result.cryptojs.avgTime.toFixed(2)}ms (${(result.cryptojs.throughput / 1024 / 1024).toFixed(2)} MB/s)`);
      console.log(`    速度比率: ${result.speedRatio.toFixed(2)}x`);
      console.log(`    内存比率: ${result.memoryRatio.toFixed(2)}x`);
      console.log(`    WASM内存: ${(result.wasm.avgMemory / 1024).toFixed(2)} KB`);
      console.log(`    CryptoJS内存: ${(result.cryptojs.avgMemory / 1024).toFixed(2)} KB`);
    });
    
    // 并发性结果
    console.log('\n2. 并发性测试:');
    results.concurrency.forEach(result => {
      console.log(`  并发数 ${result.concurrency}:`);
      console.log(`    WASM: ${result.wasm.totalTime.toFixed(2)}ms (成功率: ${(result.wasm.successRate * 100).toFixed(1)}%)`);
      console.log(`    CryptoJS: ${result.cryptojs.totalTime.toFixed(2)}ms (成功率: ${(result.cryptojs.successRate * 100).toFixed(1)}%)`);
      console.log(`    速度比率: ${result.speedRatio.toFixed(2)}x`);
    });
  }
}

// 导出用于测试
window.PerformanceTester = PerformanceTester;

export default PerformanceTester;