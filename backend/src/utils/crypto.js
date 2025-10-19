const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * 图片加密工具类
 * 实现 AES-256-CBC 加密算法和密钥管理
 */
class ImageCrypto {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
  }

  /**
   * 生成随机密钥
   * @returns {Buffer} 32字节的随机密钥
   */
  generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * 生成随机初始化向量
   * @returns {Buffer} 16字节的随机IV
   */
  generateIV() {
    return crypto.randomBytes(this.ivLength);
  }

  /**
   * 加密图片数据
   * @param {Buffer} imageBuffer - 图片二进制数据
   * @param {Buffer} key - 加密密钥
   * @param {Buffer} iv - 初始化向量
   * @returns {Buffer} 加密后的数据
   */
  encryptImage(imageBuffer, key, iv) {
    try {
      // 使用 createCipheriv 替代已废弃的 createCipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      const encrypted = Buffer.concat([
        cipher.update(imageBuffer),
        cipher.final()
      ]);
      return encrypted;
    } catch (error) {
      throw new Error(`图片加密失败: ${error.message}`);
    }
  }

  /**
   * 解密图片数据
   * @param {Buffer} encryptedBuffer - 加密的数据
   * @param {Buffer} key - 解密密钥
   * @param {Buffer} iv - 初始化向量
   * @returns {Buffer} 解密后的图片数据
   */
  decryptImage(encryptedBuffer, key, iv) {
    try {
      // 使用 createDecipheriv 替代已废弃的 createDecipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      const decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
      ]);
      return decrypted;
    } catch (error) {
      throw new Error(`图片解密失败: ${error.message}`);
    }
  }

  /**
   * 加密密钥和IV（用于安全传输）
   * @param {Buffer} key - 原始密钥
   * @param {Buffer} iv - 原始IV
   * @param {string} masterKey - 主密钥
   * @returns {Object} 包含加密后的密钥和IV
   */
  encryptKeyAndIV(key, iv, masterKey) {
    try {
      const masterKeyBuffer = Buffer.from(masterKey, 'utf8');
      const masterKeyHash = crypto.createHash('sha256').update(masterKeyBuffer).digest();
      
      // 为密钥和IV生成独立的IV
      const keyIV = crypto.randomBytes(this.ivLength);
      const ivIV = crypto.randomBytes(this.ivLength);
      
      // 加密密钥 - 使用 createCipheriv 替代已废弃的 createCipher
      const keyCipher = crypto.createCipheriv(this.algorithm, masterKeyHash, keyIV);
      const encryptedKey = Buffer.concat([
        keyCipher.update(key),
        keyCipher.final()
      ]);
      
      // 加密IV - 使用 createCipheriv 替代已废弃的 createCipher
      const ivCipher = crypto.createCipheriv(this.algorithm, masterKeyHash, ivIV);
      const encryptedIV = Buffer.concat([
        ivCipher.update(iv),
        ivCipher.final()
      ]);
      
      return {
        encryptedKey: Buffer.concat([keyIV, encryptedKey]).toString('base64'),
        encryptedIV: Buffer.concat([ivIV, encryptedIV]).toString('base64')
      };
    } catch (error) {
      throw new Error(`密钥加密失败: ${error.message}`);
    }
  }

  /**
   * 解密密钥和IV
   * @param {string} encryptedKey - 加密的密钥（base64）
   * @param {string} encryptedIV - 加密的IV（base64）
   * @param {string} masterKey - 主密钥
   * @returns {Object} 包含解密后的密钥和IV
   */
  decryptKeyAndIV(encryptedKey, encryptedIV, masterKey) {
    try {
      const masterKeyBuffer = Buffer.from(masterKey, 'utf8');
      const masterKeyHash = crypto.createHash('sha256').update(masterKeyBuffer).digest();
      
      // 解析加密的密钥
      const keyBuffer = Buffer.from(encryptedKey, 'base64');
      const keyIV = keyBuffer.slice(0, this.ivLength);
      const encryptedKeyData = keyBuffer.slice(this.ivLength);
      
      // 解析加密的IV
      const ivBuffer = Buffer.from(encryptedIV, 'base64');
      const ivIV = ivBuffer.slice(0, this.ivLength);
      const encryptedIVData = ivBuffer.slice(this.ivLength);
      
      // 解密密钥 - 使用 createDecipheriv 替代已废弃的 createDecipher
      const keyDecipher = crypto.createDecipheriv(this.algorithm, masterKeyHash, keyIV);
      const decryptedKey = Buffer.concat([
        keyDecipher.update(encryptedKeyData),
        keyDecipher.final()
      ]);
      
      // 解密IV - 使用 createDecipheriv 替代已废弃的 createDecipher
      const ivDecipher = crypto.createDecipheriv(this.algorithm, masterKeyHash, ivIV);
      const decryptedIV = Buffer.concat([
        ivDecipher.update(encryptedIVData),
        ivDecipher.final()
      ]);
      
      return {
        key: decryptedKey,
        iv: decryptedIV
      };
    } catch (error) {
      throw new Error(`密钥解密失败: ${error.message}`);
    }
  }

  /**
   * 保存加密文件
   * @param {Buffer} encryptedData - 加密的数据
   * @param {string} filename - 文件名
   * @param {string} uploadPath - 上传路径
   * @returns {string} 保存的文件路径
   */
  async saveEncryptedFile(encryptedData, filename, uploadPath) {
    try {
      // 确保上传目录存在
      await fs.mkdir(uploadPath, { recursive: true });
      
      // 生成安全的文件名
      const safeFilename = `${crypto.randomUUID()}.bin`;
      const filePath = path.join(uploadPath, safeFilename);
      
      // 保存加密文件
      await fs.writeFile(filePath, encryptedData);
      
      return filePath;
    } catch (error) {
      throw new Error(`文件保存失败: ${error.message}`);
    }
  }

  /**
   * 读取加密文件
   * @param {string} filePath - 文件路径
   * @returns {Buffer} 加密的数据
   */
  async readEncryptedFile(filePath) {
    try {
      const data = await fs.readFile(filePath);
      return data;
    } catch (error) {
      throw new Error(`文件读取失败: ${error.message}`);
    }
  }

  /**
   * 生成文件哈希
   * @param {Buffer} data - 文件数据
   * @returns {string} SHA-256 哈希值
   */
  generateFileHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 验证文件完整性
   * @param {Buffer} data - 文件数据
   * @param {string} expectedHash - 期望的哈希值
   * @returns {boolean} 验证结果
   */
  verifyFileIntegrity(data, expectedHash) {
    const actualHash = this.generateFileHash(data);
    return actualHash === expectedHash;
  }
}

module.exports = ImageCrypto;