/**
 * 分层错误处理系统
 * 提供统一的错误分类、处理和降级机制
 */

import { getConfig } from './config.js';

/**
 * 错误类型枚举
 */
export const ErrorTypes = {
  // WASM相关错误
  WASM_LOAD_FAILED: 'WASM_LOAD_FAILED',
  WASM_INIT_FAILED: 'WASM_INIT_FAILED',
  WASM_EXECUTION_FAILED: 'WASM_EXECUTION_FAILED',
  WASM_MEMORY_ERROR: 'WASM_MEMORY_ERROR',
  
  // 解密相关错误
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  INVALID_KEY: 'INVALID_KEY',
  INVALID_IV: 'INVALID_IV',
  CORRUPTED_DATA: 'CORRUPTED_DATA',
  
  // 网络相关错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  
  // 验证相关错误
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  
  // 系统相关错误
  BROWSER_NOT_SUPPORTED: 'BROWSER_NOT_SUPPORTED',
  INSUFFICIENT_MEMORY: 'INSUFFICIENT_MEMORY',
  
  // 通用错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * 错误严重程度
 */
export const ErrorSeverity = {
  LOW: 'low',        // 可忽略的错误
  MEDIUM: 'medium',  // 需要处理但不影响核心功能
  HIGH: 'high',      // 影响核心功能
  CRITICAL: 'critical' // 系统级错误
};

/**
 * 自定义错误类
 */
export class AppError extends Error {
  constructor(message, type = ErrorTypes.UNKNOWN_ERROR, severity = ErrorSeverity.MEDIUM, originalError = null) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.severity = severity;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
    
    // 保持错误堆栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * 获取完整的错误信息
   */
  getFullMessage() {
    let message = `[${this.type}] ${this.message}`;
    if (this.originalError) {
      message += ` (原始错误: ${this.originalError.message})`;
    }
    return message;
  }

  /**
   * 转换为JSON格式
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      timestamp: this.timestamp,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message
      } : null
    };
  }
}

/**
 * 错误处理器类
 */
export class ErrorHandler {
  constructor() {
    this.errorListeners = [];
    this.errorHistory = [];
    this.maxHistorySize = getConfig('debug.maxErrorHistorySize', 100); // 从配置获取最大历史记录大小
  }

  /**
   * 添加错误监听器
   */
  addErrorListener(listener) {
    this.errorListeners.push(listener);
  }

  /**
   * 移除错误监听器
   */
  removeErrorListener(listener) {
    const index = this.errorListeners.indexOf(listener);
    if (index > -1) {
      this.errorListeners.splice(index, 1);
    }
  }

  /**
   * 处理错误
   */
  handleError(error, context = {}) {
    // 标准化错误对象
    const appError = this._normalizeError(error);
    
    // 记录错误历史
    this._recordError(appError, context);
    
    // 通知监听器
    this._notifyListeners(appError, context);
    
    // 根据严重程度决定处理策略
    this._processErrorBySeverity(appError, context);
    
    return appError;
  }

  /**
   * 智能降级处理
   */
  handleWithFallback(primaryAction, fallbackAction, errorContext = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await primaryAction();
        resolve(result);
      } catch (primaryError) {
        const appError = this.handleError(primaryError, {
          ...errorContext,
          action: 'primary'
        });

        // 判断是否应该降级
        if (this._shouldFallback(appError)) {
          try {
            console.warn(`主要操作失败，尝试降级处理: ${appError.getFullMessage()}`);
            const fallbackResult = await fallbackAction();
            resolve(fallbackResult);
          } catch (fallbackError) {
            const combinedError = new AppError(
              `主要操作和降级操作都失败`,
              ErrorTypes.UNKNOWN_ERROR,
              ErrorSeverity.HIGH,
              {
                primary: primaryError,
                fallback: fallbackError
              }
            );
            this.handleError(combinedError, {
              ...errorContext,
              action: 'fallback_failed'
            });
            reject(combinedError);
          }
        } else {
          reject(appError);
        }
      }
    });
  }

  /**
   * 获取错误历史
   */
  getErrorHistory() {
    return [...this.errorHistory];
  }

  /**
   * 清除错误历史
   */
  clearErrorHistory() {
    this.errorHistory = [];
  }

  /**
   * 标准化错误对象
   * @private
   */
  _normalizeError(error) {
    if (error instanceof AppError) {
      return error;
    }

    // 根据错误消息和类型推断错误类型
    const errorType = this._inferErrorType(error);
    const severity = this._inferSeverity(errorType, error);

    return new AppError(
      error.message || '未知错误',
      errorType,
      severity,
      error
    );
  }

  /**
   * 推断错误类型
   * @private
   */
  _inferErrorType(error) {
    const message = (error.message || '').toLowerCase();
    
    // WASM相关错误
    if (message.includes('wasm') || message.includes('webassembly')) {
      if (message.includes('load') || message.includes('加载')) {
        return ErrorTypes.WASM_LOAD_FAILED;
      }
      if (message.includes('init') || message.includes('初始化')) {
        return ErrorTypes.WASM_INIT_FAILED;
      }
      if (message.includes('memory') || message.includes('内存')) {
        return ErrorTypes.WASM_MEMORY_ERROR;
      }
      return ErrorTypes.WASM_EXECUTION_FAILED;
    }

    // 解密相关错误
    if (message.includes('decrypt') || message.includes('解密')) {
      if (message.includes('key') || message.includes('密钥')) {
        return ErrorTypes.INVALID_KEY;
      }
      if (message.includes('iv')) {
        return ErrorTypes.INVALID_IV;
      }
      if (message.includes('corrupt') || message.includes('损坏')) {
        return ErrorTypes.CORRUPTED_DATA;
      }
      return ErrorTypes.DECRYPTION_FAILED;
    }

    // 网络相关错误
    if (message.includes('network') || message.includes('网络') || 
        message.includes('fetch') || message.includes('request')) {
      return ErrorTypes.NETWORK_ERROR;
    }

    // 超时错误
    if (message.includes('timeout') || message.includes('超时')) {
      return ErrorTypes.TIMEOUT_ERROR;
    }

    // 验证错误
    if (message.includes('valid') || message.includes('验证')) {
      return ErrorTypes.VALIDATION_FAILED;
    }

    return ErrorTypes.UNKNOWN_ERROR;
  }

  /**
   * 推断错误严重程度
   * @private
   */
  _inferSeverity(errorType, error) {
    switch (errorType) {
      case ErrorTypes.WASM_LOAD_FAILED:
      case ErrorTypes.WASM_INIT_FAILED:
        return ErrorSeverity.HIGH;
      
      case ErrorTypes.WASM_MEMORY_ERROR:
      case ErrorTypes.INSUFFICIENT_MEMORY:
        return ErrorSeverity.CRITICAL;
      
      case ErrorTypes.BROWSER_NOT_SUPPORTED:
        return ErrorSeverity.CRITICAL;
      
      case ErrorTypes.DECRYPTION_FAILED:
      case ErrorTypes.INVALID_KEY:
      case ErrorTypes.INVALID_IV:
        return ErrorSeverity.HIGH;
      
      case ErrorTypes.NETWORK_ERROR:
      case ErrorTypes.TIMEOUT_ERROR:
        return ErrorSeverity.MEDIUM;
      
      case ErrorTypes.VALIDATION_FAILED:
        return ErrorSeverity.LOW;
      
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * 记录错误历史
   * @private
   */
  _recordError(error, context) {
    this.errorHistory.push({
      error: error.toJSON(),
      context,
      timestamp: new Date().toISOString()
    });

    // 限制历史记录大小
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * 通知错误监听器
   * @private
   */
  _notifyListeners(error, context) {
    this.errorListeners.forEach(listener => {
      try {
        listener(error, context);
      } catch (listenerError) {
        console.error('错误监听器执行失败:', listenerError);
      }
    });
  }

  /**
   * 根据严重程度处理错误
   * @private
   */
  _processErrorBySeverity(error, context) {
    switch (error.severity) {
      case ErrorSeverity.LOW:
        console.warn('低级错误:', error.getFullMessage());
        break;
      
      case ErrorSeverity.MEDIUM:
        console.error('中级错误:', error.getFullMessage());
        break;
      
      case ErrorSeverity.HIGH:
        console.error('高级错误:', error.getFullMessage());
        // 可以在这里添加用户通知逻辑
        break;
      
      case ErrorSeverity.CRITICAL:
        console.error('严重错误:', error.getFullMessage());
        // 可以在这里添加系统级处理逻辑
        break;
    }
  }

  /**
   * 判断是否应该降级
   * @private
   */
  _shouldFallback(error) {
    // 不应该降级的错误类型
    const noFallbackTypes = [
      ErrorTypes.INVALID_KEY,
      ErrorTypes.INVALID_IV,
      ErrorTypes.BROWSER_NOT_SUPPORTED,
      ErrorTypes.INSUFFICIENT_MEMORY
    ];

    if (noFallbackTypes.includes(error.type)) {
      return false;
    }

    // 超时错误通常不应该降级
    if (error.type === ErrorTypes.TIMEOUT_ERROR) {
      return false;
    }

    // 其他错误可以尝试降级
    return true;
  }
}

// 创建全局错误处理器实例
export const globalErrorHandler = new ErrorHandler();

// 设置全局错误监听
window.addEventListener('error', (event) => {
  globalErrorHandler.handleError(event.error, {
    type: 'global_error',
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

window.addEventListener('unhandledrejection', (event) => {
  globalErrorHandler.handleError(event.reason, {
    type: 'unhandled_promise_rejection'
  });
});