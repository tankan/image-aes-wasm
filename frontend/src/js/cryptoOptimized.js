import CryptoJS from 'crypto-js';
import { getConfig } from './config.js';

/**
 * 优化版CryptoJS解密器
 * 减少数据转换开销，提高内存效率
 */
class CryptoOptimized {
  constructor() {
    this.algorithm = 'AES';
    this.mode = CryptoJS.mode.CBC;
    this.padding = CryptoJS.pad.Pkcs7;
    
    // 缓存转换结果
    this.keyCache = new Map();
    this.ivCache = new Map();
    
    // 复用WordArray对象池
    this.wordArrayPool = [];
    this.maxPoolSize = 10;
  }

  /**
   * 优化的解密方法
   * @param {Uint8Array} encryptedData - 加密的数据
   * @param {string} keyBase64 - Base64编码的密钥
   * @param {string} ivBase64 - Base64编码的IV
   * @returns {Promise<Uint8Array>} 解密后的数据
   */
  async decryptImage(encryptedData, keyBase64, ivBase64) {
    try {
      // 使用缓存的密钥和IV
      const key = this._getCachedKey(keyBase64);
      const iv = this._getCachedIV(ivBase64);

      // 验证密钥和IV长度
      if (key.sigBytes !== 32) {
        throw new Error('密钥长度必须为32字节');
      }
      if (iv.sigBytes !== 16) {
        throw new Error('IV长度必须为16字节');
      }

      // 优化的数据转换
      const encryptedWordArray = this._optimizedUint8ArrayToWordArray(encryptedData);

      // 执行解密
      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: encryptedWordArray },
        key,
        {
          iv: iv,
          mode: this.mode,
          padding: this.padding
        }
      );

      // 优化的结果转换
      const decryptedBytes = this._optimizedWordArrayToUint8Array(decrypted);
      
      // 回收WordArray到对象池
      this._recycleWordArray(encryptedWordArray);
      
