const rateLimit = require('express-rate-limit');

/**
 * 安全中间件
 */
class SecurityMiddleware {
  constructor() {
    this.ipAttempts = new Map(); // IP访问记录
    this.blockedIPs = new Set(); // 被封禁的IP
    this.setupCleanup();
  }

  /**
   * 基础频率限制 - 适配 express-rate-limit 8.x
   */
  basicRateLimit() {
    return rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15分钟
      limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 最多100次请求
      message: {
        success: false,
        error: '请求过于频繁，请稍后再试'
      },
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => {
        // 跳过被封禁的IP（让其他中间件处理）
        return this.blockedIPs.has(this.getClientIP(req));
      }
    });
  }

  /**
   * 严格频率限制（用于敏感操作）- 适配 express-rate-limit 8.x
   */
  strictRateLimit() {
    return rateLimit({
      windowMs: 5 * 60 * 1000, // 5分钟
      limit: 10, // 最多10次请求
      message: {
        success: false,
        error: '敏感操作过于频繁，请稍后再试'
      },
      standardHeaders: 'draft-7',
      legacyHeaders: false
    });
  }

  /**
   * 密钥获取频率限制 - 适配 express-rate-limit 8.x
   */
  keyAccessRateLimit() {
    return rateLimit({
      windowMs: 1 * 60 * 1000, // 1分钟
      limit: 5, // 最多5次请求
      message: {
        success: false,
        error: '密钥获取过于频繁，请稍后再试'
      },
      keyGenerator: (req) => {
        // 基于IP和用户ID生成限制键
        const ip = this.getClientIP(req);
        const userId = req.user?.userId || 'anonymous';
        return `${ip}:${userId}`;
      },
      standardHeaders: 'draft-7',
      legacyHeaders: false
    });
  }

  /**
   * IP封禁检查
   */
  checkIPBlock() {
    return (req, res, next) => {
      const clientIP = this.getClientIP(req);
      
      if (this.blockedIPs.has(clientIP)) {
        return res.status(429).json({
          success: false,
          error: 'IP已被封禁，请联系管理员'
        });
      }
      
      next();
    };
  }

  /**
   * 失败尝试记录
   */
  recordFailedAttempt() {
    return (req, res, next) => {
      const clientIP = this.getClientIP(req);
      
      // 监听响应完成事件
      res.on('finish', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          this.incrementFailedAttempts(clientIP);
        }
      });
      
      next();
    };
  }

  /**
   * 安全头设置
   */
  securityHeaders() {
    return (req, res, next) => {
      // 防止点击劫持
      res.setHeader('X-Frame-Options', 'DENY');
      
      // 防止MIME类型嗅探
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // XSS保护
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // 强制HTTPS
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      
      // 内容安全策略
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      
      // 引用策略
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      next();
    };
  }

  /**
   * 请求大小限制
   */
  requestSizeLimit() {
    return (req, res, next) => {
      const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
      
      if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
        return res.status(413).json({
          success: false,
          error: '请求体过大'
        });
      }
      
      next();
    };
  }

  /**
   * 文件类型验证
   */
  validateFileType(allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
    return (req, res, next) => {
      if (req.file) {
        const fileType = req.file.mimetype;
        
        if (!allowedTypes.includes(fileType)) {
          return res.status(400).json({
            success: false,
            error: '不支持的文件类型'
          });
        }
        
        // 验证文件扩展名
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const fileExtension = req.file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
        
        if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
          return res.status(400).json({
            success: false,
            error: '不支持的文件扩展名'
          });
        }
      }
      
      next();
    };
  }

  /**
   * 防止路径遍历攻击
   */
  preventPathTraversal() {
    return (req, res, next) => {
      const suspiciousPatterns = [
        /\.\./,
        /\/\.\./,
        /\.\.\//,
        /\0/,
        /%2e%2e/i,
        /%252e%252e/i
      ];
      
      const checkPath = (path) => {
        return suspiciousPatterns.some(pattern => pattern.test(path));
      };
      
      // 检查URL路径
      if (checkPath(req.url)) {
        return res.status(400).json({
          success: false,
          error: '非法路径'
        });
      }
      
      // 检查查询参数
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string' && checkPath(value)) {
          return res.status(400).json({
            success: false,
            error: '非法参数'
          });
        }
      }
      
      next();
    };
  }

  /**
   * 获取客户端真实IP
   */
  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip ||
           'unknown';
  }

  /**
   * 增加失败尝试次数
   */
  incrementFailedAttempts(ip) {
    const now = Date.now();
    const attempts = this.ipAttempts.get(ip) || { count: 0, firstAttempt: now, lastAttempt: now };
    
    attempts.count++;
    attempts.lastAttempt = now;
    
    this.ipAttempts.set(ip, attempts);
    
    // 检查是否需要封禁
    const timeWindow = 15 * 60 * 1000; // 15分钟
    const maxAttempts = 20;
    
    if (attempts.count >= maxAttempts && (now - attempts.firstAttempt) <= timeWindow) {
      this.blockedIPs.add(ip);
      console.warn(`IP ${ip} 已被封禁，失败尝试次数: ${attempts.count}`);
      
      // 设置自动解封
      setTimeout(() => {
        this.blockedIPs.delete(ip);
        this.ipAttempts.delete(ip);
        console.info(`IP ${ip} 已自动解封`);
      }, 60 * 60 * 1000); // 1小时后解封
    }
  }

  /**
   * 清理过期记录
   */
  setupCleanup() {
    setInterval(() => {
      const now = Date.now();
      const expireTime = 24 * 60 * 60 * 1000; // 24小时
      
      for (const [ip, attempts] of this.ipAttempts.entries()) {
        if (now - attempts.lastAttempt > expireTime) {
          this.ipAttempts.delete(ip);
        }
      }
    }, 60 * 60 * 1000); // 每小时清理一次
  }

  /**
   * 手动封禁IP
   */
  blockIP(ip, duration = 60 * 60 * 1000) {
    this.blockedIPs.add(ip);
    
    if (duration > 0) {
      setTimeout(() => {
        this.blockedIPs.delete(ip);
      }, duration);
    }
  }

  /**
   * 手动解封IP
   */
  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    this.ipAttempts.delete(ip);
  }

  /**
   * 获取IP状态
   */
  getIPStatus(ip) {
    return {
      blocked: this.blockedIPs.has(ip),
      attempts: this.ipAttempts.get(ip) || { count: 0 }
    };
  }
}

module.exports = SecurityMiddleware;