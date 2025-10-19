/**
 * 应用配置管理系统
 * 统一管理所有硬编码值和配置项
 */

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  // WASM相关配置
  wasm: {
    // WASM文件路径
    scriptPath: '/wasm/image_aes_wasm.js',
    wasmPath: '/wasm/image_aes_wasm_bg.wasm',
    
    // 加载超时时间（毫秒）
    loadTimeout: 30000,
    
    // 是否启用SIMD优化
    enableSIMD: true,
    
    // 内存限制（字节）
    memoryLimit: 100 * 1024 * 1024, // 100MB
    
    // 是否自动清理内存
    autoCleanup: true
  },

  // 解密相关配置
  decryption: {
    // 默认超时时间（毫秒）
    timeout: 30000,
    
    // 分块大小（字节）
    chunkSize: 1024 * 1024, // 1MB
    
    // 最大文件大小（字节）
    maxFileSize: 50 * 1024 * 1024, // 50MB
    
    // 是否启用进度回调
    enableProgress: true,
    
    // 进度更新间隔（毫秒）
    progressInterval: 100,
    
    // 是否启用智能降级
    enableFallback: true,
    
    // 验证解密结果
    verifyResult: true
  },

  // 渲染相关配置
  rendering: {
    // Canvas最大尺寸
    maxCanvasSize: 4096,
    
    // 默认背景色
    backgroundColor: '#f0f0f0',
    
    // 网格颜色
    gridColor: '#e0e0e0',
    
    // 网格大小
    gridSize: 20,
    
    // 是否显示网格
    showGrid: true,
    
    // 缩放限制
    minZoom: 0.1,
    maxZoom: 10.0,
    
    // 默认缩放
    defaultZoom: 1.0,
    
    // 平滑缩放
    smoothZoom: true
  },

  // 网络相关配置
  network: {
    // 请求超时时间（毫秒）
    timeout: 10000,
    
    // 重试次数
    retryCount: 3,
    
    // 重试间隔（毫秒）
    retryDelay: 1000,
    
    // 并发请求限制
    maxConcurrentRequests: 5
  },

  // UI相关配置
  ui: {
    // 动画持续时间（毫秒）
    animationDuration: 300,
    
    // 通知显示时间（毫秒）
    notificationDuration: 3000,
    
    // 主题
    theme: 'light',
    
    // 语言
    language: 'zh-CN',
    
    // 字体大小
    fontSize: 14,
    
    // 是否启用键盘快捷键
    enableKeyboardShortcuts: true
  },

  // 性能相关配置
  performance: {
    // 是否启用性能监控
    enableMonitoring: false,
    
    // 性能数据采样率
    samplingRate: 0.1,
    
    // 内存使用警告阈值（字节）
    memoryWarningThreshold: 80 * 1024 * 1024, // 80MB
    
    // 是否启用Web Workers
    enableWebWorkers: true,
    
    // Worker池大小
    workerPoolSize: 2
  },

  // 调试相关配置
  debug: {
    // 是否启用调试模式
    enabled: false,
    
    // 日志级别 (error, warn, info, debug)
    logLevel: 'info',
    
    // 是否显示性能信息
    showPerformanceInfo: false,
    
    // 是否保存错误日志
    saveErrorLogs: true,
    
    // 错误日志最大条数
    maxErrorLogs: 100
  },

  // 安全相关配置
  security: {
    // 是否验证文件类型
    validateFileType: true,
    
    // 允许的文件类型
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    
    // 最大上传文件大小（字节）
    maxUploadSize: 10 * 1024 * 1024, // 10MB
    
    // 是否启用内容安全策略
    enableCSP: true
  }
};

/**
 * 配置管理器类
 */
