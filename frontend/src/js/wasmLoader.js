import { getConfig } from './config.js';

/**
 * WebAssembly 加载器
 * 负责动态加载和初始化 Rust WASM 模块
 */
class WasmLoader {
    constructor() {
        this.wasmModule = null;
        this.isLoaded = false;
        this.loadedScripts = []; // 添加这个属性来跟踪加载的脚本
        this.isLoading = false;
        this.loadPromise = null;
        this.scriptElement = null; // 跟踪已加载的script元素
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
  async loadWasm(wasmPath = getConfig('wasm.defaultPath', '/wasm/image_aes_wasm.js')) {
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
   * 内部加载方法 - 优化版本
   * 移除双重加载策略，使用单一高效的加载方式
   * @private
   */
  async _loadWasmModule(wasmPath) {
    try {
      // 清理之前的资源
      this._cleanupPreviousLoad();

      // 从完整路径中提取目录路径
      const wasmDir = wasmPath.replace('/image_aes_wasm.js', '');
      const wasmBgPath = `${wasmDir}/image_aes_wasm_bg.wasm`;

      // 优先使用ES模块方式加载（现代浏览器推荐）
      if (this._supportsESModules()) {
        try {
          const wasmModule = await import(`${wasmDir}/image_aes_wasm.js`);
          if (wasmModule.default) {
            await wasmModule.default({
              module_or_path: wasmBgPath
            });
            return wasmModule;
          }
        } catch (esModuleError) {
          console.warn('ES模块加载失败，回退到脚本加载:', esModuleError.message);
        }
      }

      // 回退到传统脚本加载方式
      return await this._loadViaScript(wasmPath, wasmBgPath);
      
    } catch (error) {
      throw new Error(`WASM模块加载失败: ${error.message}`);
    }
  }

  /**
   * 清理之前的加载资源
   * @private
   */
  _cleanupPreviousLoad() {
    // 清理之前的脚本元素
    const existingScript = document.querySelector(`script[src*="image_aes_wasm.js"]`);
    if (existingScript) {
      existingScript.remove();
    }

    // 清理全局变量
    if (window.wasm_bindgen) {
      delete window.wasm_bindgen;
    }

    // 清理跟踪的脚本
    this.loadedScripts.forEach(script => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    });
    this.loadedScripts = [];
  }

  /**
   * 检测ES模块支持
   * @private
   */
  _supportsESModules() {
    const script = document.createElement('script');
    return 'noModule' in script;
  }

  /**
   * 通过脚本标签加载WASM
   * @private
   */
  async _loadViaScript(wasmPath, wasmBgPath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = wasmPath;
      script.type = 'text/javascript';
      
      // 记录脚本元素以便后续清理
      this.loadedScripts.push(script);
      this.scriptElement = script;

      script.onload = async () => {
        try {
          // 检查全局函数是否可用（移除硬编码延迟）
          if (typeof window.wasm_bindgen !== 'function') {
            reject(new Error('wasm_bindgen函数未在全局作用域中找到'));
            return;
          }

          // 初始化WASM模块
          await window.wasm_bindgen({
            module_or_path: wasmBgPath
          });
          
          resolve(window.wasm_bindgen);
        } catch (error) {
          reject(new Error(`WASM初始化失败: ${error.message}`));
        }
      };
      
      script.onerror = () => {
        reject(new Error('WASM JavaScript文件加载失败'));
      };
      
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
    // 清理script元素
    if (this.scriptElement && this.scriptElement.parentNode) {
      this.scriptElement.parentNode.removeChild(this.scriptElement);
      this.scriptElement = null;
    }
    
    // 清理全局变量
    if (typeof window.wasm_bindgen !== 'undefined') {
      delete window.wasm_bindgen;
    }
    
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