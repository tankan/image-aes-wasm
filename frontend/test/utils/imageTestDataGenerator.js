/**
 * 图片测试数据生成器
 * 生成真实的图片数据用于内存分析测试
 */

import TestKeyGenerator from './testKeyGenerator.js';

class ImageTestDataGenerator {
  /**
   * 生成模拟的图片数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {string} format - 图片格式 ('png', 'jpeg', 'bmp')
   * @returns {Uint8Array} 模拟的图片二进制数据
   */
  static generateImageData(width = 256, height = 256, format = 'png') {
    const pixelCount = width * height;
    let imageData;

    switch (format.toLowerCase()) {
      case 'png':
        imageData = this._generatePNGData(width, height);
        break;
      case 'jpeg':
        imageData = this._generateJPEGData(width, height);
        break;
      case 'bmp':
        imageData = this._generateBMPData(width, height);
        break;
      default:
        imageData = this._generateRawImageData(pixelCount * 4); // RGBA
    }

    return imageData;
  }

  /**
   * 生成模拟的PNG数据
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {Uint8Array} PNG格式的数据
   */
  static _generatePNGData(width, height) {
    // PNG文件头
    const pngSignature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // IHDR chunk (图片头信息)
    const ihdrData = new Uint8Array(25);
    ihdrData.set([0x00, 0x00, 0x00, 0x0D]); // chunk length
    ihdrData.set([0x49, 0x48, 0x44, 0x52], 4); // "IHDR"
    
    // 宽度和高度 (big-endian)
    const widthBytes = new Uint8Array(4);
    const heightBytes = new Uint8Array(4);
    new DataView(widthBytes.buffer).setUint32(0, width, false);
    new DataView(heightBytes.buffer).setUint32(0, height, false);
    
    ihdrData.set(widthBytes, 8);
    ihdrData.set(heightBytes, 12);
    ihdrData.set([0x08, 0x02, 0x00, 0x00, 0x00], 16); // bit depth, color type, compression, filter, interlace
    
    // 生成像素数据
    const pixelData = this._generateColorfulPixelData(width, height);
    
    // 简化的IDAT chunk
    const idatHeader = new Uint8Array(8);
    new DataView(idatHeader.buffer).setUint32(0, pixelData.length, false);
    idatHeader.set([0x49, 0x44, 0x41, 0x54], 4); // "IDAT"
    
    // IEND chunk
    const iendChunk = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
    
    // 组合所有数据
    const totalLength = pngSignature.length + ihdrData.length + idatHeader.length + pixelData.length + iendChunk.length;
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    result.set(pngSignature, offset); offset += pngSignature.length;
    result.set(ihdrData, offset); offset += ihdrData.length;
    result.set(idatHeader, offset); offset += idatHeader.length;
    result.set(pixelData, offset); offset += pixelData.length;
    result.set(iendChunk, offset);
    
    return result;
  }

  /**
   * 生成模拟的JPEG数据
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {Uint8Array} JPEG格式的数据
   */
  static _generateJPEGData(width, height) {
    // JPEG文件头
    const jpegHeader = new Uint8Array([
      0xFF, 0xD8, // SOI (Start of Image)
      0xFF, 0xE0, // APP0
      0x00, 0x10, // APP0 length
      0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
      0x01, 0x01, // version
      0x01, // units
      0x00, 0x48, 0x00, 0x48, // X and Y density
      0x00, 0x00 // thumbnail width and height
    ]);

    // 生成压缩的图像数据
    const imageData = this._generateColorfulPixelData(width, height);
    
    // JPEG结束标记
    const jpegEnd = new Uint8Array([0xFF, 0xD9]); // EOI (End of Image)
    
    // 组合数据
    const result = new Uint8Array(jpegHeader.length + imageData.length + jpegEnd.length);
    let offset = 0;
    result.set(jpegHeader, offset); offset += jpegHeader.length;
    result.set(imageData, offset); offset += imageData.length;
    result.set(jpegEnd, offset);
    
    return result;
  }

  /**
   * 生成模拟的BMP数据
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {Uint8Array} BMP格式的数据
   */
  static _generateBMPData(width, height) {
    const pixelDataSize = width * height * 3; // 24-bit RGB
    const fileSize = 54 + pixelDataSize; // BMP header is 54 bytes
    
    const bmpHeader = new Uint8Array(54);
    
    // BMP file header (14 bytes)
    bmpHeader.set([0x42, 0x4D], 0); // "BM"
    new DataView(bmpHeader.buffer).setUint32(2, fileSize, true); // file size
    new DataView(bmpHeader.buffer).setUint32(10, 54, true); // offset to pixel data
    
    // DIB header (40 bytes)
    new DataView(bmpHeader.buffer).setUint32(14, 40, true); // DIB header size
    new DataView(bmpHeader.buffer).setInt32(18, width, true); // width
    new DataView(bmpHeader.buffer).setInt32(22, height, true); // height
    new DataView(bmpHeader.buffer).setUint16(26, 1, true); // color planes
    new DataView(bmpHeader.buffer).setUint16(28, 24, true); // bits per pixel
    
    // 生成像素数据 (BGR format for BMP)
    const pixelData = this._generateBGRPixelData(width, height);
    
    // 组合数据
    const result = new Uint8Array(fileSize);
    result.set(bmpHeader, 0);
    result.set(pixelData, 54);
    
    return result;
  }

