/**
 * Canvas 图片渲染器
 * 提供安全的图片显示和防盗链保护功能
 */
class CanvasRenderer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.imageData = null;
    this.originalImage = null;
    this.watermarkEnabled = true;
    this.protectionEnabled = true;
  }

  /**
   * 初始化Canvas
   * @param {HTMLCanvasElement|string} canvas - Canvas元素或选择器
   * @param {Object} options - 配置选项
   */
  initialize(canvas, options = {}) {
    const {
      watermark = true,
      protection = true,
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 0.9
    } = options;

    // 获取Canvas元素
    if (typeof canvas === 'string') {
      this.canvas = document.querySelector(canvas);
    } else {
      this.canvas = canvas;
    }

    if (!this.canvas) {
      throw new Error('Canvas元素未找到');
    }

    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.watermarkEnabled = watermark;
    this.protectionEnabled = protection;
    this.maxWidth = maxWidth;
    this.maxHeight = maxHeight;
    this.quality = quality;

    // 设置Canvas属性
    this._setupCanvas();
    
    // 启用保护机制
    if (this.protectionEnabled) {
      this._enableProtection();
    }
  }

  /**
   * 渲染解密后的图片
   * @param {Uint8Array} imageData - 图片数据
   * @param {Object} options - 渲染选项
   * @returns {Promise<Object>} 渲染结果
   */
  async renderImage(imageData, options = {}) {
    const {
      fit = 'contain', // 'contain' | 'cover' | 'fill' | 'none'
      watermarkText = '受保护的图片',
      watermarkOpacity = 0.3,
      backgroundColor = '#f0f0f0'
    } = options;

    try {
      // 创建图片对象
      const img = await this._createImageFromData(imageData);
      this.originalImage = img;

      // 计算渲染尺寸
      const dimensions = this._calculateDimensions(img, fit);
      
      // 设置Canvas尺寸
      this._resizeCanvas(dimensions.canvasWidth, dimensions.canvasHeight);
      
      // 清空Canvas
      this._clearCanvas(backgroundColor);
      
      // 渲染图片
      this.ctx.drawImage(
        img,
        dimensions.x,
        dimensions.y,
        dimensions.width,
        dimensions.height
      );

      // 添加水印
      if (this.watermarkEnabled) {
        this._addWatermark(watermarkText, watermarkOpacity);
      }

      // 保存图片数据
      this.imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      return {
        success: true,
        dimensions: {
          original: { width: img.width, height: img.height },
          rendered: { width: this.canvas.width, height: this.canvas.height }
        },
        fileSize: imageData.length
      };
    } catch (error) {
      throw new Error(`图片渲染失败: ${error.message}`);
    }
  }

  /**
   * 添加水印
   * @param {string} text - 水印文字
   * @param {number} opacity - 透明度
   */
  _addWatermark(text, opacity = 0.3) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    
    ctx.save();
    
    // 设置水印样式
    ctx.globalAlpha = opacity;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.font = `${Math.max(16, canvas.width / 40)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 旋转文字
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6); // -30度
    
    // 绘制水印
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    
    // 添加多个水印
    const spacing = Math.max(200, canvas.width / 4);
    for (let x = -canvas.width; x < canvas.width; x += spacing) {
      for (let y = -canvas.height; y < canvas.height; y += spacing) {
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }
    }
    
    ctx.restore();
  }

  /**
   * 启用保护机制
   */
  _enableProtection() {
    if (!this.canvas) return;

    // 禁用右键菜单
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });

    // 禁用拖拽
    this.canvas.addEventListener('dragstart', (e) => {
      e.preventDefault();
      return false;
    });

    // 禁用选择
    this.canvas.style.userSelect = 'none';
    this.canvas.style.webkitUserSelect = 'none';
    this.canvas.style.mozUserSelect = 'none';
    this.canvas.style.msUserSelect = 'none';

    // 禁用打印屏幕（部分浏览器）
    document.addEventListener('keydown', (e) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        this._showProtectionWarning('截图功能已被禁用');
      }
    });

    // 检测开发者工具
    this._detectDevTools();
  }

  /**
   * 检测开发者工具
   */
  _detectDevTools() {
    let devtools = { open: false, orientation: null };
    
    setInterval(() => {
      if (window.outerHeight - window.innerHeight > 200 || 
          window.outerWidth - window.innerWidth > 200) {
        if (!devtools.open) {
          devtools.open = true;
          this._showProtectionWarning('检测到开发者工具，图片已隐藏');
          this._hideImage();
        }
      } else {
        if (devtools.open) {
          devtools.open = false;
          this._showImage();
        }
      }
    }, 500);
  }

  /**
   * 隐藏图片
   */
  _hideImage() {
    if (this.canvas) {
      this.canvas.style.filter = 'blur(20px)';
      this.canvas.style.opacity = '0.3';
    }
  }

  /**
   * 显示图片
   */
  _showImage() {
    if (this.canvas) {
      this.canvas.style.filter = 'none';
      this.canvas.style.opacity = '1';
    }
  }

  /**
   * 显示保护警告
   */
  _showProtectionWarning(message) {
    // 创建警告提示
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff4444;
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    warning.textContent = message;
    
    document.body.appendChild(warning);
    
    setTimeout(() => {
      if (warning.parentNode) {
        warning.parentNode.removeChild(warning);
      }
    }, 3000);
  }

  /**
   * 设置Canvas属性
   */
  _setupCanvas() {
    // 高DPI支持
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    
    this.ctx.scale(dpr, dpr);
    
    // 图像平滑
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /**
   * 从数据创建图片
   */
  _createImageFromData(imageData) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([imageData]);
      const url = URL.createObjectURL(blob);
      
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片加载失败'));
      };
      img.src = url;
    });
  }

  /**
   * 计算渲染尺寸
   */
  _calculateDimensions(img, fit) {
    const canvasRect = this.canvas.getBoundingClientRect();
    // 设置更大的默认显示尺寸
    const minDisplayWidth = 800;
    const minDisplayHeight = 600;
    const canvasWidth = Math.max(Math.min(canvasRect.width, this.maxWidth), minDisplayWidth);
    const canvasHeight = Math.max(Math.min(canvasRect.height, this.maxHeight), minDisplayHeight);
    
    let width, height, x = 0, y = 0;
    
    switch (fit) {
      case 'contain':
        const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
        width = img.width * scale;
        height = img.height * scale;
        x = (canvasWidth - width) / 2;
        y = (canvasHeight - height) / 2;
        break;
        
      case 'cover':
        const coverScale = Math.max(canvasWidth / img.width, canvasHeight / img.height);
        width = img.width * coverScale;
        height = img.height * coverScale;
        x = (canvasWidth - width) / 2;
        y = (canvasHeight - height) / 2;
        break;
        
      case 'fill':
        width = canvasWidth;
        height = canvasHeight;
        break;
        
      case 'none':
      default:
        // 对于原始尺寸，也确保有最小显示尺寸
        width = Math.max(img.width, minDisplayWidth * 0.8);
        height = Math.max(img.height, minDisplayHeight * 0.8);
        x = (canvasWidth - width) / 2;
        y = (canvasHeight - height) / 2;
        break;
    }
    
    return { width, height, x, y, canvasWidth, canvasHeight };
  }

  /**
   * 调整Canvas尺寸
   */
  _resizeCanvas(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * 清空Canvas
   */
  _clearCanvas(backgroundColor = '#ffffff') {
    this.ctx.fillStyle = backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * 获取Canvas数据URL（受保护）
   * @param {string} format - 图片格式
   * @param {number} quality - 质量
   * @returns {string|null} 数据URL或null（如果被保护）
   */
  getDataURL(format = 'image/png', quality = 0.8) {
    if (this.protectionEnabled) {
      this._showProtectionWarning('图片导出已被禁用');
      return null;
    }
    
    return this.canvas.toDataURL(format, quality);
  }

  /**
   * 获取渲染信息
   */
  getRenderInfo() {
    return {
      canvasSize: {
        width: this.canvas?.width || 0,
        height: this.canvas?.height || 0
      },
      originalSize: this.originalImage ? {
        width: this.originalImage.width,
        height: this.originalImage.height
      } : null,
      watermarkEnabled: this.watermarkEnabled,
      protectionEnabled: this.protectionEnabled
    };
  }

  /**
   * 清理资源
   */
  dispose() {
    if (this.canvas) {
      this._clearCanvas();
    }
    
    this.canvas = null;
    this.ctx = null;
    this.imageData = null;
    this.originalImage = null;
  }
}

export default CanvasRenderer;