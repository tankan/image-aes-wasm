import wasmLoader from './wasmLoader.js';
import CryptoFallback from './cryptoFallback.js';

/**
 * 图片解密器
 * 自动选择最佳解密方案（WASM 或 CryptoJS）
 */
class ImageDecryptor {
  constructor() {
    this.wasmDecryptor = null;
    this.fallbackDecryptor = new CryptoFallback();
    this.preferWasm = true;
    this.capabilities = null;
  }

  /**
   * 初始化解密器
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} 初始化结果
   */
  async initialize(options = {}) {
    const {
      preferWasm = true,
      wasmPath = '/wasm/image_aes_wasm.js',
      forceMode = null // 'wasm' | 'fallback' | null
    } = options;

    this.preferWasm = preferWasm;

    // 检测能力
    this.capabilities = await this._detectCapabilities();

    // 强制模式
    if (forceMode === 'fallback') {
      console.log('🔄 强制使用 CryptoJS 模式');
      return {
        success: true,
        mode: 'fallback',
        capabilities: this.capabilities
      };
    }

    if (forceMode === 'wasm') {
      if (!this.capabilities.wasmSupported) {
        throw new Error('强制WASM模式但环境不支持WebAssembly');
      }
      await this._initializeWasm(wasmPath);
      return {
        success: true,
        mode: 'wasm',
        capabilities: this.capabilities
      };
    }

    // 自动选择模式
    if (this.preferWasm && this.capabilities.wasmSupported) {
      try {
        await this._initializeWasm(wasmPath);
        console.log('🚀 使用 WASM 高性能模式');
        return {
          success: true,
          mode: 'wasm',
          capabilities: this.capabilities
        };
      } catch (error) {
        console.warn('⚠️ WASM 初始化失败，降级到 CryptoJS:', error.message);
      }
    }

    // 降级到 CryptoJS
    console.log('🔄 使用 CryptoJS 兼容模式');
    return {
      success: true,
      mode: 'fallback',
      capabilities: this.capabilities
    };
  }

