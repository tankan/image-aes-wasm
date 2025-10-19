const ImageService = require('../services/imageService');
const JWTUtils = require('../utils/jwt');
const { validationResult } = require('express-validator');

/**
 * 图片控制器
 * 处理图片加密、解密相关的API请求
 */
class ImageController {
  constructor() {
    this.imageService = new ImageService();
    this.jwtUtils = new JWTUtils();
  }

  /**
   * 上传并加密图片
   */
  async encryptImage(req, res) {
    try {
      // 验证请求参数
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: '参数验证失败',
          details: errors.array()
        });
      }

      // 检查文件是否存在
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: '未找到上传的文件'
        });
      }

      const { buffer, originalname, mimetype, size } = req.file;
      const userId = req.user?.userId || req.body.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: '缺少用户ID'
        });
      }

      // 文件大小检查
      const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;
      if (size > maxSize) {
        return res.status(413).json({
          success: false,
          error: '文件过大'
        });
      }

      // 加密并存储图片
      const result = await this.imageService.encryptAndStoreImage(
        buffer,
        originalname,
        userId
      );

      res.status(201).json({
        success: true,
        message: '图片加密成功',
        data: {
          imageId: result.imageId,
          accessToken: result.accessToken,
          metadata: result.metadata
        }
      });

    } catch (error) {
      console.error('图片加密失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '图片加密失败'
      });
    }
  }

  /**
   * 获取解密密钥
   */
  async getDecryptionKey(req, res) {
    try {
      const { imageId } = req.params;
      const { token } = req.query;
      const userId = req.user?.userId || req.query.userId;

      if (!imageId || !token || !userId) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      const result = await this.imageService.getDecryptionKey(imageId, token, userId);

      res.json({
        success: true,
        message: '密钥获取成功',
        data: {
          keyToken: result.keyToken,
          sessionId: result.sessionId,
          expiresIn: result.expiresIn,
          key: result.key,
          iv: result.iv
        }
      });

    } catch (error) {
      console.error('获取解密密钥失败:', error);
      res.status(403).json({
        success: false,
        error: error.message || '获取解密密钥失败'
      });
    }
  }

  /**
   * 下载加密图片
   */
  async downloadEncryptedImage(req, res) {
    try {
      const { imageId } = req.params;
      const { token } = req.query;
      const userId = req.user?.userId || req.query.userId;

      if (!imageId || !token || !userId) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      const result = await this.imageService.downloadEncryptedImage(imageId, token, userId);

      // 设置响应头
      res.setHeader('Content-Type', result.metadata.contentType);
      res.setHeader('Content-Length', result.metadata.fileSize);
      res.setHeader('Content-Disposition', `attachment; filename="${result.metadata.imageId}.bin"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // 发送加密数据
      res.send(result.data);

    } catch (error) {
      console.error('下载加密图片失败:', error);
      res.status(403).json({
        success: false,
        error: error.message || '下载加密图片失败'
      });
    }
  }

  /**
   * 验证密钥访问权限
   */
  async verifyKeyAccess(req, res) {
    try {
      const { imageId } = req.params;
      const { keyToken, sessionId } = req.query;

      if (!imageId || !keyToken || !sessionId) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      const result = this.imageService.verifyKeyAccess(keyToken, imageId, sessionId);

      if (!result.valid) {
        return res.status(403).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        message: '密钥访问验证成功',
        data: {
          valid: true,
          key: result.key,
          iv: result.iv
        }
      });

    } catch (error) {
      console.error('密钥访问验证失败:', error);
      res.status(403).json({
        success: false,
        error: error.message || '密钥访问验证失败'
      });
    }
  }

  /**
   * 获取用户图片列表
   */
  async getUserImages(req, res) {
    try {
      const userId = req.user?.userId || req.query.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: '缺少用户ID'
        });
      }

      const images = await this.imageService.getUserImages(userId);

      res.json({
        success: true,
        message: '获取图片列表成功',
        data: {
          images,
          total: images.length
        }
      });

    } catch (error) {
      console.error('获取图片列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '获取图片列表失败'
      });
    }
  }

  /**
   * 删除图片
   */
  async deleteImage(req, res) {
    try {
      const { imageId } = req.params;
      const userId = req.user?.userId || req.body.userId;

      if (!imageId || !userId) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      await this.imageService.deleteImage(imageId, userId);

      res.json({
        success: true,
        message: '图片删除成功'
      });

    } catch (error) {
      console.error('删除图片失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '删除图片失败'
      });
    }
  }

  /**
   * 获取图片信息
   */
  async getImageInfo(req, res) {
    try {
      const { imageId } = req.params;
      const userId = req.user?.userId || req.query.userId;

      if (!imageId) {
        return res.status(400).json({
          success: false,
          error: '缺少图片ID'
        });
      }

      const metadata = await this.imageService.getMetadata(imageId);

      if (!metadata) {
        return res.status(404).json({
          success: false,
          error: '图片不存在'
        });
      }

      // 检查用户权限
      if (userId && metadata.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: '无权访问此图片'
        });
      }

      // 返回公开信息（不包含敏感数据）
      const publicInfo = {
        imageId: metadata.imageId,
        originalName: metadata.originalName,
        fileSize: metadata.fileSize,
        encryptedSize: metadata.encryptedSize,
        createdAt: metadata.createdAt,
        fileHash: metadata.fileHash
      };

      res.json({
        success: true,
        message: '获取图片信息成功',
        data: publicInfo
      });

    } catch (error) {
      console.error('获取图片信息失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '获取图片信息失败'
      });
    }
  }

  /**
   * 生成一次性访问令牌
   */
  async generateOneTimeToken(req, res) {
    try {
      const { imageId } = req.params;
      const { expiresIn = 300 } = req.body; // 默认5分钟
      const userId = req.user?.userId || req.body.userId;

      if (!imageId || !userId) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      // 验证图片存在且用户有权限
      const metadata = await this.imageService.getMetadata(imageId);
      if (!metadata || metadata.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: '无权访问此图片'
        });
      }

      const tokenInfo = this.imageService.jwtUtils.generateOneTimeToken(
        userId,
        imageId,
        parseInt(expiresIn)
      );

      res.json({
        success: true,
        message: '一次性令牌生成成功',
        data: tokenInfo
      });

    } catch (error) {
      console.error('生成一次性令牌失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '生成一次性令牌失败'
      });
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(req, res) {
    try {
      res.json({
        success: true,
        message: '服务正常',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '服务异常'
      });
    }
  }
}

module.exports = ImageController;