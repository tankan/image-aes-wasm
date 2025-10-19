/**
 * 内存使用分析测试
 * 对比WASM和CryptoJS两种模式的内存使用模式
 */

import ImageDecryptor from '../src/js/imageDecryptor.js';
import TestKeyGenerator from './utils/testKeyGenerator.js';
import ImageTestDataGenerator from './utils/imageTestDataGenerator.js';

class MemoryAnalyzer {
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

  // 强制垃圾回收（如果可用）
  forceGC() {
    if (window.gc) {
      window.gc();
    }
  }

  // 测试内存使用
  async testMemoryUsage(testData, iterations = 5) {
    const decryptor = new ImageDecryptor();
    await decryptor.initialize();

    const results = {
      wasm: { before: [], after: [], peak: [], baseline: [] },
      cryptojs: { before: [], after: [], peak: [], baseline: [] }
    };

    // 建立基线内存使用
    console.log('建立基线内存使用...');
    this.forceGC();
    await new Promise(resolve => setTimeout(resolve, 200));
    const baselineMemory = this.getMemoryUsage();
    console.log(`基线内存: ${(baselineMemory.used/1024).toFixed(2)} KB`);

    // 测试WASM模式
    console.log('测试WASM模式内存使用...');
    for (let i = 0; i < iterations; i++) {
      // 多次垃圾回收确保清理
      for (let gc = 0; gc < 3; gc++) {
        this.forceGC();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const beforeMem = this.getMemoryUsage();
      results.wasm.before.push(beforeMem);
      results.wasm.baseline.push(beforeMem.used - baselineMemory.used);

      try {
        // 检查WASM是否已初始化
        if (!decryptor.wasmDecryptor) {
          console.warn('WASM解密器未初始化，跳过测试');
          results.wasm.peak.push(0);
          continue;
        }

        // 强制使用WASM模式
        const result = await decryptor._decryptWithWasm(
          testData.encrypted, 
          testData.key, 
          testData.iv
        );
        
        // 立即测量内存，不等待垃圾回收
        const afterMem = this.getMemoryUsage();
        results.wasm.after.push(afterMem);
        const memoryDiff = afterMem.used - beforeMem.used;
        results.wasm.peak.push(memoryDiff);
        
        console.log(`WASM 第${i+1}次测试: 内存变化 ${(memoryDiff/1024).toFixed(2)} KB (基线偏移: ${((beforeMem.used - baselineMemory.used)/1024).toFixed(2)} KB)`);
      } catch (error) {
        console.warn('WASM解密失败:', error.message);
        results.wasm.peak.push(0); // 失败时记录0
      }
    }

    // 测试CryptoJS模式
    console.log('测试CryptoJS模式内存使用...');
    for (let i = 0; i < iterations; i++) {
      // 多次垃圾回收确保清理
      for (let gc = 0; gc < 3; gc++) {
        this.forceGC();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const beforeMem = this.getMemoryUsage();
      results.cryptojs.before.push(beforeMem);
      results.cryptojs.baseline.push(beforeMem.used - baselineMemory.used);

      try {
        console.log(`CryptoJS 第${i+1}次测试开始，数据大小: ${testData.encrypted.length} bytes (基线偏移: ${((beforeMem.used - baselineMemory.used)/1024).toFixed(2)} KB)`);
        
        // 强制使用CryptoJS模式
        const result = await decryptor.fallbackDecryptor.decryptImage(
          testData.encrypted, 
          testData.key, 
          testData.iv
        );
        
        console.log(`CryptoJS 第${i+1}次测试完成，结果大小: ${result ? result.length : 0} bytes`);
        
        // 立即测量内存，不等待垃圾回收
        const afterMem = this.getMemoryUsage();
        results.cryptojs.after.push(afterMem);
        const memoryDiff = afterMem.used - beforeMem.used;
        results.cryptojs.peak.push(memoryDiff);
        
        console.log(`CryptoJS 第${i+1}次测试: 内存变化 ${(memoryDiff/1024).toFixed(2)} KB`);
      } catch (error) {
        console.warn('CryptoJS解密失败:', error.message);
        console.log(`CryptoJS 第${i+1}次测试失败，错误: ${error.message}`);
        results.cryptojs.peak.push(0); // 失败时记录0
      }
    }

    return this.analyzeResults(results, baselineMemory);
  }

  analyzeResults(results, baselineMemory) {
    const analysis = {};
    
    ['wasm', 'cryptojs'].forEach(mode => {
      const peaks = results[mode].peak;
      const validPeaks = peaks.filter(p => !isNaN(p));
      const positivePeaks = validPeaks.filter(p => p > 0);
      const negativePeaks = validPeaks.filter(p => p < 0);
      const baselines = results[mode].baseline || [];
      
      analysis[mode] = {
        avgMemoryChange: validPeaks.reduce((a, b) => a + b, 0) / validPeaks.length || 0,
        maxMemoryIncrease: Math.max(...validPeaks, 0),
        minMemoryChange: Math.min(...validPeaks, 0),
        avgPositiveGrowth: positivePeaks.reduce((a, b) => a + b, 0) / positivePeaks.length || 0,
        avgNegativeChange: negativePeaks.reduce((a, b) => a + b, 0) / negativePeaks.length || 0,
        avgBaselineOffset: baselines.reduce((a, b) => a + b, 0) / baselines.length || 0,
        totalSamples: peaks.length,
        validSamples: validPeaks.length,
        positiveSamples: positivePeaks.length,
        negativeSamples: negativePeaks.length,
        rawPeaks: validPeaks,
        rawBaselines: baselines
      };
    });

    return analysis;
  }

  // 生成测试数据
  async generateTestData(size = 1024 * 100) { // 100KB
    console.log(`生成 ${(size/1024).toFixed(0)}KB 的真实图片测试数据...`);
    
    // 根据大小选择合适的图片格式
    let format = 'png';
    if (size < 50 * 1024) {
      format = 'bmp'; // 小文件使用BMP，数据密度高
    } else if (size > 500 * 1024) {
      format = 'png'; // 大文件使用PNG，有更好的结构
    } else {
      format = 'jpeg'; // 中等文件使用JPEG
    }
    
    // 生成真实的图片测试数据
    const testDataSet = ImageTestDataGenerator.generateTestDataSet(
      size, 
      format, 
      `memory-test-${size}-${format}`
    );
    
    console.log(`生成完成: 原始数据 ${testDataSet.originalSize} bytes, 加密数据 ${testDataSet.encryptedSize} bytes, 格式: ${testDataSet.format}`);
    
    return {
      encrypted: testDataSet.encrypted,
      key: testDataSet.key,
      iv: testDataSet.iv,
      original: testDataSet.original,
      format: testDataSet.format,
      metadata: {
        originalSize: testDataSet.originalSize,
        encryptedSize: testDataSet.encryptedSize,
        compressionRatio: testDataSet.encryptedSize / testDataSet.originalSize
      }
    };
  }

  async runAnalysis() {
    console.log('开始内存使用分析...');
    
    const testSizes = [
      { name: '小文件 (10KB)', size: 1024 * 10 },
      { name: '中等文件 (100KB)', size: 1024 * 100 },
      { name: '大文件 (1MB)', size: 1024 * 1024 }
    ];

    const results = {};
    
    for (const testSize of testSizes) {
      console.log(`\n测试 ${testSize.name}...`);
      const testData = await this.generateTestData(testSize.size);
      console.log(`使用格式: ${testData.format}, 压缩比: ${testData.metadata.compressionRatio.toFixed(2)}`);
      
      results[testSize.name] = await this.testMemoryUsage(testData);
      
      // 在测试之间添加更长的等待时间，确保内存完全清理
      console.log('等待内存清理...');
      for (let i = 0; i < 5; i++) {
        this.forceGC();
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    this.printResults(results);
    return results;
  }

  printResults(results) {
    console.log('\n=== 内存使用分析结果 ===');
    
    Object.entries(results).forEach(([testName, result]) => {
      console.log(`\n${testName}:`);
      
      console.log('WASM模式:');
      console.log(`  平均内存变化: ${(result.wasm.avgMemoryChange / 1024).toFixed(2)} KB`);
      console.log(`  最大内存增长: ${(result.wasm.maxMemoryIncrease / 1024).toFixed(2)} KB`);
      console.log(`  最小内存变化: ${(result.wasm.minMemoryChange / 1024).toFixed(2)} KB`);
      console.log(`  平均正向增长: ${(result.wasm.avgPositiveGrowth / 1024).toFixed(2)} KB`);
      console.log(`  平均负向变化: ${(result.wasm.avgNegativeChange / 1024).toFixed(2)} KB`);
      console.log(`  平均基线偏移: ${(result.wasm.avgBaselineOffset / 1024).toFixed(2)} KB`);
      console.log(`  有效样本: ${result.wasm.validSamples}/${result.wasm.totalSamples} (正向: ${result.wasm.positiveSamples}, 负向: ${result.wasm.negativeSamples})`);
      console.log(`  原始数据: [${result.wasm.rawPeaks.map(p => (p/1024).toFixed(1)).join(', ')}] KB`);
      
      console.log('CryptoJS模式:');
      console.log(`  平均内存变化: ${(result.cryptojs.avgMemoryChange / 1024).toFixed(2)} KB`);
      console.log(`  最大内存增长: ${(result.cryptojs.maxMemoryIncrease / 1024).toFixed(2)} KB`);
      console.log(`  最小内存变化: ${(result.cryptojs.minMemoryChange / 1024).toFixed(2)} KB`);
      console.log(`  平均正向增长: ${(result.cryptojs.avgPositiveGrowth / 1024).toFixed(2)} KB`);
      console.log(`  平均负向变化: ${(result.cryptojs.avgNegativeChange / 1024).toFixed(2)} KB`);
      console.log(`  平均基线偏移: ${(result.cryptojs.avgBaselineOffset / 1024).toFixed(2)} KB`);
      console.log(`  有效样本: ${result.cryptojs.validSamples}/${result.cryptojs.totalSamples} (正向: ${result.cryptojs.positiveSamples}, 负向: ${result.cryptojs.negativeSamples})`);
      console.log(`  原始数据: [${result.cryptojs.rawPeaks.map(p => (p/1024).toFixed(1)).join(', ')}] KB`);
      
      // 计算内存比率
      const wasmAvg = result.wasm.avgMemoryChange;
      const cryptojsAvg = result.cryptojs.avgMemoryChange;
      
      if (cryptojsAvg === 0 && wasmAvg === 0) {
        console.log(`  WASM/CryptoJS 内存比率: N/A (两者都为0)`);
      } else if (cryptojsAvg === 0) {
        console.log(`  WASM/CryptoJS 内存比率: Infinity (CryptoJS为0)`);
      } else if (wasmAvg === 0) {
        console.log(`  WASM/CryptoJS 内存比率: 0 (WASM为0)`);
      } else {
        console.log(`  WASM/CryptoJS 内存比率: ${(wasmAvg / cryptojsAvg).toFixed(2)}`);
      }
    });
  }
}

// 导出用于测试
window.MemoryAnalyzer = MemoryAnalyzer;

export default MemoryAnalyzer;