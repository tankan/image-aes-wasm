const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * JWT 工具类
 * 处理 Token 生成、验证和管理
 */
class JWTUtils {
  constructor() {
    this.secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.expiresIn = process.env.JWT_EXPIRES_IN || '1h';
    this.keyExpiresIn = parseInt(process.env.KEY_EXPIRES_IN) || 60; // 秒
  }

  /**
   * 生成访问令牌
   * @param {Object} payload - 载荷数据
   * @param {string} expiresIn - 过期时间
   * @returns {string} JWT Token
   */
  generateToken(payload, expiresIn = this.expiresIn) {
    try {
      return jwt.sign(payload, this.secret, {
        expiresIn,
        issuer: 'image-aes-system',
        audience: 'image-client'
      });
    } catch (error) {
      throw new Error(`Token生成失败: ${error.message}`);
    }
  }

  /**
   * 验证令牌
   * @param {string} token - JWT Token
   * @returns {Object} 解码后的载荷
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.secret, {
        issuer: 'image-aes-system',
        audience: 'image-client'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token已过期');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Token无效');
      } else {
        throw new Error(`Token验证失败: ${error.message}`);
      }
    }
  }

  /**
   * 生成图片访问令牌
   * @param {string} userId - 用户ID
   * @param {string} imageId - 图片ID
   * @returns {string} 图片访问Token
   */
  generateImageToken(userId, imageId) {
    const payload = {
      userId,
      imageId,
      type: 'image_access',
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    return this.generateToken(payload, this.expiresIn);
  }

  /**
   * 生成密钥访问令牌（短期有效）
   * @param {string} userId - 用户ID
   * @param {string} imageId - 图片ID
   * @param {string} sessionId - 会话ID
   * @returns {string} 密钥访问Token
   */
  generateKeyToken(userId, imageId, sessionId) {
    const payload = {
      userId,
      imageId,
      sessionId,
      type: 'key_access',
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    return this.generateToken(payload, `${this.keyExpiresIn}s`);
  }

  /**
   * 验证图片访问权限
   * @param {string} token - Token
   * @param {string} imageId - 图片ID
   * @param {string} userId - 用户ID（可选）
   * @returns {Object} 验证结果
   */
  verifyImageAccess(token, imageId, userId = null) {
    try {
      const decoded = this.verifyToken(token);
      
      // 检查Token类型
      if (decoded.type !== 'image_access' && decoded.type !== 'key_access') {
        throw new Error('Token类型不正确');
      }
      
      // 检查图片ID
      if (decoded.imageId !== imageId) {
        throw new Error('图片ID不匹配');
      }
      
      // 检查用户ID（如果提供）
      if (userId && decoded.userId !== userId) {
        throw new Error('用户ID不匹配');
      }
      
      return {
        valid: true,
        userId: decoded.userId,
        imageId: decoded.imageId,
        sessionId: decoded.sessionId,
        type: decoded.type,
        timestamp: decoded.timestamp
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 生成一次性访问令牌
   * @param {string} userId - 用户ID
   * @param {string} imageId - 图片ID
   * @param {number} expiresInSeconds - 过期时间（秒）
   * @returns {Object} 包含Token和过期时间
   */
  generateOneTimeToken(userId, imageId, expiresInSeconds = 300) {
    const sessionId = crypto.randomUUID();
    const payload = {
      userId,
      imageId,
      sessionId,
      type: 'one_time_access',
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
      oneTime: true
    };
    
    const token = this.generateToken(payload, `${expiresInSeconds}s`);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    
    return {
      token,
      sessionId,
      expiresAt,
      expiresInSeconds
    };
  }

  /**
   * 解码Token（不验证签名）
   * @param {string} token - JWT Token
   * @returns {Object} 解码后的载荷
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      throw new Error(`Token解码失败: ${error.message}`);
    }
  }

  /**
   * 检查Token是否即将过期
   * @param {string} token - JWT Token
   * @param {number} thresholdSeconds - 阈值（秒）
   * @returns {boolean} 是否即将过期
   */
  isTokenExpiringSoon(token, thresholdSeconds = 300) {
    try {
      const decoded = this.decodeToken(token);
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - now;
      
      return timeUntilExpiry <= thresholdSeconds;
    } catch (error) {
      return true; // 如果无法解码，认为已过期
    }
  }

  /**
   * 刷新Token
   * @param {string} token - 原Token
   * @returns {string} 新Token
   */
  refreshToken(token) {
    try {
      const decoded = this.verifyToken(token);
      
      // 移除JWT标准字段
      delete decoded.iat;
      delete decoded.exp;
      delete decoded.iss;
      delete decoded.aud;
      
      // 更新时间戳和随机数
      decoded.timestamp = Date.now();
      decoded.nonce = crypto.randomBytes(16).toString('hex');
      
      return this.generateToken(decoded);
    } catch (error) {
      throw new Error(`Token刷新失败: ${error.message}`);
    }
  }
}

module.exports = JWTUtils;