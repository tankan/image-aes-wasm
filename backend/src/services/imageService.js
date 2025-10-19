const ImageCrypto = require('../utils/crypto');
const JWTUtils = require('../utils/jwt');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

/**
 * 图片服务类
 * 处理图片加密、存储和访问管理
 */
class ImageService {
  constructor() {
    this.imageCrypto = new ImageCrypto();
    this.jwtUtils = new JWTUtils();
    this.uploadPath = process.env.UPLOAD_PATH || './uploads';
    this.masterKey = process.env.ENCRYPTION_KEY || 'default-master-key-change-in-production';
    
    // 内存中的密钥缓存（生产环境建议使用Redis）
    this.keyCache = new Map();
    
    // 清理过期缓存的定时器
    this.setupCacheCleanup();
  }

  /**
   * 加密并存储图片
   * @param {Buffer} imageBuffer - 图片数据
   * @param {string} originalName - 原始文件名
   * @param {string} userId - 用户ID
   * @returns {Object} 加密结果
   */
  async encryptAndStoreImage(imageBuffer, originalName, userId) {
    try {
      // 生成密钥和IV
      const key = this.imageCrypto.generateKey();
      const iv = this.imageCrypto.generateIV();
      
      // 加密图片
      const encryptedData = this.imageCrypto.encryptImage(imageBuffer, key, iv);
      
      // 生成文件哈希
      const fileHash = this.imageCrypto.generateFileHash(imageBuffer);
      
      // 保存加密文件
      const filePath = await this.imageCrypto.saveEncryptedFile(
        encryptedData, 
        originalName, 
        this.uploadPath
      );
      
      // 生成图片ID
      const imageId = crypto.randomUUID();
      
      // 加密密钥和IV
      const { encryptedKey, encryptedIV } = this.imageCrypto.encryptKeyAndIV(
        key, 
        iv, 
        this.masterKey
      );
      
      // 生成访问令牌
      const accessToken = this.jwtUtils.generateImageToken(userId, imageId);
      
      // 存储图片元数据（实际项目中应存储到数据库）
      const metadata = {
        imageId,
        userId,
        originalName,
        filePath,
        fileHash,
        encryptedKey,
        encryptedIV,
        createdAt: new Date().toISOString(),
        fileSize: imageBuffer.length,
        encryptedSize: encryptedData.length
      };
      
      // 保存元数据到文件（生产环境应使用数据库）
      await this.saveMetadata(imageId, metadata);
      
      return {
        success: true,
        imageId,
        accessToken,
        metadata: {
          originalName,
          fileSize: imageBuffer.length,
          encryptedSize: encryptedData.length,
          fileHash,
          createdAt: metadata.createdAt
        }
      };
    } catch (error) {
      throw new Error(`图片加密存储失败: ${error.message}`);
    }
  }

  /**
   * 获取解密密钥
   * @param {string} imageId - 图片ID
   * @param {string} token - 访问令牌
   * @param {string} userId - 用户ID
   * @returns {Object} 密钥信息
   */
  async getDecryptionKey(imageId, token, userId) {
    try {
      // 验证访问权限
      const verification = this.jwtUtils.verifyImageAccess(token, imageId, userId);
      if (!verification.valid) {
        throw new Error(`访问验证失败: ${verification.error}`);
      }
      
      // 获取图片元数据
      const metadata = await this.getMetadata(imageId);
      if (!metadata) {
        throw new Error('图片不存在');
      }
      
      // 检查用户权限
      if (metadata.userId !== userId) {
        throw new Error('无权访问此图片');
      }
      
      // 解密密钥和IV
      const { key, iv } = this.imageCrypto.decryptKeyAndIV(
        metadata.encryptedKey,
        metadata.encryptedIV,
        this.masterKey
      );
      
      // 生成短期密钥访问令牌
      const sessionId = crypto.randomUUID();
      const keyToken = this.jwtUtils.generateKeyToken(userId, imageId, sessionId);
      
      // 将密钥缓存到内存中（短期有效）
      const cacheKey = `${imageId}:${sessionId}`;
      const expiresAt = Date.now() + (this.jwtUtils.keyExpiresIn * 1000);
      
      this.keyCache.set(cacheKey, {
        key: key.toString('base64'),
        iv: iv.toString('base64'),
        expiresAt,
        userId,
        imageId
      });
      
      return {
        success: true,
        keyToken,
        sessionId,
        expiresIn: this.jwtUtils.keyExpiresIn,
        key: key.toString('base64'),
        iv: iv.toString('base64')
      };
    } catch (error) {
      throw new Error(`获取解密密钥失败: ${error.message}`);
    }
  }

