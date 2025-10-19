/**
 * 测试密钥生成工具
 * 用于生成安全的随机密钥，替代硬编码密钥
 */

class TestKeyGenerator {
  /**
   * 生成随机的AES-256密钥 (32字节)
   * @returns {string} Base64编码的密钥
   */
  static generateKey() {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    return btoa(String.fromCharCode(...key));
  }

  /**
   * 生成随机的IV (16字节)
   * @returns {string} Base64编码的IV
   */
  static generateIV() {
    const iv = new Uint8Array(16);
    crypto.getRandomValues(iv);
    return btoa(String.fromCharCode(...iv));
  }

  /**
   * 生成测试用的密钥对
   * @returns {Object} 包含key和iv的对象
   */
  static generateKeyPair() {
    return {
      key: this.generateKey(),
      iv: this.generateIV()
    };
  }

  /**
   * 为了测试一致性，生成基于种子的确定性密钥
   * 注意：这仅用于测试，不应在生产环境使用
   * @param {string} seed - 种子字符串
   * @returns {Object} 包含key和iv的对象
   */
  static generateDeterministicKeyPair(seed = 'test-seed') {
    // 使用简单的哈希函数生成确定性密钥
    const hash = this._simpleHash(seed);
    
    // 生成32字节密钥
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = (hash + i) % 256;
    }
    
    // 生成16字节IV
    const ivBytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      ivBytes[i] = (hash + i + 32) % 256;
    }
    
    return {
      key: btoa(String.fromCharCode(...keyBytes)),
      iv: btoa(String.fromCharCode(...ivBytes))
    };
  }

  /**
   * 简单的哈希函数（仅用于测试）
   * @private
   */
  static _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash);
  }

  /**
   * 验证密钥格式是否正确
   * @param {string} keyBase64 - Base64编码的密钥
   * @param {number} expectedLength - 期望的字节长度
   * @returns {boolean} 是否有效
   */
  static validateKey(keyBase64, expectedLength) {
    try {
      const decoded = atob(keyBase64);
      return decoded.length === expectedLength;
    } catch (error) {
      return false;
    }
  }

  /**
   * 生成用于性能测试的密钥集合
   * @param {number} count - 生成的密钥对数量
   * @returns {Array} 密钥对数组
   */
  static generateTestKeySet(count = 10) {
    const keySet = [];
    for (let i = 0; i < count; i++) {
      keySet.push(this.generateKeyPair());
    }
    return keySet;
  }
}

// 导出用于测试
window.TestKeyGenerator = TestKeyGenerator;

export default TestKeyGenerator;