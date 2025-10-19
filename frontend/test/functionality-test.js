/**
 * 功能一致性测试
 * 验证WASM和CryptoJS两种模式的解密结果、错误处理和边界情况处理
 */

import ImageDecryptor from '../src/js/imageDecryptor.js';
import CryptoJS from 'crypto-js';
import TestKeyGenerator from './utils/testKeyGenerator.js';

class FunctionalityTester {
  constructor() {
    this.testResults = [];
  }

  // 生成测试数据
  generateTestData(size = 1024) {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }
    
    // 使用安全的密钥生成器
    const keyPair = TestKeyGenerator.generateDeterministicKeyPair('functionality-test');
    
    return {
      data,
      encrypted: this.encryptWithCryptoJS(data, keyPair.key, keyPair.iv),
      key: keyPair.key,
      iv: keyPair.iv
    };
  }

  // 使用CryptoJS加密数据（作为标准参考）
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

  // 比较两个Uint8Array是否相等
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // 测试解密结果一致性
  async testDecryptionConsistency() {
    console.log('测试解密结果一致性...');
    
    const decryptor = new ImageDecryptor();
    await decryptor.initialize();
    
    const testCases = [
      { name: '小数据 (1KB)', size: 1024 },
      { name: '中等数据 (10KB)', size: 1024 * 10 },
      { name: '大数据 (100KB)', size: 1024 * 100 }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
      console.log(`测试 ${testCase.name}...`);
      
      const testData = this.generateTestData(testCase.size);
      
      let wasmResult = null;
      let cryptojsResult = null;
      let wasmError = null;
      let cryptojsError = null;
      
      // 测试WASM解密
      try {
        wasmResult = await decryptor._decryptWithWasm(testData.encrypted, testData.key, testData.iv);
      } catch (error) {
        wasmError = error.message;
      }
      
      // 测试CryptoJS解密
      try {
        cryptojsResult = await decryptor.fallbackDecryptor.decryptImage(testData.encrypted, testData.key, testData.iv);
      } catch (error) {
        cryptojsError = error.message;
      }
      
      // 比较结果
      const isConsistent = wasmResult && cryptojsResult && this.arraysEqual(wasmResult, cryptojsResult);
      const isOriginalMatch = wasmResult && this.arraysEqual(wasmResult, testData.data);
      
      results.push({
        testCase: testCase.name,
        wasmSuccess: !!wasmResult,
        cryptojsSuccess: !!cryptojsResult,
        isConsistent,
        isOriginalMatch,
        wasmError,
        cryptojsError,
        originalSize: testData.data.length,
        wasmResultSize: wasmResult?.length || 0,
        cryptojsResultSize: cryptojsResult?.length || 0
      });
    }
    
    return results;
  }

  // 测试错误处理一致性
  async testErrorHandling() {
    console.log('测试错误处理一致性...');
    
    const decryptor = new ImageDecryptor();
    await decryptor.initialize();
    
    const errorTestCases = [
      {
        name: '无效密钥长度',
        encrypted: this.generateTestData(1024).encrypted,
        key: TestKeyGenerator.generateKey().substring(0, 20), // 短密钥
        iv: TestKeyGenerator.generateIV()
      },
      {
        name: '无效IV长度',
        encrypted: this.generateTestData(1024).encrypted,
        key: TestKeyGenerator.generateKey(),
        iv: TestKeyGenerator.generateIV().substring(0, 20) // 短IV
      },
      {
        name: '空加密数据',
        encrypted: new Uint8Array(0),
        key: TestKeyGenerator.generateKey(),
        iv: TestKeyGenerator.generateIV()
      },
      {
        name: '损坏的加密数据长度',
        encrypted: new Uint8Array(15).fill(1), // 不是16的倍数
        key: TestKeyGenerator.generateKey(),
        iv: TestKeyGenerator.generateIV()
      },
      {
        name: '空密钥',
        encrypted: this.generateTestData(32).encrypted,
        key: '',
        iv: TestKeyGenerator.generateIV()
      },
      {
        name: '空IV',
        encrypted: this.generateTestData(32).encrypted,
        key: TestKeyGenerator.generateKey(),
        iv: ''
      },
      {
        name: '无效Base64密钥',
        encrypted: this.generateTestData(32).encrypted,
        key: 'invalid-base64!@#',
        iv: TestKeyGenerator.generateIV()
      },
      {
        name: '无效Base64 IV',
        encrypted: this.generateTestData(32).encrypted,
        key: TestKeyGenerator.generateKey(),
        iv: 'invalid-base64!@#'
      }
    ];
    
    const results = [];
    
    for (const testCase of errorTestCases) {
      console.log(`测试 ${testCase.name}...`);
      
      let wasmError = null;
      let cryptojsError = null;
      
      // 测试WASM错误处理
      try {
        await decryptor._decryptWithWasm(testCase.encrypted, testCase.key, testCase.iv);
      } catch (error) {
        wasmError = error.message;
      }
      
      // 测试CryptoJS错误处理
      try {
        await decryptor.fallbackDecryptor.decryptImage(testCase.encrypted, testCase.key, testCase.iv);
      } catch (error) {
        cryptojsError = error.message;
      }
      
      results.push({
        testCase: testCase.name,
        wasmError,
        cryptojsError,
        bothFailed: !!wasmError && !!cryptojsError,
        errorConsistent: !!wasmError === !!cryptojsError
      });
    }
    
    return results;
  }

  // 测试边界情况
  async testEdgeCases() {
    console.log('测试边界情况...');
    
    const decryptor = new ImageDecryptor();
    await decryptor.initialize();
    
    const testCases = [
      {
        name: '空数据',
        data: new Uint8Array(0),
        key: TestKeyGenerator.generateKey(),
        iv: TestKeyGenerator.generateIV()
      },
      {
        name: '无效密钥长度',
        data: new Uint8Array(16).fill(1),
        key: btoa('short'), // 太短的密钥
        iv: TestKeyGenerator.generateIV()
      },
      {
        name: '无效IV长度', 
        data: new Uint8Array(16).fill(1),
        key: TestKeyGenerator.generateKey(),
        iv: btoa('short') // 太短的IV
      },
      {
        name: '无效Base64密钥',
        data: new Uint8Array(16).fill(1),
        key: 'invalid-base64!@#',
        iv: TestKeyGenerator.generateIV()
      }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
      console.log(`测试 ${testCase.name}...`);
      
      let wasmError = null;
      let cryptojsError = null;
      
      // 测试WASM模式
      try {
        await decryptor._decryptWithWasm(testCase.data, testCase.key, testCase.iv);
      } catch (error) {
        wasmError = error.message;
      }
      
      // 测试CryptoJS模式
      try {
        await decryptor.fallbackDecryptor.decryptImage(testCase.data, testCase.key, testCase.iv);
      } catch (error) {
        cryptojsError = error.message;
      }
      
      results.push({
        testCase: testCase.name,
        wasmHandled: wasmError !== null,
        cryptojsHandled: cryptojsError !== null,
        wasmError,
        cryptojsError,
        consistentErrorHandling: (wasmError !== null) === (cryptojsError !== null)
      });
    }
    
    return results;
  }

  // 运行所有测试
  async runAllTests() {
    console.log('开始功能一致性测试...');
    
    const results = {
      consistency: await this.testDecryptionConsistency(),
      errorHandling: await this.testErrorHandling(),
      edgeCases: await this.testEdgeCases()
    };
    
    this.printResults(results);
    return results;
  }

  // 打印测试结果
  printResults(results) {
    console.log('\n=== 功能一致性测试结果 ===');
    
    // 解密一致性结果
    console.log('\n1. 解密结果一致性:');
    results.consistency.forEach(result => {
      console.log(`  ${result.testCase}:`);
      console.log(`    WASM成功: ${result.wasmSuccess}`);
      console.log(`    CryptoJS成功: ${result.cryptojsSuccess}`);
      console.log(`    结果一致: ${result.isConsistent}`);
      console.log(`    与原始数据匹配: ${result.isOriginalMatch}`);
      if (result.wasmError) console.log(`    WASM错误: ${result.wasmError}`);
      if (result.cryptojsError) console.log(`    CryptoJS错误: ${result.cryptojsError}`);
    });
    
    // 错误处理结果
    console.log('\n2. 错误处理一致性:');
    results.errorHandling.forEach(result => {
      console.log(`  ${result.testCase}:`);
      console.log(`    都失败: ${result.bothFailed}`);
      console.log(`    错误处理一致: ${result.errorConsistent}`);
      if (result.wasmError) console.log(`    WASM错误: ${result.wasmError}`);
      if (result.cryptojsError) console.log(`    CryptoJS错误: ${result.cryptojsError}`);
    });
    
    // 边界情况结果
    console.log('\n3. 边界情况测试:');
    results.edgeCases.forEach(result => {
      console.log(`  ${result.testCase}:`);
      console.log(`    WASM处理错误: ${result.wasmHandled}`);
      console.log(`    CryptoJS处理错误: ${result.cryptojsHandled}`);
      console.log(`    错误处理一致: ${result.consistentErrorHandling}`);
      if (result.wasmError) console.log(`    WASM错误: ${result.wasmError}`);
      if (result.cryptojsError) console.log(`    CryptoJS错误: ${result.cryptojsError}`);
    });
  }
}

// 导出用于测试
window.FunctionalityTester = FunctionalityTester;

export default FunctionalityTester;