      return decryptedBytes;
    } catch (error) {
      throw new Error(`解密失败: ${error.message}`);
    }
  }

  /**
   * 渐进式解密（大文件优化）
   */
  async decryptImageProgressive(encryptedData, keyBase64, ivBase64, progressCallback) {
    const chunkSize = 64 * 1024; // 64KB chunks
    const chunks = [];
    
    for (let i = 0; i < encryptedData.length; i += chunkSize) {
      const chunk = encryptedData.slice(i, i + chunkSize);
      const decryptedChunk = await this.decryptImage(chunk, keyBase64, ivBase64);
      chunks.push(decryptedChunk);
      
      if (progressCallback) {
        progressCallback((i + chunkSize) / encryptedData.length);
      }
      
      // 让出控制权，避免阻塞UI
      await this._sleep(1);
    }
    
    // 合并结果
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result;
  }

  /**
   * 获取缓存的密钥
   * @private
   */
  _getCachedKey(keyBase64) {
    if (!this.keyCache.has(keyBase64)) {
      const key = CryptoJS.enc.Base64.parse(keyBase64);
      this.keyCache.set(keyBase64, key);
      
      // 限制缓存大小
      if (this.keyCache.size > 50) {
        const firstKey = this.keyCache.keys().next().value;
        this.keyCache.delete(firstKey);
      }
    }
    return this.keyCache.get(keyBase64);
  }

  /**
   * 获取缓存的IV
   * @private
   */
  _getCachedIV(ivBase64) {
    if (!this.ivCache.has(ivBase64)) {
      const iv = CryptoJS.enc.Base64.parse(ivBase64);
      this.ivCache.set(ivBase64, iv);
      
      // 限制缓存大小
      if (this.ivCache.size > 50) {
        const firstIV = this.ivCache.keys().next().value;
        this.ivCache.delete(firstIV);
      }
    }
    return this.ivCache.get(ivBase64);
  }

  /**
   * 优化的Uint8Array到WordArray转换
   * 使用对象池和批量处理
   * @private
   */
  _optimizedUint8ArrayToWordArray(uint8Array) {
    const wordArray = this._getWordArrayFromPool();
    const words = wordArray.words;
    const length = uint8Array.length;
    
    // 清空现有数据
    words.length = 0;
    
    // 批量处理，减少循环开销
    const wordCount = Math.ceil(length / 4);
    words.length = wordCount;
    
    // 使用DataView进行更高效的字节操作
    const buffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + length);
    const view = new DataView(buffer);
    
    for (let i = 0; i < wordCount; i++) {
      const byteIndex = i * 4;
      let word = 0;
      
      // 处理完整的4字节
      if (byteIndex + 3 < length) {
        word = view.getUint32(byteIndex, false); // big-endian
      } else {
        // 处理剩余字节
        for (let j = 0; j < 4 && byteIndex + j < length; j++) {
          word |= uint8Array[byteIndex + j] << (24 - j * 8);
        }
      }
      
      words[i] = word;
    }
    
    wordArray.sigBytes = length;
    return wordArray;
  }

  /**
   * 优化的WordArray到Uint8Array转换
   * @private
   */
  _optimizedWordArrayToUint8Array(wordArray) {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const uint8Array = new Uint8Array(sigBytes);
    
    // 使用ArrayBuffer进行批量操作
    const buffer = new ArrayBuffer(sigBytes);
    const view = new DataView(buffer);
    const result = new Uint8Array(buffer);
    
    // 批量写入完整的4字节块
    const fullWords = Math.floor(sigBytes / 4);
    for (let i = 0; i < fullWords; i++) {
      view.setUint32(i * 4, words[i], false); // big-endian
    }
    
    // 处理剩余字节
    const remainingBytes = sigBytes % 4;
    if (remainingBytes > 0) {
      const lastWordIndex = fullWords;
      const lastWord = words[lastWordIndex];
      for (let j = 0; j < remainingBytes; j++) {
        result[fullWords * 4 + j] = (lastWord >>> (24 - j * 8)) & 0xFF;
      }
    }
    
    return result;
  }

  /**
   * 从对象池获取WordArray
   * @private
   */
  _getWordArrayFromPool() {
    if (this.wordArrayPool.length > 0) {
      return this.wordArrayPool.pop();
    }
    return CryptoJS.lib.WordArray.create();
  }

  /**
   * 回收WordArray到对象池
   * @private
   */
  _recycleWordArray(wordArray) {
    if (this.wordArrayPool.length < this.maxPoolSize) {
      // 清空数据但保留对象
      wordArray.words.length = 0;
      wordArray.sigBytes = 0;
      this.wordArrayPool.push(wordArray);
    }
  }

  /**
   * 清理缓存和对象池
   */
  cleanup() {
    this.keyCache.clear();
    this.ivCache.clear();
    this.wordArrayPool.length = 0;
  }

  /**
   * 获取性能信息
   */
  getPerformanceInfo() {
    return {
      keysCached: this.keyCache.size,
      ivsCached: this.ivCache.size,
      pooledObjects: this.wordArrayPool.length,
      maxPoolSize: this.maxPoolSize
    };
  }

  /**
   * 异步延时
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 测试解密功能
   */
  async testDecryption() {
    try {
      // 创建测试数据
      const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const testKey = CryptoJS.lib.WordArray.random(32);
      const testIv = CryptoJS.lib.WordArray.random(16);
      
      // 加密测试数据
      const testWordArray = this._optimizedUint8ArrayToWordArray(testData);
      const encrypted = CryptoJS.AES.encrypt(testWordArray, testKey, {
        iv: testIv,
        mode: this.mode,
        padding: this.padding
      });
      
      // 解密测试
      const encryptedBytes = this._optimizedWordArrayToUint8Array(encrypted.ciphertext);
      const keyBase64 = CryptoJS.enc.Base64.stringify(testKey);
      const ivBase64 = CryptoJS.enc.Base64.stringify(testIv);
      
      const decrypted = await this.decryptImage(encryptedBytes, keyBase64, ivBase64);
      
      // 验证结果
      if (decrypted.length !== testData.length) {
        return false;
      }
      
      for (let i = 0; i < testData.length; i++) {
        if (decrypted[i] !== testData[i]) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('优化版CryptoJS测试失败:', error);
      return false;
    }
  }
}

export default CryptoOptimized;