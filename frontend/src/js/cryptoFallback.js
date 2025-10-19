import CryptoJS from 'crypto-js';

/**
 * CryptoJS 降级解密器
 * 在不支持 WASM 的环境中提供 AES-256-CBC 解密功能
 */
class CryptoFallback {
  constructor() {
    this.algorithm = 'AES';
    this.mode = CryptoJS.mode.CBC;
    this.padding = CryptoJS.pad.Pkcs7;
  }

  /**
   * 解密图片数据
   * @param {Uint8Array} encryptedData - 加密的数据
   * @param {string} keyBase64 - Base64编码的密钥
   * @param {string} ivBase64 - Base64编码的IV
   * @returns {Promise<Uint8Array>} 解密后的数据
   */
  async decryptImage(encryptedData, keyBase64, ivBase64) {
    try {
      // 转换输入数据
      const encryptedWordArray = this._uint8ArrayToWordArray(encryptedData);
      const key = CryptoJS.enc.Base64.parse(keyBase64);
      const iv = CryptoJS.enc.Base64.parse(ivBase64);

      // 验证密钥和IV长度
      if (key.sigBytes !== 32) {
        throw new Error('密钥长度必须为32字节');
      }
      if (iv.sigBytes !== 16) {
        throw new Error('IV长度必须为16字节');
      }

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

      // 转换结果为 Uint8Array
      const decryptedBytes = this._wordArrayToUint8Array(decrypted);
      
      return decryptedBytes;
    } catch (error) {
      throw new Error(`CryptoJS解密失败: ${error.message}`);
    }
  }

  /**
   * 分块解密（模拟异步处理）
   * @param {Uint8Array} encryptedData - 加密的数据
   * @param {string} keyBase64 - Base64编码的密钥
   * @param {string} ivBase64 - Base64编码的IV
   * @param {Function} progressCallback - 进度回调
   * @returns {Promise<Uint8Array>} 解密后的数据
   */
  async decryptImageChunked(encryptedData, keyBase64, ivBase64, progressCallback) {
    try {
      // 报告开始进度
      if (progressCallback) {
        progressCallback(0);
      }

      // 模拟分块处理（实际上CryptoJS不支持真正的流式解密）
      const chunkSize = 1024 * 1024; // 1MB
      const totalSize = encryptedData.length;
      
      // 分块处理进度更新
      for (let i = 0; i < totalSize; i += chunkSize) {
        const progress = Math.min((i / totalSize) * 50, 50); // 前50%用于"分块"
        if (progressCallback) {
          progressCallback(progress);
        }
        
        // 让出控制权，避免阻塞UI
        await this._sleep(10);
      }

      // 执行实际解密
      if (progressCallback) {
        progressCallback(50);
      }

      const result = await this.decryptImage(encryptedData, keyBase64, ivBase64);

      // 完成进度
      if (progressCallback) {
        progressCallback(100);
      }

      return result;
    } catch (error) {
      throw new Error(`分块解密失败: ${error.message}`);
    }
  }

  /**
   * 验证解密结果
   * @param {Uint8Array} decryptedData - 解密后的数据
   * @returns {Object} 验证结果
   */
  verifyDecryptedImage(decryptedData) {
    if (!decryptedData || decryptedData.length < 8) {
      return {
        isValid: false,
        fileType: '',
        fileSize: 0
      };
    }

    const fileType = this._detectImageType(decryptedData);
    
    return {
      isValid: fileType !== '',
      fileType: fileType,
      fileSize: decryptedData.length
    };
  }

  /**
   * 获取性能信息
   * @returns {Object} 性能统计
   */
  getPerformanceInfo() {
    return {
      engine: 'CryptoJS',
      version: CryptoJS.lib.Base.version || 'unknown',
      algorithm: 'AES-256-CBC',
      mode: 'fallback',
      simdSupported: false,
      wasmSupported: false
    };
  }

  /**
   * 检测图片文件类型
   * @private
   */
  _detectImageType(data) {
    if (data.length < 8) {
      return '';
    }

    // JPEG
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
      return 'image/jpeg';
    }
    
    // PNG
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47 &&
        data[4] === 0x0D && data[5] === 0x0A && data[6] === 0x1A && data[7] === 0x0A) {
      return 'image/png';
    }
    
    // GIF
    const gifHeader = String.fromCharCode(...data.slice(0, 6));
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      return 'image/gif';
    }
    
    // WebP
    if (data.length >= 12) {
      const riffHeader = String.fromCharCode(...data.slice(0, 4));
      const webpHeader = String.fromCharCode(...data.slice(8, 12));
      if (riffHeader === 'RIFF' && webpHeader === 'WEBP') {
        return 'image/webp';
      }
    }
    
    // BMP
    if (data[0] === 0x42 && data[1] === 0x4D) {
      return 'image/bmp';
    }

    return '';
  }

  /**
   * Uint8Array 转 WordArray
   * @private
   */
  _uint8ArrayToWordArray(uint8Array) {
    const words = [];
    for (let i = 0; i < uint8Array.length; i += 4) {
      let word = 0;
      for (let j = 0; j < 4 && i + j < uint8Array.length; j++) {
        word |= uint8Array[i + j] << (24 - j * 8);
      }
      words.push(word);
    }
    
    return CryptoJS.lib.WordArray.create(words, uint8Array.length);
  }

  /**
   * WordArray 转 Uint8Array
   * @private
   */
  _wordArrayToUint8Array(wordArray) {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const uint8Array = new Uint8Array(sigBytes);
    
    for (let i = 0; i < sigBytes; i++) {
      const wordIndex = Math.floor(i / 4);
      const byteIndex = i % 4;
      uint8Array[i] = (words[wordIndex] >>> (24 - byteIndex * 8)) & 0xFF;
    }
    
    return uint8Array;
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
   * @returns {Promise<boolean>} 测试结果
   */
  async testDecryption() {
    try {
      // 创建测试数据
      const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const testKey = CryptoJS.lib.WordArray.random(32);
      const testIv = CryptoJS.lib.WordArray.random(16);
      
      // 加密测试数据
      const testWordArray = this._uint8ArrayToWordArray(testData);
      const encrypted = CryptoJS.AES.encrypt(testWordArray, testKey, {
        iv: testIv,
        mode: this.mode,
        padding: this.padding
      });
      
      // 解密测试
      const encryptedBytes = this._wordArrayToUint8Array(encrypted.ciphertext);
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
      console.error('CryptoJS测试失败:', error);
      return false;
    }
  }
}

export default CryptoFallback;