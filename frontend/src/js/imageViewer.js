import ImageDecryptor from './imageDecryptor.js';
import CanvasRenderer from './canvasRenderer.js';
import ApiClient from './apiClient.js';

/**
 * 图片查看器
 * 整合解密、渲染和API通信功能的主要组件
 */
class ImageViewer {
  constructor(options = {}) {
    const {
      apiBaseURL = '',
      canvasSelector = '#imageCanvas',
      wasmPath = '/wasm/image_aes_wasm.js',
      enableWatermark = true,
      enableProtection = true,
      maxRetries = 3
    } = options;

    this.decryptor = new ImageDecryptor();
    this.renderer = new CanvasRenderer();
    this.apiClient = new ApiClient(apiBaseURL);
    
    this.canvasSelector = canvasSelector;
    this.wasmPath = wasmPath;
    this.enableWatermark = enableWatermark;
    this.enableProtection = enableProtection;
    this.maxRetries = maxRetries;
    
    this.isInitialized = false;
    this.currentImageId = null;
    this.currentUserId = null;
    this.currentToken = null;
    
    // 事件监听器
    this.eventListeners = new Map();
  }

  /**
   * 初始化查看器
   * @param {Object} options - 初始化选项
   * @returns {Promise<Object>} 初始化结果
   */
  async initialize(options = {}) {
    try {
      // 初始化解密器
      const decryptorResult = await this.decryptor.initialize({
        wasmPath: this.wasmPath,
        ...options.decryptor
      });

      // 初始化渲染器
      this.renderer.initialize(this.canvasSelector, {
        watermark: this.enableWatermark,
        protection: this.enableProtection,
        ...options.renderer
      });

      this.isInitialized = true;

      const result = {
        success: true,
        decryptorMode: decryptorResult.mode,
        capabilities: decryptorResult.capabilities,
        renderInfo: this.renderer.getRenderInfo()
      };

      this._emit('initialized', result);
      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message
      };
      
      this._emit('error', errorResult);
      throw error;
    }
  }

  /**
   * 加载并显示图片
   * @param {string} imageId - 图片ID
   * @param {string} token - 访问令牌
   * @param {string} userId - 用户ID
   * @param {Object} options - 加载选项
   * @returns {Promise<Object>} 加载结果
   */
  async loadImage(imageId, token, userId, options = {}) {
    if (!this.isInitialized) {
      throw new Error('查看器未初始化');
    }

    const {
      useChunked = false,
      renderOptions = {},
      timeout = 30000
    } = options;

    this.currentImageId = imageId;
    this.currentToken = token;
    this.currentUserId = userId;

    try {
      this._emit('loadStart', { imageId, userId });

      // 1. 获取解密密钥
      this._emit('progress', { stage: 'key', progress: 0 });
      const keyResult = await this.apiClient.getDecryptionKey(imageId, token, userId);
      
      if (!keyResult.success) {
        throw new Error(keyResult.error || '获取密钥失败');
      }

      this._emit('progress', { stage: 'key', progress: 100 });

      // 2. 下载加密图片
      this._emit('progress', { stage: 'download', progress: 0 });
      const encryptedData = await this.apiClient.downloadEncryptedImage(
        imageId, 
        token, 
        userId,
        (progress) => this._emit('progress', { stage: 'download', progress })
      );

      // 3. 解密图片
      this._emit('progress', { stage: 'decrypt', progress: 0 });
      const decryptedData = await this.decryptor.decryptImage(
        encryptedData,
        keyResult.data.key,
        keyResult.data.iv,
        {
          useChunked,
          progressCallback: (progress) => this._emit('progress', { stage: 'decrypt', progress }),
          timeout
        }
      );

      // 4. 渲染图片
      this._emit('progress', { stage: 'render', progress: 0 });
      const renderResult = await this.renderer.renderImage(decryptedData, renderOptions);
      this._emit('progress', { stage: 'render', progress: 100 });

      const result = {
        success: true,
        imageId,
        renderResult,
        decryptorMode: this.decryptor.getCurrentMode(),
        keyInfo: {
          sessionId: keyResult.data.sessionId,
          expiresIn: keyResult.data.expiresIn
        }
      };

      this._emit('loadComplete', result);
      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        imageId,
        error: error.message
      };
      
      this._emit('loadError', errorResult);
      throw error;
    }
  }

  /**
   * 上传并加密图片
   * @param {File} file - 图片文件
   * @param {string} userId - 用户ID
   * @param {Object} options - 上传选项
   * @returns {Promise<Object>} 上传结果
   */
  async uploadImage(file, userId, options = {}) {
    const {
      autoLoad = true,
      renderOptions = {}
    } = options;

    try {
      this._emit('uploadStart', { fileName: file.name, fileSize: file.size });

      // 上传并加密
      const uploadResult = await this.apiClient.encryptImage(
        file,
        userId,
        (progress) => this._emit('progress', { stage: 'upload', progress })
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || '上传失败');
      }

      const result = {
        success: true,
        imageId: uploadResult.data.imageId,
        accessToken: uploadResult.data.accessToken,
        metadata: uploadResult.data.metadata
      };

      this._emit('uploadComplete', result);

      // 自动加载显示
      if (autoLoad) {
        await this.loadImage(
          result.imageId,
          result.accessToken,
          userId,
          { renderOptions }
        );
      }

      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message
      };
      
      this._emit('uploadError', errorResult);
      throw error;
    }
  }

  /**
   * 获取图片信息
   * @param {string} imageId - 图片ID
   * @param {string} userId - 用户ID（可选）
   * @returns {Promise<Object>} 图片信息
   */
  async getImageInfo(imageId, userId = null) {
    try {
      const result = await this.apiClient.getImageInfo(imageId, userId);
      this._emit('infoLoaded', result);
      return result;
    } catch (error) {
      this._emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取用户图片列表
   * @param {string} userId - 用户ID
   * @param {string} token - 访问令牌
   * @returns {Promise<Object>} 图片列表
   */
  async getUserImages(userId, token) {
    try {
      const result = await this.apiClient.getUserImages(userId, token);
      this._emit('imagesLoaded', result);
      return result;
    } catch (error) {
      this._emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * 删除图片
   * @param {string} imageId - 图片ID
   * @param {string} token - 访问令牌
   * @returns {Promise<Object>} 删除结果
   */
  async deleteImage(imageId, token) {
    try {
      const result = await this.apiClient.deleteImage(imageId, token);
      this._emit('imageDeleted', { imageId, result });
      return result;
    } catch (error) {
      this._emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取性能信息
   * @returns {Object} 性能统计
   */
  getPerformanceInfo() {
    return {
      decryptor: this.decryptor.getPerformanceInfo(),
      renderer: this.renderer.getRenderInfo(),
      currentImage: {
        imageId: this.currentImageId,
        userId: this.currentUserId
      }
    };
  }

  /**
   * 测试系统功能
   * @returns {Promise<Object>} 测试结果
   */
  async testSystem() {
    try {
      const results = {
        api: null,
        decryptor: null,
        renderer: null
      };

      // 测试API连接
      try {
        await this.apiClient.healthCheck();
        results.api = { success: true };
      } catch (error) {
        results.api = { success: false, error: error.message };
      }

      // 测试解密器
      results.decryptor = await this.decryptor.testDecryption();

      // 测试渲染器
      results.renderer = {
        success: !!this.renderer.canvas,
        info: this.renderer.getRenderInfo()
      };

      this._emit('testComplete', results);
      return results;
    } catch (error) {
      this._emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * 添加事件监听器
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * 移除事件监听器
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   * @private
   */
  _emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`事件回调错误 (${event}):`, error);
        }
      });
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    this.decryptor.dispose();
    this.renderer.dispose();
    this.eventListeners.clear();
    
    this.isInitialized = false;
    this.currentImageId = null;
    this.currentUserId = null;
    this.currentToken = null;
  }

  /**
   * 获取当前状态
   */
  getState() {
    return {
      initialized: this.isInitialized,
      currentImage: {
        imageId: this.currentImageId,
        userId: this.currentUserId,
        hasToken: !!this.currentToken
      },
      decryptorMode: this.decryptor.getCurrentMode(),
      performance: this.getPerformanceInfo()
    };
  }
}

export default ImageViewer;