  /**
   * 下载加密图片
   * @param {string} imageId - 图片ID
   * @param {string} token - 访问令牌
   * @param {string} userId - 用户ID
   * @returns {Object} 图片数据和元信息
   */
  async downloadEncryptedImage(imageId, token, userId) {
    try {
      // 验证访问权限
      const verification = this.jwtUtils.verifyImageAccess(token, imageId, userId);
      if (!verification.valid) {
        throw new Error(`访问验证失败: ${verification.error}`);
      }
      
      // 获取图片元数据
      const metadata = await this.getMetadata(imageId);
      if (!metadata) {
        throw new Error('图片不存在');
      }
      
      // 检查用户权限
      if (metadata.userId !== userId) {
        throw new Error('无权访问此图片');
      }
      
      // 读取加密文件
      const encryptedData = await this.imageCrypto.readEncryptedFile(metadata.filePath);
      
      return {
        success: true,
        data: encryptedData,
        metadata: {
          imageId,
          originalName: metadata.originalName,
          fileSize: metadata.encryptedSize,
          contentType: 'application/octet-stream'
        }
      };
    } catch (error) {
      throw new Error(`下载加密图片失败: ${error.message}`);
    }
  }

  /**
   * 验证密钥访问权限
   * @param {string} keyToken - 密钥令牌
   * @param {string} imageId - 图片ID
   * @param {string} sessionId - 会话ID
   * @returns {Object} 验证结果
   */
  verifyKeyAccess(keyToken, imageId, sessionId) {
    try {
      // 验证Token
      const verification = this.jwtUtils.verifyImageAccess(keyToken, imageId);
      if (!verification.valid) {
        return { valid: false, error: verification.error };
      }
      
      // 检查会话ID
      if (verification.sessionId !== sessionId) {
        return { valid: false, error: '会话ID不匹配' };
      }
      
      // 检查缓存中的密钥
      const cacheKey = `${imageId}:${sessionId}`;
      const cachedKey = this.keyCache.get(cacheKey);
      
      if (!cachedKey) {
        return { valid: false, error: '密钥已过期或不存在' };
      }
      
      if (cachedKey.expiresAt < Date.now()) {
        this.keyCache.delete(cacheKey);
        return { valid: false, error: '密钥已过期' };
      }
      
      return {
        valid: true,
        key: cachedKey.key,
        iv: cachedKey.iv,
        userId: cachedKey.userId
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * 获取图片列表
   * @param {string} userId - 用户ID
   * @returns {Array} 图片列表
   */
  async getUserImages(userId) {
    try {
      const metadataDir = path.join(this.uploadPath, 'metadata');
      
      try {
        const files = await fs.readdir(metadataDir);
        const userImages = [];
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(metadataDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const metadata = JSON.parse(content);
            
            if (metadata.userId === userId) {
              userImages.push({
                imageId: metadata.imageId,
                originalName: metadata.originalName,
                fileSize: metadata.fileSize,
                createdAt: metadata.createdAt,
                fileHash: metadata.fileHash
              });
            }
          }
        }
        
        return userImages;
      } catch (error) {
        return []; // 目录不存在或为空
      }
    } catch (error) {
      throw new Error(`获取图片列表失败: ${error.message}`);
    }
  }

  /**
   * 删除图片
   * @param {string} imageId - 图片ID
   * @param {string} userId - 用户ID
   * @returns {boolean} 删除结果
   */
  async deleteImage(imageId, userId) {
    try {
      // 获取图片元数据
      const metadata = await this.getMetadata(imageId);
      if (!metadata) {
        throw new Error('图片不存在');
      }
      
      // 检查用户权限
      if (metadata.userId !== userId) {
        throw new Error('无权删除此图片');
      }
      
      // 删除加密文件
      try {
        await fs.unlink(metadata.filePath);
      } catch (error) {
        console.warn(`删除加密文件失败: ${error.message}`);
      }
      
      // 删除元数据文件
      const metadataPath = path.join(this.uploadPath, 'metadata', `${imageId}.json`);
      try {
        await fs.unlink(metadataPath);
      } catch (error) {
        console.warn(`删除元数据文件失败: ${error.message}`);
      }
      
      // 清理相关缓存
      for (const [key, value] of this.keyCache.entries()) {
        if (value.imageId === imageId) {
          this.keyCache.delete(key);
        }
      }
      
      return true;
    } catch (error) {
      throw new Error(`删除图片失败: ${error.message}`);
    }
  }

  /**
   * 保存图片元数据
   * @param {string} imageId - 图片ID
   * @param {Object} metadata - 元数据
   */
  async saveMetadata(imageId, metadata) {
    const metadataDir = path.join(this.uploadPath, 'metadata');
    await fs.mkdir(metadataDir, { recursive: true });
    
    const metadataPath = path.join(metadataDir, `${imageId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * 获取图片元数据
   * @param {string} imageId - 图片ID
   * @returns {Object|null} 元数据
   */
  async getMetadata(imageId) {
    try {
      const metadataPath = path.join(this.uploadPath, 'metadata', `${imageId}.json`);
      const content = await fs.readFile(metadataPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * 设置缓存清理定时器
   */
  setupCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.keyCache.entries()) {
        if (value.expiresAt < now) {
          this.keyCache.delete(key);
        }
      }
    }, 30000); // 每30秒清理一次过期缓存
  }
}

module.exports = ImageService;