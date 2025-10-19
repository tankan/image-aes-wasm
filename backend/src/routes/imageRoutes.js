const express = require('express');
const multer = require('multer');
const { body, param, query } = require('express-validator');
const ImageController = require('../controllers/imageController');
const AuthMiddleware = require('../middleware/auth');
const SecurityMiddleware = require('../middleware/security');

const router = express.Router();
const imageController = new ImageController();
const authMiddleware = new AuthMiddleware();
const securityMiddleware = new SecurityMiddleware();

// 配置文件上传 - 适配 Multer 2.x
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // 允许的文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Multer 2.x 使用 MulterError
      const error = new Error('不支持的文件类型');
      error.code = 'UNSUPPORTED_FILE_TYPE';
      cb(error, false);
    }
  }
});

// 参数验证规则
const validateImageId = [
  param('imageId')
    .isUUID()
    .withMessage('图片ID格式不正确')
];

const validateUserId = [
  body('userId')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('用户ID格式不正确')
];

const validateToken = [
  query('token')
    .isString()
    .isLength({ min: 10 })
    .withMessage('Token格式不正确')
];

const validateKeyAccess = [
  query('keyToken')
    .isString()
    .isLength({ min: 10 })
    .withMessage('密钥Token格式不正确'),
  query('sessionId')
    .isUUID()
    .withMessage('会话ID格式不正确')
];

// 健康检查 - 无需认证
router.get('/health', 
  imageController.healthCheck.bind(imageController)
);

// 图片上传加密 - 需要认证和严格频率限制
router.post('/encrypt-image',
  securityMiddleware.checkIPBlock(),
  securityMiddleware.strictRateLimit(),
  securityMiddleware.recordFailedAttempt(),
  securityMiddleware.requestSizeLimit(),
  authMiddleware.optionalAuth(), // 可选认证，允许匿名上传
  upload.single('image'),
  securityMiddleware.validateFileType(),
  validateUserId,
  imageController.encryptImage.bind(imageController)
);

// 获取解密密钥 - 需要认证和密钥访问频率限制
router.get('/get-key/:imageId',
  securityMiddleware.checkIPBlock(),
  securityMiddleware.keyAccessRateLimit(),
  securityMiddleware.recordFailedAttempt(),
  validateImageId,
  validateToken,
  authMiddleware.verifyImageAccess(),
  imageController.getDecryptionKey.bind(imageController)
);

// 下载加密图片 - 需要认证
router.get('/download-image/:imageId',
  securityMiddleware.checkIPBlock(),
  securityMiddleware.basicRateLimit(),
  securityMiddleware.recordFailedAttempt(),
  validateImageId,
  validateToken,
  authMiddleware.verifyImageAccess(),
  imageController.downloadEncryptedImage.bind(imageController)
);

// 验证密钥访问权限 - 需要密钥Token
router.get('/verify-key/:imageId',
  securityMiddleware.checkIPBlock(),
  securityMiddleware.basicRateLimit(),
  validateImageId,
  validateKeyAccess,
  authMiddleware.verifyKeyAccess(),
  imageController.verifyKeyAccess.bind(imageController)
);

// 生成图片访问token
router.post('/generate-image-token', 
  authMiddleware.verifyToken(),
  async (req, res) => {
    try {
      const { imageId } = req.body;
      const userId = req.user.userId;
      
      if (!imageId) {
        return res.status(400).json({ error: '缺少图片ID' });
      }
      
      // 验证用户是否有权限访问该图片
      const metadata = await imageController.imageService.getMetadata(imageId);
      if (!metadata || metadata.userId !== userId) {
        return res.status(403).json({ error: '无权限访问该图片' });
      }
      
      // 生成图片访问token
      const token = imageController.jwtUtils.generateImageToken(userId, imageId);
      
      res.json({ token });
    } catch (error) {
      console.error('生成图片访问token失败:', error);
      res.status(500).json({ error: '生成访问token失败' });
    }
  }
);

// 获取用户图片列表 - 需要认证
router.get('/images',
  securityMiddleware.checkIPBlock(),
  securityMiddleware.basicRateLimit(),
  authMiddleware.verifyToken(),
  imageController.getUserImages.bind(imageController)
);

// 获取图片信息 - 可选认证
router.get('/image-info/:imageId',
  securityMiddleware.checkIPBlock(),
  securityMiddleware.basicRateLimit(),
  validateImageId,
  authMiddleware.optionalAuth(),
  imageController.getImageInfo.bind(imageController)
);

// 删除图片 - 需要认证和严格频率限制
router.delete('/image/:imageId',
  securityMiddleware.checkIPBlock(),
  securityMiddleware.strictRateLimit(),
  securityMiddleware.recordFailedAttempt(),
  authMiddleware.verifyToken(),
  validateImageId,
  imageController.deleteImage.bind(imageController)
);

// 生成一次性访问令牌 - 需要认证
router.post('/one-time-token/:imageId',
  securityMiddleware.checkIPBlock(),
  securityMiddleware.strictRateLimit(),
  authMiddleware.verifyToken(),
  validateImageId,
  [
    body('expiresIn')
      .optional()
      .isInt({ min: 60, max: 3600 })
      .withMessage('过期时间必须在60-3600秒之间')
  ],
  imageController.generateOneTimeToken.bind(imageController)
);

// 错误处理中间件
router.use((error, req, res, next) => {
  console.error('路由错误:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: '文件过大'
      });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: '文件数量超限'
      });
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: '意外的文件字段'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: error.message || '服务器内部错误'
  });
});

module.exports = router;