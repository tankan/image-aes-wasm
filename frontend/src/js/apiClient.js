/**
 * API 客户端
 * 处理与后端服务的所有通信
 */
class ApiClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL || this._getDefaultBaseURL();
    this.timeout = 30000; // 30秒超时
    this.retryCount = 3;
    this.retryDelay = 1000; // 1秒
  }

  /**
   * 上传并加密图片
   * @param {File} file - 图片文件
   * @param {string} userId - 用户ID
   * @param {Function} progressCallback - 进度回调
   * @returns {Promise<Object>} 上传结果
   */
  async encryptImage(file, userId, progressCallback = null) {
    const formData = new FormData();
    formData.append('image', file);
    if (userId) {
      formData.append('userId', userId);
    }

    return this._requestWithProgress(
      '/api/encrypt-image',
      {
        method: 'POST',
        body: formData
      },
      progressCallback
    );
  }

  /**
   * 获取解密密钥
   * @param {string} imageId - 图片ID
   * @param {string} token - 访问令牌
   * @param {string} userId - 用户ID
   * @returns {Promise<Object>} 密钥信息
   */
  async getDecryptionKey(imageId, token, userId) {
    const params = new URLSearchParams({
      token,
      userId
    });

    return this._request(`/api/get-key/${imageId}?${params}`);
  }

  /**
   * 下载加密图片
   * @param {string} imageId - 图片ID
   * @param {string} token - 访问令牌
   * @param {string} userId - 用户ID
   * @param {Function} progressCallback - 进度回调
   * @returns {Promise<Uint8Array>} 加密的图片数据
   */
  async downloadEncryptedImage(imageId, token, userId, progressCallback = null) {
    const params = new URLSearchParams({
      token,
      userId
    });

    const response = await this._requestRaw(
      `/api/download-image/${imageId}?${params}`,
      { method: 'GET' },
      progressCallback
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`下载失败: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * 验证密钥访问权限
   * @param {string} imageId - 图片ID
   * @param {string} keyToken - 密钥令牌
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 验证结果
   */
  async verifyKeyAccess(imageId, keyToken, sessionId) {
    const params = new URLSearchParams({
      keyToken,
      sessionId
    });

    return this._request(`/api/verify-key/${imageId}?${params}`);
  }

  /**
   * 获取用户图片列表
   * @param {string} userId - 用户ID
   * @param {string} token - 访问令牌
   * @returns {Promise<Object>} 图片列表
   */
  async getUserImages(userId, token) {
    const params = new URLSearchParams({ userId });
    
    return this._request(`/api/images?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }

  /**
   * 获取图片信息
   * @param {string} imageId - 图片ID
   * @param {string} userId - 用户ID（可选）
   * @returns {Promise<Object>} 图片信息
   */
  async getImageInfo(imageId, userId = null) {
    const params = userId ? new URLSearchParams({ userId }) : '';
    const url = `/api/image-info/${imageId}${params ? '?' + params : ''}`;
    
    return this._request(url);
  }

  /**
   * 删除图片
   * @param {string} imageId - 图片ID
   * @param {string} token - 访问令牌
   * @returns {Promise<Object>} 删除结果
   */
  async deleteImage(imageId, token) {
    return this._request(`/api/image/${imageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }

  /**
   * 生成一次性访问令牌
   * @param {string} imageId - 图片ID
   * @param {string} token - 访问令牌
   * @param {number} expiresIn - 过期时间（秒）
   * @returns {Promise<Object>} 一次性令牌
   */
  async generateOneTimeToken(imageId, token, expiresIn = 300) {
    return this._request(`/api/one-time-token/${imageId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expiresIn })
    });
  }

  /**
   * 健康检查
   * @returns {Promise<Object>} 服务状态
   */
  async healthCheck() {
    return this._request('/api/health');
  }

  /**
   * 通用请求方法
   * @private
   */
  async _request(url, options = {}, retryCount = this.retryCount) {
    const response = await this._requestRaw(url, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: '未知错误' }));
      
      // 如果是网络错误且还有重试次数，则重试
      if (response.status >= 500 && retryCount > 0) {
        console.warn(`请求失败，${this.retryDelay}ms后重试...`, errorData);
        await this._sleep(this.retryDelay);
        return this._request(url, options, retryCount - 1);
      }
      
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * 原始请求方法
   * @private
   */
  async _requestRaw(url, options = {}, progressCallback = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const fullURL = this.baseURL + url;
      const requestOptions = {
        ...options,
        signal: controller.signal,
        headers: {
          ...options.headers
        }
      };

      // 如果不是FormData，设置Content-Type
      if (!(options.body instanceof FormData) && options.body && !requestOptions.headers['Content-Type']) {
        requestOptions.headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(fullURL, requestOptions);
      
      // 处理进度回调
      if (progressCallback && response.body) {
        return this._handleResponseProgress(response, progressCallback);
      }
      
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 带进度的请求
   * @private
   */
  async _requestWithProgress(url, options = {}, progressCallback = null) {
    if (!progressCallback) {
      return this._request(url, options);
    }

    // 上传进度处理
    if (options.body instanceof FormData) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            progressCallback(progress);
          }
        });

        xhr.addEventListener('load', () => {
          try {
            if (xhr.responseText) {
              const response = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(response);
              } else {
                reject(new Error(response.error || `HTTP ${xhr.status}`));
              }
            } else {
              // 处理空响应的情况
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ success: true });
              } else {
                reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
              }
            }
          } catch (error) {
            reject(new Error(`响应解析失败: ${xhr.responseText || 'Empty response'}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('网络错误'));
        });

        xhr.addEventListener('timeout', () => {
          reject(new Error('请求超时'));
        });

        xhr.timeout = this.timeout;
        xhr.open(options.method || 'GET', this.baseURL + url);
        
        // 设置请求头（除了Content-Type，让浏览器自动设置）
        if (options.headers) {
          Object.entries(options.headers).forEach(([key, value]) => {
            if (key.toLowerCase() !== 'content-type') {
              xhr.setRequestHeader(key, value);
            }
          });
        }
        
        xhr.send(options.body);
      });
    }

    return this._request(url, options);
  }

  /**
   * 处理响应进度
   * @private
   */
  async _handleResponseProgress(response, progressCallback) {
    const contentLength = response.headers.get('Content-Length');
    if (!contentLength) {
      return response;
    }

    const total = parseInt(contentLength, 10);
    let loaded = 0;

    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      loaded += value.length;
      
      const progress = (loaded / total) * 100;
      progressCallback(progress);
    }

    // 重新构造响应
    const allChunks = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return new Response(allChunks, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  /**
   * 获取默认基础URL
   * @private
   */
  _getDefaultBaseURL() {
    if (typeof window !== 'undefined') {
      // 前端运行在5173端口，后端运行在3000端口
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      return `${protocol}//${hostname}:3000`;
    }
    return 'http://localhost:3000';
  }

  /**
   * 延时函数
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 设置超时时间
   * @param {number} timeout - 超时时间（毫秒）
   */
  setTimeout(timeout) {
    this.timeout = timeout;
  }

  /**
   * 设置重试配置
   * @param {number} count - 重试次数
   * @param {number} delay - 重试延时（毫秒）
   */
  setRetryConfig(count, delay) {
    this.retryCount = count;
    this.retryDelay = delay;
  }

  /**
   * 设置基础URL
   * @param {string} baseURL - 基础URL
   */
  setBaseURL(baseURL) {
    this.baseURL = baseURL;
  }
}

export default ApiClient;