const JWTUtils = require('../utils/jwt');

/**
 * 认证中间件
 */
class AuthMiddleware {
  constructor() {
    this.jwtUtils = new JWTUtils();
  }

  /**
   * 验证访问令牌
   */
  verifyToken() {
    return (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
          return res.status(401).json({
            success: false,
            error: '缺少授权头'
          });
        }
        
        const token = authHeader.startsWith('Bearer ') 
          ? authHeader.slice(7) 
          : authHeader;
        
        if (!token) {
          return res.status(401).json({
            success: false,
            error: '缺少访问令牌'
          });
        }
        
        const decoded = this.jwtUtils.verifyToken(token);
        req.user = decoded;
        req.token = token;
        
        next();
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: error.message
        });
      }
    };
  }

  /**
   * 验证图片访问权限
   */
  verifyImageAccess() {
    return (req, res, next) => {
      try {
        const { imageId } = req.params || req.query;
        const token = req.token || req.query.token;
        const userId = req.user?.userId || req.query.userId;
        
        if (!imageId) {
          return res.status(400).json({
            success: false,
            error: '缺少图片ID'
          });
        }
        
        if (!token) {
          return res.status(401).json({
            success: false,
            error: '缺少访问令牌'
          });
        }
        
        const verification = this.jwtUtils.verifyImageAccess(token, imageId, userId);
        
        if (!verification.valid) {
          return res.status(403).json({
            success: false,
            error: verification.error
          });
        }
        
        req.imageAccess = verification;
        next();
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: error.message
        });
      }
    };
  }

  /**
   * 验证密钥访问权限
   */
  verifyKeyAccess() {
    return (req, res, next) => {
      try {
        const { imageId } = req.params || req.query;
        const { keyToken, sessionId } = req.query;
        
        if (!imageId || !keyToken || !sessionId) {
          return res.status(400).json({
            success: false,
            error: '缺少必要参数'
          });
        }
        
        const verification = this.jwtUtils.verifyImageAccess(keyToken, imageId);
        
        if (!verification.valid) {
          return res.status(403).json({
            success: false,
            error: verification.error
          });
        }
        
        if (verification.sessionId !== sessionId) {
          return res.status(403).json({
            success: false,
            error: '会话ID不匹配'
          });
        }
        
        req.keyAccess = verification;
        next();
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: error.message
        });
      }
    };
  }

  /**
   * 可选的Token验证（不强制要求）
   */
  optionalAuth() {
    return (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (authHeader) {
          const token = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7) 
            : authHeader;
          
          if (token) {
            try {
              const decoded = this.jwtUtils.verifyToken(token);
              req.user = decoded;
              req.token = token;
            } catch (error) {
              // 忽略Token验证错误，继续处理请求
              console.warn('可选认证失败:', error.message);
            }
          }
        }
        
        next();
      } catch (error) {
        // 忽略所有错误，继续处理请求
        next();
      }
    };
  }

  /**
   * 检查用户权限
   */
  checkUserPermission(requiredUserId) {
    return (req, res, next) => {
      try {
        const userId = req.user?.userId;
        
        if (!userId) {
          return res.status(401).json({
            success: false,
            error: '用户未认证'
          });
        }
        
        if (requiredUserId && userId !== requiredUserId) {
          return res.status(403).json({
            success: false,
            error: '权限不足'
          });
        }
        
        next();
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: error.message
        });
      }
    };
  }

  /**
   * 检查Token是否即将过期
   */
  checkTokenExpiry(thresholdSeconds = 300) {
    return (req, res, next) => {
      try {
        const token = req.token;
        
        if (token && this.jwtUtils.isTokenExpiringSoon(token, thresholdSeconds)) {
          // 在响应头中添加刷新提示
          res.set('X-Token-Refresh-Needed', 'true');
          res.set('X-Token-Expires-Soon', 'true');
        }
        
        next();
      } catch (error) {
        next();
      }
    };
  }
}

module.exports = AuthMiddleware;