  /**
   * 解密图片
   * @param {Uint8Array} encryptedData - 加密数据
   * @param {string} keyBase64 - Base64密钥
   * @param {string} ivBase64 - Base64 IV
   * @param {Object} options - 解密选项
   * @returns {Promise<Uint8Array>} 解密后的数据
   */
  async decryptImage(encryptedData, keyBase64, ivBase64, options = {}) {
    const {
      useChunked = false,
      progressCallback = null,
      timeout = 30000 // 30秒超时
    } = options;

    // 参数验证
    if (!encryptedData || !keyBase64 || !ivBase64) {
      throw new Error('缺少必要的解密参数');
    }

    // 设置超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('解密超时')), timeout);
    });

    try {
      let decryptPromise;

      if (this.wasmDecryptor) {
        // 使用 WASM 解密
        if (useChunked) {
          decryptPromise = this._decryptWithWasmChunked(
            encryptedData, keyBase64, ivBase64, progressCallback
          );
        } else {
          decryptPromise = this._decryptWithWasm(
            encryptedData, keyBase64, ivBase64
          );
        }
      } else {
        // 使用 CryptoJS 解密
        if (useChunked) {
          decryptPromise = this.fallbackDecryptor.decryptImageChunked(
            encryptedData, keyBase64, ivBase64, progressCallback
          );
        } else {
          decryptPromise = this.fallbackDecryptor.decryptImage(
            encryptedData, keyBase64, ivBase64
          );
        }
      }

      const result = await Promise.race([decryptPromise, timeoutPromise]);
      
      // 验证解密结果
      const verification = this.verifyDecryptedImage(result);
      if (!verification.isValid) {
        throw new Error('解密结果验证失败，可能是密钥错误或数据损坏');
      }

      return result;
    } catch (error) {
      // 如果WASM解密失败，尝试降级到CryptoJS
      if (this.wasmDecryptor && !error.message.includes('超时')) {
        console.warn('WASM解密失败，尝试CryptoJS降级:', error.message);
        try {
          return await this.fallbackDecryptor.decryptImage(
            encryptedData, keyBase64, ivBase64
          );
        } catch (fallbackError) {
          throw new Error(`解密失败: WASM(${error.message}) CryptoJS(${fallbackError.message})`);
        }
      }
      
      throw error;
    }
  }

  /**
   * 验证解密结果
   * @param {Uint8Array} decryptedData - 解密数据
   * @returns {Object} 验证结果
   */
  verifyDecryptedImage(decryptedData) {
    if (this.wasmDecryptor) {
      try {
        return this.wasmDecryptor.verify_decrypted_image(decryptedData);
      } catch (error) {
        console.warn('WASM验证失败，使用降级验证:', error);
      }
    }
    
    return this.fallbackDecryptor.verifyDecryptedImage(decryptedData);
  }

  /**
   * 获取当前解密模式
   * @returns {string} 'wasm' | 'fallback'
   */
  getCurrentMode() {
    return this.wasmDecryptor ? 'wasm' : 'fallback';
  }

  /**
   * 获取性能信息
   * @returns {Object} 性能统计
   */
  getPerformanceInfo() {
    const baseInfo = {
      currentMode: this.getCurrentMode(),
      capabilities: this.capabilities,
      wasmLoaded: !!this.wasmDecryptor
    };

    if (this.wasmDecryptor) {
      try {
        const wasmInfo = this.wasmDecryptor.get_performance_info();
        return { ...baseInfo, ...wasmInfo };
      } catch (error) {
        console.warn('获取WASM性能信息失败:', error);
      }
    }

    return {
      ...baseInfo,
      ...this.fallbackDecryptor.getPerformanceInfo()
    };
  }

  /**
   * 测试解密功能
   * @returns {Promise<Object>} 测试结果
   */
  async testDecryption() {
    const results = {
      wasm: null,
      fallback: null,
      currentMode: this.getCurrentMode()
    };

    // 测试当前模式
    if (this.wasmDecryptor) {
      try {
        // 简单的WASM测试
        const testData = new Uint8Array(16).fill(1);
        const testKey = 'dGVzdGtleTE2Ynl0ZXNsb25ndGVzdGtleTE2Ynl0ZXM='; // 32字节
        const testIv = 'dGVzdGl2MTZieXRlc2xvbmc='; // 16字节
        
        await this._decryptWithWasm(testData, testKey, testIv);
        results.wasm = { success: true };
      } catch (error) {
        results.wasm = { success: false, error: error.message };
      }
    }

    // 测试CryptoJS
    try {
      results.fallback = {
        success: await this.fallbackDecryptor.testDecryption()
      };
    } catch (error) {
      results.fallback = { success: false, error: error.message };
    }

    return results;
  }

  /**
   * 检测环境能力
   * @private
   */
  async _detectCapabilities() {
    const capabilities = {
      wasmSupported: wasmLoader.constructor.isWasmSupported(),
      simdSupported: false,
      cryptoJSAvailable: typeof CryptoFallback !== 'undefined',
      memoryInfo: this._getMemoryInfo()
    };

    if (capabilities.wasmSupported) {
      try {
        capabilities.simdSupported = await wasmLoader.constructor.isSIMDSupported();
      } catch (error) {
        console.warn('SIMD检测失败:', error);
      }
    }

    return capabilities;
  }

  /**
   * 初始化WASM
   * @private
   */
  async _initializeWasm(wasmPath) {
    const wasmModule = await wasmLoader.loadWasm(wasmPath);
    this.wasmDecryptor = new wasmModule.ImageDecryptor();
    
    // 根据设备性能调整分块大小
    const memInfo = this._getMemoryInfo();
    if (memInfo.deviceMemory && memInfo.deviceMemory <= 4) {
      // 低内存设备使用较小的分块
      this.wasmDecryptor.set_chunk_size(512 * 1024); // 512KB
    }
  }

  /**
   * WASM解密
   * @private
   */
  async _decryptWithWasm(encryptedData, keyBase64, ivBase64) {
    const uint8Array = new Uint8Array(encryptedData);
    const result = this.wasmDecryptor.decrypt_image(uint8Array, keyBase64, ivBase64);
    return new Uint8Array(result);
  }

  /**
   * WASM分块解密
   * @private
   */
  async _decryptWithWasmChunked(encryptedData, keyBase64, ivBase64, progressCallback) {
    const uint8Array = new Uint8Array(encryptedData);
    
    // 包装进度回调
    const wrappedCallback = progressCallback ? (progress) => {
      progressCallback(progress);
    } : null;
    
    const result = await this.wasmDecryptor.decrypt_image_chunked(
      uint8Array, keyBase64, ivBase64, wrappedCallback
    );
    
    return new Uint8Array(result);
  }

  /**
   * 获取内存信息
   * @private
   */
  _getMemoryInfo() {
    const info = {};
    
    // 尝试获取设备内存信息 (Device Memory API)
    if ('memory' in navigator && navigator.memory && 'deviceMemory' in navigator.memory) {
      info.deviceMemory = navigator.memory.deviceMemory;
    } else if ('deviceMemory' in navigator) {
      // 某些浏览器直接在 navigator 上暴露 deviceMemory
      info.deviceMemory = navigator.deviceMemory;
    } else {
      // 尝试通过其他方式估算内存
      try {
        // 通过 WebGL 上下文获取内存信息
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            // 简单的内存估算逻辑
            if (renderer.includes('4GB') || renderer.includes('4 GB')) {
              info.deviceMemory = 4;
            } else if (renderer.includes('8GB') || renderer.includes('8 GB')) {
              info.deviceMemory = 8;
            } else if (renderer.includes('16GB') || renderer.includes('16 GB')) {
              info.deviceMemory = 16;
            }
          }
        }
      } catch (e) {
        // WebGL 方法失败，尝试通过 JS 堆内存估算
        if (performance.memory && performance.memory.jsHeapSizeLimit) {
          const heapLimit = performance.memory.jsHeapSizeLimit;
          // 根据 JS 堆限制估算设备内存 (粗略估算)
          if (heapLimit > 4 * 1024 * 1024 * 1024) { // > 4GB
            info.deviceMemory = Math.ceil(heapLimit / (1024 * 1024 * 1024));
          } else if (heapLimit > 2 * 1024 * 1024 * 1024) { // > 2GB
            info.deviceMemory = 4;
          } else if (heapLimit > 1 * 1024 * 1024 * 1024) { // > 1GB
            info.deviceMemory = 2;
          } else {
            info.deviceMemory = 1;
          }
        }
      }
    }
    
    if ('hardwareConcurrency' in navigator) {
      info.cores = navigator.hardwareConcurrency;
    }
    
    if (performance.memory) {
      info.jsHeapSizeLimit = performance.memory.jsHeapSizeLimit;
      info.totalJSHeapSize = performance.memory.totalJSHeapSize;
      info.usedJSHeapSize = performance.memory.usedJSHeapSize;
    }
    
    return info;
  }

  /**
   * 清理资源
   */
  dispose() {
    if (this.wasmDecryptor) {
      // WASM对象通常由垃圾回收器处理
      this.wasmDecryptor = null;
    }
    
    wasmLoader.unloadWasm();
  }
}

export default ImageDecryptor;