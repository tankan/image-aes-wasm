/**
 * 内存对比测试
 * 对比原版CryptoJS和优化版CryptoJS的内存使用
 */

import ImageDecryptor from '../src/js/imageDecryptor.js';
import CryptoFallback from '../src/js/cryptoFallback.js';
import CryptoOptimized from '../src/js/cryptoOptimized.js';
import TestKeyGenerator from './utils/testKeyGenerator.js';

class MemoryComparison {
  constructor() {
    this.results = [];
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

  // 生成测试数据
  generateTestData(size = 1024 * 100) {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }
    
    const keyPair = TestKeyGenerator.generateDeterministicKeyPair(`memory-comparison-${size}`);
    
    return {
      encrypted: data,
      key: keyPair.key,
      iv: keyPair.iv
    };
  }

  // 测试单个解密器的内存使用
  async testDecryptorMemory(decryptor, testData, iterations = 10, name = 'Unknown') {
    const results = {
      before: [],
      after: [],
      peak: [],
      errors: 0
    };

    console.log(`测试 ${name} 内存使用...`);
    
    for (let i = 0; i < iterations; i++) {
      this.forceGC();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const beforeMem = this.getMemoryUsage();
      results.before.push(beforeMem);

      try {
        await decryptor.decryptImage(testData.encrypted, testData.key, testData.iv);
        
        const afterMem = this.getMemoryUsage();
        results.after.push(afterMem);
        
        if (beforeMem && afterMem) {
          results.peak.push(afterMem.used - beforeMem.used);
        }
      } catch (error) {
        results.errors++;
        console.warn(`${name} 解密失败:`, error.message);
      }
    }

    return this.analyzeResults(results, name);
  }

  // 分析结果
  analyzeResults(results, name) {
    const validPeaks = results.peak.filter(p => !isNaN(p));
    
    if (validPeaks.length === 0) {
      return {
        name,
        avgMemoryIncrease: 0,
        maxMemoryIncrease: 0,
        minMemoryIncrease: 0,
        samples: 0,
        errors: results.errors
      };
    }

    return {
      name,
      avgMemoryIncrease: validPeaks.reduce((a, b) => a + b, 0) / validPeaks.length,
      maxMemoryIncrease: Math.max(...validPeaks),
      minMemoryIncrease: Math.min(...validPeaks),
      samples: validPeaks.length,
      errors: results.errors
    };
  }

  // 运行完整的内存对比测试
  async runComparison() {
    console.log('开始内存对比测试...');
    
    const testSizes = [
      { name: '小文件 (10KB)', size: 1024 * 10 },
      { name: '中等文件 (100KB)', size: 1024 * 100 },
      { name: '大文件 (1MB)', size: 1024 * 1024 }
    ];

    const results = {};
    
    for (const testSize of testSizes) {
      console.log(`\n=== 测试 ${testSize.name} ===`);
      const testData = this.generateTestData(testSize.size);
      
      // 创建解密器实例
      const originalCrypto = new CryptoFallback();
      const optimizedCrypto = new CryptoOptimized();
      
      // 测试原版CryptoJS
      const originalResult = await this.testDecryptorMemory(
        originalCrypto, testData, 10, '原版CryptoJS'
      );
      
      // 等待一段时间，确保内存清理
      await new Promise(resolve => setTimeout(resolve, 500));
      this.forceGC();
      
      // 测试优化版CryptoJS
      const optimizedResult = await this.testDecryptorMemory(
        optimizedCrypto, testData, 10, '优化版CryptoJS'
      );
      
      // 清理优化版的缓存
      optimizedCrypto.cleanup();
      
      results[testSize.name] = {
        original: originalResult,
        optimized: optimizedResult,
        improvement: {
          memoryReduction: originalResult.avgMemoryIncrease - optimizedResult.avgMemoryIncrease,
          reductionPercentage: ((originalResult.avgMemoryIncrease - optimizedResult.avgMemoryIncrease) / originalResult.avgMemoryIncrease * 100) || 0
        }
      };
    }

    this.printComparisonResults(results);
    return results;
  }

  // 打印对比结果
  printComparisonResults(results) {
    console.log('\n=== 内存使用对比结果 ===');
    
    Object.entries(results).forEach(([testName, result]) => {
      console.log(`\n${testName}:`);
      
      console.log('原版CryptoJS:');
      console.log(`  平均内存增长: ${(result.original.avgMemoryIncrease / 1024).toFixed(2)} KB`);
      console.log(`  最大内存增长: ${(result.original.maxMemoryIncrease / 1024).toFixed(2)} KB`);
      console.log(`  错误次数: ${result.original.errors}`);
      
      console.log('优化版CryptoJS:');
      console.log(`  平均内存增长: ${(result.optimized.avgMemoryIncrease / 1024).toFixed(2)} KB`);
      console.log(`  最大内存增长: ${(result.optimized.maxMemoryIncrease / 1024).toFixed(2)} KB`);
      console.log(`  错误次数: ${result.optimized.errors}`);
      
      console.log('改进效果:');
      console.log(`  内存减少: ${(result.improvement.memoryReduction / 1024).toFixed(2)} KB`);
      console.log(`  减少百分比: ${result.improvement.reductionPercentage.toFixed(1)}%`);
      
      if (result.improvement.reductionPercentage > 0) {
        console.log('  ✅ 优化版内存使用更少');
      } else if (result.improvement.reductionPercentage < -5) {
        console.log('  ⚠️ 优化版内存使用更多');
      } else {
        console.log('  ➖ 内存使用基本相同');
      }
    });
    
    // 计算总体改进
    const totalOriginal = Object.values(results).reduce((sum, r) => sum + r.original.avgMemoryIncrease, 0);
    const totalOptimized = Object.values(results).reduce((sum, r) => sum + r.optimized.avgMemoryIncrease, 0);
    const overallImprovement = ((totalOriginal - totalOptimized) / totalOriginal * 100) || 0;
    
    console.log(`\n总体内存优化效果: ${overallImprovement.toFixed(1)}%`);
  }

  // 测试缓存效果
  async testCacheEffectiveness() {
    console.log('\n=== 测试缓存效果 ===');
    
    const optimizedCrypto = new CryptoOptimized();
    const testData = this.generateTestData(1024 * 50); // 50KB
    
    // 第一次解密（冷缓存）
    const start1 = performance.now();
    await optimizedCrypto.decryptImage(testData.encrypted, testData.key, testData.iv);
    const time1 = performance.now() - start1;
    
    // 第二次解密（热缓存）
    const start2 = performance.now();
    await optimizedCrypto.decryptImage(testData.encrypted, testData.key, testData.iv);
    const time2 = performance.now() - start2;
    
    const cacheInfo = optimizedCrypto.getPerformanceInfo();
    
    console.log('缓存效果测试结果:');
    console.log(`  第一次解密时间: ${time1.toFixed(2)}ms`);
    console.log(`  第二次解密时间: ${time2.toFixed(2)}ms`);
    console.log(`  性能提升: ${((time1 - time2) / time1 * 100).toFixed(1)}%`);
    console.log(`  缓存的密钥数: ${cacheInfo.keysCached}`);
    console.log(`  缓存的IV数: ${cacheInfo.ivsCached}`);
    console.log(`  对象池大小: ${cacheInfo.pooledObjects}`);
    
    optimizedCrypto.cleanup();
    
    return {
      coldCacheTime: time1,
      hotCacheTime: time2,
      improvement: (time1 - time2) / time1 * 100,
      cacheInfo
    };
  }
}

// 导出用于测试
window.MemoryComparison = MemoryComparison;

export default MemoryComparison;