import wasmLoader from './wasmLoader.js';
import { globalErrorHandler, AppError, ErrorTypes, ErrorSeverity } from './errorHandler.js';
import CryptoFallback from './cryptoFallback.js';
import CryptoOptimized from './cryptoOptimized.js';
import { getConfig } from './config.js';

/**
 * 图片解密器
 * 自动选择最佳解密方案（WASM 或 CryptoJS）
 */
class ImageDecryptor {
  constructor() {
    this.wasmDecryptor = null;
    this.fallbackDecryptor = new CryptoFallback();
    this.optimizedDecryptor = new CryptoOptimized();
    this.preferWasm = true;
    this.useOptimizedCrypto = true; // 默认使用优化版
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
   * 解密图片数据
   * 统一的解密接口，自动选择最优的解密方式
   * @param {Uint8Array} encryptedData - 加密的数据
   * @param {string} keyBase64 - Base64编码的密钥
   * @param {string} ivBase64 - Base64编码的IV
   * @param {Object} options - 解密选项
   * @param {Function} options.progressCallback - 进度回调函数
   * @param {number} options.timeout - 超时时间（毫秒）
   * @returns {Promise<Uint8Array>} 解密后的数据
   */
  async decryptImage(encryptedData, keyBase64, ivBase64, options = {}) {
    const {
      progressCallback,
      timeout = getConfig('decryption.timeout', 30000) // 从配置获取超时时间
    } = options;

    // 参数验证
    if (!encryptedData || !keyBase64 || !ivBase64) {
      throw new AppError(
        '缺少必要的解密参数',
        ErrorTypes.VALIDATION_FAILED,
        ErrorSeverity.HIGH
      );
    }

    // 使用智能降级处理
    return await globalErrorHandler.handleWithFallback(
      // 主要操作：WASM解密
      async () => {
        if (!this.wasmDecryptor) {
          throw new AppError(
            'WASM解密器未初始化',
            ErrorTypes.WASM_INIT_FAILED,
            ErrorSeverity.HIGH
          );
        }

        let result;
        if (progressCallback) {
          result = await this._decryptWithWasmProgressive(
            encryptedData, keyBase64, ivBase64, progressCallback
          );
        } else {
          result = await this._decryptWithWasm(
            encryptedData, keyBase64, ivBase64
          );
        }

        // 验证解密结果
        if (!result || result.length === 0) {
          throw new AppError(
            'Decryption result is empty',
            ErrorTypes.DECRYPTION_FAILED,
            ErrorSeverity.HIGH,
            { 
              originalSize: encryptedData.length,
              resultSize: result?.length || 0,
              minExpectedSize: getConfig('decryption.minResultSize', 100) // 从配置获取最小期望大小
            }
          );
        }
        
        const verification = this.verifyDecryptedImage(result);
        if (!verification.isValid) {
          throw new AppError(
            '解密结果验证失败，可能是密钥错误或数据损坏',
            ErrorTypes.VALIDATION_FAILED,
            ErrorSeverity.HIGH
          );
        }

        return result;
      },
      // 降级操作：优化版CryptoJS解密
      async () => {
        console.warn('使用优化版CryptoJS降级解密');
        const cryptoDecryptor = this.useOptimizedCrypto ? 
          this.optimizedDecryptor : this.fallbackDecryptor;
          
        let result;
        if (progressCallback) {
          if (this.useOptimizedCrypto) {
            result = await cryptoDecryptor.decryptImageProgressive(
              encryptedData, keyBase64, ivBase64, progressCallback
            );
          } else {
            result = await this.fallbackDecryptor.decryptImageProgressive(
              encryptedData, keyBase64, ivBase64, progressCallback
            );
          }
        } else {
          result = await cryptoDecryptor.decryptImage(
            encryptedData, keyBase64, ivBase64
          );
        }

        // 验证解密结果
        const verification = this.verifyDecryptedImage(result);
        if (!verification.isValid) {
          throw new AppError(
            '降级解密结果验证失败',
            ErrorTypes.VALIDATION_FAILED,
            ErrorSeverity.HIGH
          );
        }

        return result;
      },
      {
        operation: 'decryptImage',
        dataSize: encryptedData.length,
        hasProgressCallback: !!progressCallback
      }
    );
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
    
    // 降级验证逻辑
    const minSize = getConfig('decryption.minResultSize', 100); // 从配置获取最小大小
    const maxSize = getConfig('decryption.maxResultSize', 50 * 1024 * 1024); // 从配置获取最大大小（50MB）
    
    if (!decryptedData || decryptedData.length < minSize) {
      return { isValid: false, reason: `数据太小，小于${minSize}字节` };
    }
    
    if (decryptedData.length > maxSize) {
      return { isValid: false, reason: `数据太大，超过${maxSize}字节` };
    }
    
    return { isValid: true };
  }

  /**
   * 获取当前解密模式
   * @returns {string} 'wasm' | 'fallback'
   */
  getCurrentMode() {
    if (this.wasmDecryptor) {
      return 'wasm';
    } else if (this.useOptimizedCrypto) {
      return 'optimized-crypto';
    } else {
      return 'fallback';
    }
  }

  /**
   * 获取性能信息
   * @returns {Object} 性能统计
   */
  getPerformanceInfo() {
    const info = {
      currentMode: this.getCurrentMode(),
      wasmAvailable: !!this.wasmDecryptor,
      optimizedCryptoEnabled: this.useOptimizedCrypto,
      capabilities: this.capabilities,
      memory: this._getMemoryInfo()
    };

    // 添加优化版CryptoJS的性能信息
    if (this.useOptimizedCrypto) {
      info.optimizedCryptoInfo = this.optimizedDecryptor.getPerformanceInfo();
    }

    // 添加降级解密器信息
    if (this.fallbackDecryptor.getPerformanceInfo) {
      info.fallbackInfo = this.fallbackDecryptor.getPerformanceInfo();
    }

    return info;
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
        // 简单的WASM测试 - 使用随机生成的测试密钥
        const testData = new Uint8Array(16).fill(1);
        
        // 生成随机测试密钥和IV
        const testKeyBytes = new Uint8Array(32);
        const testIvBytes = new Uint8Array(16);
        crypto.getRandomValues(testKeyBytes);
        crypto.getRandomValues(testIvBytes);
        
        const testKey = btoa(String.fromCharCode(...testKeyBytes));
        const testIv = btoa(String.fromCharCode(...testIvBytes));
        
        await this._decryptWithWasm(testData, testKey, testIv);
        results.wasm = { success: true };
      } catch (error) {
        results.wasm = { success: false, error: error.message };
      }
    }

