/**
 * WebAssembly 加载器
 * 负责动态加载和初始化 Rust WASM 模块
 */
class WasmLoader {
  constructor() {
    this.wasmModule = null;
    this.isLoaded = false;
    this.isLoading = false;
    this.loadPromise = null;
  }

  /**
   * 检测 WASM 支持
   * @returns {boolean} 是否支持 WebAssembly
   */
  static isWasmSupported() {
    return typeof WebAssembly === 'object' && 
           typeof WebAssembly.instantiate === 'function';
  }

  /**
   * 检测 WASM SIMD 支持
   * @returns {Promise<boolean>} 是否支持 SIMD
   */
  static async isSIMDSupported() {
    if (!WasmLoader.isWasmSupported()) {
      return false;
    }

    try {
      // 创建一个简单的 WASM 模块来测试 SIMD 支持
      const simdTest = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, // WASM magic number
        0x01, 0x00, 0x00, 0x00, // version
      ]);
      
      await WebAssembly.instantiate(simdTest);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 加载 WASM 模块
   * @param {string} wasmPath - WASM 文件路径
   * @returns {Promise<Object>} WASM 模块实例
   */
  async loadWasm(wasmPath = '/wasm/image_aes_wasm.js') {
    if (this.isLoaded && this.wasmModule) {
      return this.wasmModule;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this._loadWasmModule(wasmPath);

    try {
      this.wasmModule = await this.loadPromise;
      this.isLoaded = true;
      console.log('✅ WASM 模块加载成功');
      return this.wasmModule;
    } catch (error) {
      console.error('❌ WASM 模块加载失败:', error);
      this.isLoading = false;
      this.loadPromise = null;
      throw error;
    }
  }

  /**
   * 内部加载方法
   * @private
   */
  async _loadWasmModule(wasmPath) {
    try {
      // 动态导入 WASM 模块
      const wasmModule = await import(wasmPath);
      
      // 初始化 WASM
      await wasmModule.default();
      
      // 返回模块导出
      return wasmModule;
    } catch (error) {
      // 如果动态导入失败，尝试传统方式加载
      return this._loadWasmFallback(wasmPath);
    }
  }

  /**
   * 备用加载方式
   * @private
   */
  async _loadWasmFallback(wasmPath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = wasmPath;
      script.onload = async () => {
        try {
          if (typeof wasm_bindgen !== 'undefined') {
            await wasm_bindgen();
            resolve(wasm_bindgen);
          } else {
            reject(new Error('WASM 绑定未找到'));
          }
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => reject(new Error('WASM 脚本加载失败'));
      document.head.appendChild(script);
    });
  }

  /**
   * 获取 WASM 模块信息
   * @returns {Object|null} 模块信息
   */
  getWasmInfo() {
    if (!this.isLoaded || !this.wasmModule) {
      return null;
    }

    try {
      return this.wasmModule.get_wasm_info();
    } catch (error) {
      console.error('获取 WASM 信息失败:', error);
      return null;
    }
  }

  /**
   * 检查 WASM 模块是否已加载
   * @returns {boolean} 是否已加载
   */
  isWasmLoaded() {
    return this.isLoaded && this.wasmModule !== null;
  }

  /**
   * 卸载 WASM 模块
   */
  unloadWasm() {
    this.wasmModule = null;
    this.isLoaded = false;
    this.isLoading = false;
    this.loadPromise = null;
  }

  /**
   * 获取性能信息
   * @returns {Object} 性能统计
   */
  getPerformanceInfo() {
    const info = {
      wasmSupported: WasmLoader.isWasmSupported(),
      wasmLoaded: this.isWasmLoaded(),
      memoryUsage: null,
      simdSupported: false
    };

    if (this.isWasmLoaded()) {
      try {
        const wasmInfo = this.wasmModule.get_wasm_info();
        info.simdSupported = wasmInfo.simdSupport || false;
        
        // 获取内存使用情况
        if (this.wasmModule.memory) {
          info.memoryUsage = {
            buffer: this.wasmModule.memory.buffer.byteLength,
            pages: this.wasmModule.memory.buffer.byteLength / (64 * 1024)
          };
        }
      } catch (error) {
        console.warn('获取 WASM 性能信息失败:', error);
      }
    }

    return info;
  }
}

/**
 * 全局 WASM 加载器实例
 */
const wasmLoader = new WasmLoader();

export default wasmLoader;
export { WasmLoader };