class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.listeners = [];
    this.loadUserConfig();
  }

  /**
   * 获取配置值
   * @param {string} path - 配置路径，使用点号分隔，如 'wasm.timeout'
   * @param {*} defaultValue - 默认值
   * @returns {*} 配置值
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  /**
   * 设置配置值
   * @param {string} path - 配置路径
   * @param {*} value - 配置值
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;
    
    // 创建嵌套对象路径
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    const oldValue = target[lastKey];
    target[lastKey] = value;
    
    // 通知监听器
    this.notifyListeners(path, value, oldValue);
    
    // 保存到本地存储
    this.saveUserConfig();
  }

  /**
   * 批量设置配置
   * @param {Object} config - 配置对象
   */
  setMultiple(config) {
    const changes = [];
    
    const setRecursive = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          setRecursive(value, path);
        } else {
          const oldValue = this.get(path);
          if (oldValue !== value) {
            changes.push({ path, value, oldValue });
          }
        }
      }
    };
    
    setRecursive(config);
    
    // 合并配置
    this.config = this.deepMerge(this.config, config);
    
    // 通知所有变更
    changes.forEach(({ path, value, oldValue }) => {
      this.notifyListeners(path, value, oldValue);
    });
    
    // 保存到本地存储
    this.saveUserConfig();
  }

  /**
   * 重置配置为默认值
   * @param {string} path - 配置路径，如果不提供则重置所有配置
   */
  reset(path = null) {
    if (path) {
      const defaultValue = this.getDefaultValue(path);
      this.set(path, defaultValue);
    } else {
      this.config = { ...DEFAULT_CONFIG };
      this.saveUserConfig();
      this.notifyListeners('*', this.config, null);
    }
  }

  /**
   * 获取默认配置值
   * @param {string} path - 配置路径
   * @returns {*} 默认值
   */
  getDefaultValue(path) {
    const keys = path.split('.');
    let value = DEFAULT_CONFIG;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * 添加配置变更监听器
   * @param {Function} listener - 监听器函数
   */
  addListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * 移除配置变更监听器
   * @param {Function} listener - 监听器函数
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 获取完整配置对象
   * @returns {Object} 配置对象
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 验证配置值
   * @param {string} path - 配置路径
   * @param {*} value - 配置值
   * @returns {boolean} 是否有效
   */
  validate(path, value) {
    // 基本类型检查
    const defaultValue = this.getDefaultValue(path);
    if (defaultValue !== undefined && typeof value !== typeof defaultValue) {
      return false;
    }

    // 特定配置的验证规则
    switch (path) {
      case 'wasm.loadTimeout':
      case 'decryption.timeout':
      case 'network.timeout':
        return typeof value === 'number' && value > 0 && value <= 300000; // 最大5分钟
      
      case 'decryption.chunkSize':
        return typeof value === 'number' && value >= 1024 && value <= 10 * 1024 * 1024; // 1KB-10MB
      
      case 'rendering.minZoom':
        return typeof value === 'number' && value > 0 && value <= 1;
      
      case 'rendering.maxZoom':
        return typeof value === 'number' && value >= 1 && value <= 50;
      
      case 'debug.logLevel':
        return ['error', 'warn', 'info', 'debug'].includes(value);
      
      case 'ui.theme':
        return ['light', 'dark', 'auto'].includes(value);
      
      default:
        return true;
    }
  }

  /**
   * 从本地存储加载用户配置
   * @private
   */
  loadUserConfig() {
    try {
      const stored = localStorage.getItem('app-config');
      if (stored) {
        const userConfig = JSON.parse(stored);
        this.config = this.deepMerge(this.config, userConfig);
      }
    } catch (error) {
      console.warn('加载用户配置失败:', error);
    }
  }

  /**
   * 保存用户配置到本地存储
   * @private
   */
  saveUserConfig() {
    try {
      // 只保存与默认配置不同的值
      const userConfig = this.getDifferences(this.config, DEFAULT_CONFIG);
      localStorage.setItem('app-config', JSON.stringify(userConfig));
    } catch (error) {
      console.warn('保存用户配置失败:', error);
    }
  }

  /**
   * 通知配置变更监听器
   * @private
   */
  notifyListeners(path, newValue, oldValue) {
    this.listeners.forEach(listener => {
      try {
        listener(path, newValue, oldValue);
      } catch (error) {
        console.error('配置监听器执行失败:', error);
      }
    });
  }

  /**
   * 深度合并对象
   * @private
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * 获取两个对象的差异
   * @private
   */
  getDifferences(obj1, obj2) {
    const differences = {};
    
    const compare = (o1, o2, path = '') => {
      for (const key in o1) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (!(key in o2)) {
          // 新增的键
          if (path) {
            if (!differences[path.split('.')[0]]) differences[path.split('.')[0]] = {};
            this.setNestedValue(differences, currentPath, o1[key]);
          } else {
            differences[key] = o1[key];
          }
        } else if (o1[key] && typeof o1[key] === 'object' && !Array.isArray(o1[key])) {
          // 递归比较对象
          compare(o1[key], o2[key], currentPath);
        } else if (o1[key] !== o2[key]) {
          // 值不同
          if (path) {
            if (!differences[path.split('.')[0]]) differences[path.split('.')[0]] = {};
            this.setNestedValue(differences, currentPath, o1[key]);
          } else {
            differences[key] = o1[key];
          }
        }
      }
    };
    
    compare(obj1, obj2);
    return differences;
  }

  /**
   * 设置嵌套对象的值
   * @private
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = obj;
    
    for (const key of keys) {
      if (!target[key]) target[key] = {};
      target = target[key];
    }
    
    target[lastKey] = value;
  }
}

// 创建全局配置管理器实例
export const config = new ConfigManager();

// 导出配置相关的工具函数
export const getConfig = (path, defaultValue) => config.get(path, defaultValue);
export const setConfig = (path, value) => config.set(path, value);
export const resetConfig = (path) => config.reset(path);

// 导出默认配置
export { DEFAULT_CONFIG };

// 导出配置管理器类
export { ConfigManager };