    // 测试优化版CryptoJS
    if (this.useOptimizedCrypto) {
      try {
        results.optimizedCrypto = {
          success: await this.optimizedDecryptor.testDecryption()
        };
      } catch (error) {
        results.optimizedCrypto = { success: false, error: error.message };
      }
    }

    // 测试标准CryptoJS
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
    if (!this.wasmDecryptor) {
      throw new AppError(
        'WASM解密器未初始化',
        ErrorTypes.WASM_NOT_INITIALIZED,
        ErrorSeverity.HIGH
      );
    }

    // 统一的输入验证
    this._validateDecryptionInputs(encryptedData, keyBase64, ivBase64);

    try {
      const uint8Array = new Uint8Array(encryptedData);
      const result = this.wasmDecryptor.decrypt_image(uint8Array, keyBase64, ivBase64);
      
      if (!result) {
        throw new AppError(
          'WASM解密返回空结果',
          ErrorTypes.WASM_EXECUTION_FAILED,
          ErrorSeverity.HIGH
        );
      }
      
      return new Uint8Array(result);
    } catch (error) {
      // 统一错误处理
      const errorMessage = this._normalizeErrorMessage(error);
      throw new AppError(
        `WASM解密失败: ${errorMessage}`,
        ErrorTypes.WASM_EXECUTION_FAILED,
        ErrorSeverity.HIGH,
        error
      );
    }
  }

  /**
   * 使用WASM进行渐进式解密（带进度回调）
   * @private
   */
  async _decryptWithWasmProgressive(encryptedData, keyBase64, ivBase64, progressCallback) {
    // 统一的输入验证
    this._validateDecryptionInputs(encryptedData, keyBase64, ivBase64);

    try {
      // 初始进度
      if (progressCallback) progressCallback(0);
      
      // 使用优化的WASM解密
      const result = await this.wasmDecryptor.decrypt_image_optimized(
        encryptedData, keyBase64, ivBase64
      );
      
      // 完成进度
      if (progressCallback) progressCallback(100);
      
      return result;
    } catch (error) {
      // 统一错误处理
      const errorMessage = this._normalizeErrorMessage(error);
      throw new AppError(
        `WASM渐进式解密失败: ${errorMessage}`,
        ErrorTypes.WASM_EXECUTION_FAILED,
        ErrorSeverity.HIGH,
        error
      );
    }
  }

  /**
   * 统一输入验证
   * @private
   */
  _validateDecryptionInputs(encryptedData, keyBase64, ivBase64) {
    if (!encryptedData || encryptedData.length === 0) {
      throw new AppError(
        '加密数据不能为空',
        ErrorTypes.INVALID_INPUT,
        ErrorSeverity.MEDIUM
      );
    }

    if (!keyBase64 || keyBase64.trim() === '') {
      throw new AppError(
        '密钥不能为空',
        ErrorTypes.INVALID_INPUT,
        ErrorSeverity.MEDIUM
      );
    }

    if (!ivBase64 || ivBase64.trim() === '') {
      throw new AppError(
        'IV不能为空',
        ErrorTypes.INVALID_INPUT,
        ErrorSeverity.MEDIUM
      );
    }

    // 验证Base64格式
    try {
      const keyBytes = atob(keyBase64);
      if (keyBytes.length !== 32) {
        throw new AppError(
          `密钥长度必须为32字节，当前为${keyBytes.length}字节`,
          ErrorTypes.INVALID_INPUT,
          ErrorSeverity.MEDIUM
        );
      }
    } catch (e) {
      throw new AppError(
        '密钥Base64格式无效',
        ErrorTypes.INVALID_INPUT,
        ErrorSeverity.MEDIUM
      );
    }

    try {
      const ivBytes = atob(ivBase64);
      if (ivBytes.length !== 16) {
        throw new AppError(
          `IV长度必须为16字节，当前为${ivBytes.length}字节`,
          ErrorTypes.INVALID_INPUT,
          ErrorSeverity.MEDIUM
        );
      }
    } catch (e) {
      throw new AppError(
        'IV Base64格式无效',
        ErrorTypes.INVALID_INPUT,
        ErrorSeverity.MEDIUM
      );
    }

    // 验证加密数据长度（必须是16字节的倍数）
    if (encryptedData.length % 16 !== 0) {
      throw new AppError(
        '加密数据长度必须是16字节的倍数',
        ErrorTypes.INVALID_INPUT,
        ErrorSeverity.MEDIUM
      );
    }
  }

  /**
   * 标准化错误消息
   * @private
   */
  _normalizeErrorMessage(error) {
    if (!error) return '未知错误';
    
    // 如果错误消息为undefined或空，提供默认消息
    if (!error.message || error.message === 'undefined') {
      if (error.toString && error.toString() !== '[object Object]') {
        return error.toString();
      }
      return '解密过程中发生未知错误';
    }
    
    return error.message;
  }

  /**
   * 检查是否为超时错误
   * @private
   */
  _isTimeoutError(error) {
    return error.message.includes('超时') || 
           error.message.includes('timeout') ||
           error.name === 'TimeoutError';
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
    
    // 清理优化版CryptoJS的缓存
    if (this.optimizedDecryptor) {
      this.optimizedDecryptor.cleanup();
    }
    
    wasmLoader.unloadWasm();
  }
}

export default ImageDecryptor;