  /**
   * 生成彩色像素数据 (RGB)
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {Uint8Array} 像素数据
   */
  static _generateColorfulPixelData(width, height) {
    const pixelData = new Uint8Array(width * height * 3);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 3;
        
        // 生成渐变色彩
        const r = Math.floor((x / width) * 255);
        const g = Math.floor((y / height) * 255);
        const b = Math.floor(((x + y) / (width + height)) * 255);
        
        pixelData[index] = r;     // Red
        pixelData[index + 1] = g; // Green
        pixelData[index + 2] = b; // Blue
      }
    }
    
    return pixelData;
  }

  /**
   * 生成BGR格式的像素数据
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {Uint8Array} BGR像素数据
   */
  static _generateBGRPixelData(width, height) {
    const pixelData = new Uint8Array(width * height * 3);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 3;
        
        // 生成渐变色彩 (BGR order)
        const r = Math.floor((x / width) * 255);
        const g = Math.floor((y / height) * 255);
        const b = Math.floor(((x + y) / (width + height)) * 255);
        
        pixelData[index] = b;     // Blue
        pixelData[index + 1] = g; // Green
        pixelData[index + 2] = r; // Red
      }
    }
    
    return pixelData;
  }

  /**
   * 生成原始图像数据
   * @param {number} size - 数据大小
   * @returns {Uint8Array} 原始数据
   */
  static _generateRawImageData(size) {
    const data = new Uint8Array(size);
    
    // 生成有规律的图像数据，而不是完全随机
    for (let i = 0; i < size; i += 4) {
      const pattern = Math.floor(i / 4);
      data[i] = (pattern * 17) % 256;     // Red
      data[i + 1] = (pattern * 31) % 256; // Green
      data[i + 2] = (pattern * 47) % 256; // Blue
      data[i + 3] = 255;                  // Alpha
    }
    
    return data;
  }

  /**
   * 根据目标大小生成图像数据
   * @param {number} targetSize - 目标文件大小（字节）
   * @param {string} format - 图像格式
   * @returns {Uint8Array} 图像数据
   */
  static generateImageDataBySize(targetSize, format = 'png') {
    // 估算需要的图像尺寸
    let estimatedPixels;
    
    switch (format.toLowerCase()) {
      case 'png':
        estimatedPixels = Math.floor(targetSize / 4); // 大约4字节每像素
        break;
      case 'jpeg':
        estimatedPixels = Math.floor(targetSize / 2); // 大约2字节每像素（压缩）
        break;
      case 'bmp':
        estimatedPixels = Math.floor(targetSize / 3); // 3字节每像素
        break;
      default:
        estimatedPixels = Math.floor(targetSize / 4);
    }
    
    const dimension = Math.floor(Math.sqrt(estimatedPixels));
    let imageData = this.generateImageData(dimension, dimension, format);
    
    // 如果生成的数据太小，填充到目标大小
    if (imageData.length < targetSize) {
      const paddedData = new Uint8Array(targetSize);
      paddedData.set(imageData, 0);
      
      // 用重复的图像数据填充剩余空间
      for (let i = imageData.length; i < targetSize; i++) {
        paddedData[i] = imageData[i % imageData.length];
      }
      
      return paddedData;
    }
    
    // 如果太大，截取到目标大小
    return imageData.slice(0, targetSize);
  }

  /**
   * 使用CryptoJS加密图像数据
   * @param {Uint8Array} imageData - 图像数据
   * @param {string} keyBase64 - Base64编码的密钥
   * @param {string} ivBase64 - Base64编码的IV
   * @returns {Uint8Array} 加密后的数据
   */
  static encryptImageData(imageData, keyBase64, ivBase64) {
    const CryptoJS = window.CryptoJS;
    if (!CryptoJS) {
      throw new Error('CryptoJS not available');
    }

    const key = CryptoJS.enc.Base64.parse(keyBase64);
    const iv = CryptoJS.enc.Base64.parse(ivBase64);
    
    // 将Uint8Array转换为WordArray
    const wordArray = CryptoJS.lib.WordArray.create(imageData);
    
    // 加密
    const encrypted = CryptoJS.AES.encrypt(wordArray, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    // 转换为Uint8Array
    const encryptedWords = encrypted.ciphertext.words;
    const encryptedBytes = encrypted.ciphertext.sigBytes;
    const result = new Uint8Array(encryptedBytes);
    
    for (let i = 0; i < encryptedBytes; i++) {
      const wordIndex = Math.floor(i / 4);
      const byteIndex = i % 4;
      result[i] = (encryptedWords[wordIndex] >>> (24 - byteIndex * 8)) & 0xFF;
    }
    
    return result;
  }

  /**
   * 生成完整的测试数据集
   * @param {number} targetSize - 目标大小
   * @param {string} format - 图像格式
   * @param {string} seed - 种子字符串
   * @returns {Object} 包含原始数据、加密数据、密钥和IV的对象
   */
  static generateTestDataSet(targetSize, format = 'png', seed = null) {
    // 生成图像数据
    const originalData = this.generateImageDataBySize(targetSize, format);
    
    // 生成密钥对
    const keyPair = seed ? 
      TestKeyGenerator.generateDeterministicKeyPair(seed) : 
      TestKeyGenerator.generateKeyPair();
    
    // 加密数据
    const encryptedData = this.encryptImageData(originalData, keyPair.key, keyPair.iv);
    
    return {
      original: originalData,
      encrypted: encryptedData,
      key: keyPair.key,
      iv: keyPair.iv,
      format: format,
      originalSize: originalData.length,
      encryptedSize: encryptedData.length
    };
  }
}

// 导出用于测试
window.ImageTestDataGenerator = ImageTestDataGenerator;

export default ImageTestDataGenerator;