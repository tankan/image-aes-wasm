/**
 * 密钥验证工具
 * 确保生产环境使用安全的密钥配置
 */

class KeyValidator {
  /**
   * 验证JWT密钥强度
   * @param {string} secret - JWT密钥
   * @returns {Object} 验证结果
   */
  static validateJWTSecret(secret) {
    const issues = [];
    
    if (!secret) {
      issues.push('JWT密钥不能为空');
      return { valid: false, issues };
    }
    
    if (secret.length < 32) {
      issues.push('JWT密钥长度至少需要32个字符');
    }
    
    if (secret === 'your-secret-key' || secret === 'secret' || secret === 'jwt-secret') {
      issues.push('不能使用默认的JWT密钥');
    }
    
    if (secret.includes('CHANGE_THIS') || secret.includes('DEFAULT')) {
      issues.push('必须更改默认的JWT密钥');
    }
    
    // 检查密钥复杂度
    const hasUpperCase = /[A-Z]/.test(secret);
    const hasLowerCase = /[a-z]/.test(secret);
    const hasNumbers = /\d/.test(secret);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(secret);
    
    const complexityScore = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars].filter(Boolean).length;
    
    if (complexityScore < 3) {
      issues.push('JWT密钥应包含大写字母、小写字母、数字和特殊字符中的至少3种');
    }
    
    return {
      valid: issues.length === 0,
      issues,
      strength: this._calculateStrength(secret)
    };
  }
  
  /**
   * 验证加密密钥
   * @param {string} key - 加密密钥（十六进制字符串）
   * @returns {Object} 验证结果
   */
  static validateEncryptionKey(key) {
    const issues = [];
    
    if (!key) {
      issues.push('加密密钥不能为空');
      return { valid: false, issues };
    }
    
    if (key.includes('CHANGE_THIS') || key.includes('DEFAULT')) {
      issues.push('必须更改默认的加密密钥');
    }
    
    // 检查是否为有效的十六进制字符串
    if (!/^[0-9a-fA-F]+$/.test(key)) {
      issues.push('加密密钥必须是有效的十六进制字符串');
    }
    
    // 检查长度（32字节 = 64个十六进制字符）
    if (key.length !== 64) {
      issues.push('加密密钥必须是64个十六进制字符（32字节）');
    }
    
    // 检查是否为弱密钥（全0、全1等）
    if (/^0+$/.test(key) || /^1+$/.test(key) || /^f+$/i.test(key)) {
      issues.push('不能使用弱加密密钥（全0、全1或全F）');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * 验证所有环境变量中的密钥
   * @param {Object} env - 环境变量对象
   * @returns {Object} 验证结果
   */
  static validateEnvironmentKeys(env) {
    const results = {
      valid: true,
      issues: [],
      warnings: []
    };
    
    // 验证JWT密钥
    if (env.JWT_SECRET) {
      const jwtResult = this.validateJWTSecret(env.JWT_SECRET);
      if (!jwtResult.valid) {
        results.valid = false;
        results.issues.push(...jwtResult.issues.map(issue => `JWT_SECRET: ${issue}`));
      }
      if (jwtResult.strength === 'weak') {
        results.warnings.push('JWT_SECRET: 密钥强度较弱，建议使用更复杂的密钥');
      }
    }
    
    // 验证加密密钥
    if (env.ENCRYPTION_KEY) {
      const encResult = this.validateEncryptionKey(env.ENCRYPTION_KEY);
      if (!encResult.valid) {
        results.valid = false;
        results.issues.push(...encResult.issues.map(issue => `ENCRYPTION_KEY: ${issue}`));
      }
    }
    
    // 检查生产环境
    if (env.NODE_ENV === 'production') {
      if (!env.JWT_SECRET || !env.ENCRYPTION_KEY) {
        results.valid = false;
        results.issues.push('生产环境必须设置JWT_SECRET和ENCRYPTION_KEY');
      }
    }
    
    return results;
  }
  
  /**
   * 生成安全的随机密钥
   * @param {number} length - 密钥长度（字节）
   * @returns {string} 十六进制密钥
   */
  static generateSecureKey(length = 32) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
  }
  
  /**
   * 生成安全的JWT密钥
   * @param {number} length - 密钥长度
   * @returns {string} JWT密钥
   */
  static generateJWTSecret(length = 64) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('base64');
  }
  
  /**
   * 计算密钥强度
   * @private
   */
  static _calculateStrength(key) {
    if (key.length < 16) return 'very_weak';
    if (key.length < 32) return 'weak';
    
    const hasUpperCase = /[A-Z]/.test(key);
    const hasLowerCase = /[a-z]/.test(key);
    const hasNumbers = /\d/.test(key);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(key);
    
    const complexityScore = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars].filter(Boolean).length;
    
    if (complexityScore >= 4 && key.length >= 64) return 'very_strong';
    if (complexityScore >= 3 && key.length >= 48) return 'strong';
    if (complexityScore >= 2 && key.length >= 32) return 'medium';
    
    return 'weak';
  }
}

module.exports = KeyValidator;