import ImageViewer from './imageViewer.js';

/**
 * 主应用程序类
 * 管理整个前端应用的状态和交互
 * 使用最新的ES2024特性和现代JavaScript语法
 */
class App {
  // 使用私有字段 (ES2022)
  #imageViewer = null;
  #currentTab = 'upload';
  #isInitialized = false;
  #lastUploadResult = null;

  constructor() {
    // 使用箭头函数自动绑定this (ES2015+)
    this.handleTabClick = (e) => {
      const tabName = e.target.dataset.tab;
      if (tabName) {
        this.switchTab(tabName);
      }
    };

    this.handleFileSelect = (e) => {
      const file = e.target.files[0];
      if (file) {
        this.uploadFile(file);
      }
    };

    this.handleFileDrop = (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.uploadFile(files[0]);
      }
    };

    this.handleDragOver = (e) => {
      e.preventDefault();
      e.currentTarget.classList.add('dragover');
    };

    this.handleLoadImage = async () => {
      if (!this.#isInitialized) {
        this.showNotification('系统尚未初始化完成', 'warning');
        return;
      }

      const imageId = document.getElementById('viewImageId').value.trim();
      const userId = document.getElementById('viewUserId').value.trim();
      const token = document.getElementById('viewToken').value.trim();

      if (!imageId || !userId || !token) {
        this.showNotification('请填写完整的图片信息', 'warning');
        return;
      }

      try {
        this.showViewProgress();
        const startTime = Date.now();
        
        const result = await this.#imageViewer.loadImage(imageId, token, userId, {
          useChunked: true
        });
        
        const endTime = Date.now();
        const processTime = endTime - startTime;
        
        this.updateImageInfo(result, processTime);
      } catch (error) {
        console.error('加载失败:', error);
      }
    };
    this.handleUploadProgress = (data) => {
      if (data.stage === 'upload') {
        this.updateProgress(data.progress, '上传中...');
      }
    };
    this.handleViewProgress = (data) => {
      if (data.stage) {
        this.updateViewProgress(data.stage, data.progress);
      }
    };
  }

  // Getter 和 Setter 使用私有字段
  get imageViewer() {
    return this.#imageViewer;
  }

  get currentTab() {
    return this.#currentTab;
  }

  get isInitialized() {
    return this.#isInitialized;
  }

  /**
   * 初始化应用 - 使用现代异步语法
   */
  async init() {
    try {
      // 显示加载状态
      this.showNotification('正在初始化系统...', 'info');

      // 初始化图片查看器
      this.#imageViewer = new ImageViewer({
        canvasSelector: '#imageCanvas',
        enableWatermark: true,
        enableProtection: true
      });

      // 设置事件监听器
      this.setupEventListeners();

      // 初始化查看器
      const initResult = await this.#imageViewer.initialize();
      
      // 更新系统信息显示
      this.updateSystemInfo(initResult);

      this.#isInitialized = true;
      this.showNotification('系统初始化成功！', 'success');

      console.log('🚀 应用初始化完成', initResult);
    } catch (error) {
      console.error('❌ 应用初始化失败:', error);
      this.showNotification(`初始化失败: ${error.message}`, 'error');
    }
  }

  /**
   * 设置事件监听器 - 使用现代事件处理
   */
  setupEventListeners() {
    // 选项卡切换 - 使用 forEach 和箭头函数
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', this.handleTabClick);
    });

    // 文件上传 - 使用解构赋值和可选链
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    
    fileInput?.addEventListener('change', this.handleFileSelect);
    uploadArea?.addEventListener('click', () => fileInput.click());
    uploadArea?.addEventListener('dragover', this.handleDragOver);
    uploadArea?.addEventListener('drop', this.handleFileDrop);
    uploadArea?.addEventListener('dragleave', (e) => {
      e.currentTarget.classList.remove('dragover');
    });

    // 图片查看
    document.getElementById('loadImageBtn')?.addEventListener('click', this.handleLoadImage);

    // 结果操作 - 使用可选链操作符
    document.getElementById('viewUploadedImage')?.addEventListener('click', () => {
      this.switchToViewTab();
    });

    document.getElementById('copyImageId')?.addEventListener('click', () => {
      const imageId = document.getElementById('resultImageId')?.textContent;
      if (imageId) this.copyToClipboard(imageId);
    });

    // 图片库
    document.getElementById('loadGalleryBtn')?.addEventListener('click', () => {
      this.loadGallery();
    });

    // 测试功能 - 使用箭头函数简化
    const testButtons = [
      { id: 'runSystemTest', handler: () => this.runSystemTest() },
      { id: 'runPerformanceTest', handler: () => this.runPerformanceTest() },
      { id: 'clearTestResults', handler: () => this.clearTestResults() }
    ];

    testButtons.forEach(({ id, handler }) => {
      document.getElementById(id)?.addEventListener('click', handler);
    });

    // 图片查看器事件 - 使用可选链
    if (this.#imageViewer) {
      this.#imageViewer.on('uploadStart', this.handleUploadProgress);
      this.#imageViewer.on('progress', this.handleUploadProgress);
      this.#imageViewer.on('uploadComplete', (result) => {
        this.handleUploadComplete(result);
      });
      this.#imageViewer.on('uploadError', (error) => {
        this.showNotification(`上传失败: ${error.error}`, 'error');
        this.hideProgress();
      });

      this.#imageViewer.on('loadStart', this.handleViewProgress);
      this.#imageViewer.on('progress', this.handleViewProgress);
      this.#imageViewer.on('loadComplete', (result) => {
        this.handleLoadComplete(result);
      });
      this.#imageViewer.on('loadError', (error) => {
        this.showNotification(`加载失败: ${error.error}`, 'error');
        this.hideViewProgress();
      });
    }
  }

  /**
   * 处理选项卡点击
   */
  handleTabClick(e) {
    const tabName = e.target.dataset.tab;
    if (tabName) {
      this.switchTab(tabName);
    }
  }

  /**
   * 切换选项卡
   */
  switchTab(tabName) {
    // 更新按钮状态
    document.querySelectorAll('.tab-button').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabName);
    });

    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === tabName);
    });

    this.#currentTab = tabName;
  }

  /**
   * 切换到查看选项卡
   */
  switchToViewTab() {
    const imageId = document.getElementById('resultImageId').textContent;
    const userId = document.getElementById('userId').value;
    
    // 切换到查看选项卡
    this.switchTab('view');
    
    // 填充表单
    document.getElementById('viewImageId').value = imageId;
    document.getElementById('viewUserId').value = userId;
    
    // 如果有访问令牌，也填充
    const token = this.#lastUploadResult?.accessToken;
    if (token) {
      document.getElementById('viewToken').value = token;
    }
  }

  /**
   * 处理文件选择
   */
  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      this.uploadFile(file);
    }
  }

  /**
   * 处理文件拖拽
   */
  handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.uploadFile(files[0]);
    }
  }

  /**
   * 处理拖拽悬停
   */
  handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  }

  /**
   * 上传文件
   */
  async uploadFile(file) {
    if (!this.isInitialized) {
      this.showNotification('系统尚未初始化完成', 'warning');
      return;
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      this.showNotification('请选择图片文件', 'error');
      return;
    }

    // 验证文件大小
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.showNotification('文件大小不能超过10MB', 'error');
      return;
    }

    const userId = document.getElementById('userId').value || 'anonymous';

    try {
      this.showProgress();
      const result = await this.#imageViewer.uploadImage(file, userId, {
        autoLoad: false
      });
      
      this.lastUploadResult = result;
    } catch (error) {
      console.error('上传失败:', error);
    }
  }

  /**
   * 处理图片加载
   */
  async handleLoadImage() {
    if (!this.isInitialized) {
      this.showNotification('系统尚未初始化完成', 'warning');
      return;
    }

    const imageId = document.getElementById('viewImageId').value.trim();
    const userId = document.getElementById('viewUserId').value.trim();
    const token = document.getElementById('viewToken').value.trim();

    if (!imageId || !userId || !token) {
      this.showNotification('请填写完整的图片信息', 'warning');
      return;
    }

    try {
      this.showViewProgress();
      const startTime = Date.now();
      
      const result = await this.imageViewer.loadImage(imageId, token, userId, {
        useChunked: true
      });
      
      const endTime = Date.now();
      const processTime = endTime - startTime;
      
      this.updateImageInfo(result, processTime);
    } catch (error) {
      console.error('加载失败:', error);
    }
  }

  /**
   * 加载图片库
   */
  async loadGallery() {
    if (!this.isInitialized) {
      this.showNotification('系统尚未初始化完成', 'warning');
      return;
    }

    const userId = document.getElementById('galleryUserId').value.trim();
    const token = document.getElementById('galleryToken').value.trim();

    if (!userId || !token) {
      this.showNotification('请填写用户ID和访问令牌', 'warning');
      return;
    }

    try {
      const result = await this.#imageViewer.getUserImages(userId, token);
      this.displayGallery(result.data.images);
      this.showNotification(`加载了 ${result.data.total} 张图片`, 'success');
    } catch (error) {
      this.showNotification(`加载图片库失败: ${error.message}`, 'error');
    }
  }

  /**
   * 显示图片库
   */
  displayGallery(images) {
    const galleryGrid = document.getElementById('galleryGrid');
    
    if (images.length === 0) {
      galleryGrid.innerHTML = `
        <div class="gallery-placeholder">
          <div class="placeholder-icon">🖼️</div>
          <div class="placeholder-text">暂无图片</div>
        </div>
      `;
      return;
    }

    galleryGrid.innerHTML = images.map(image => `
      <div class="gallery-item" onclick="app.selectGalleryImage('${image.imageId}')">
        <div class="gallery-thumbnail">🖼️</div>
        <div class="gallery-info">
          <div class="gallery-title">${image.originalName}</div>
          <div class="gallery-meta">
            ${this.formatFileSize(image.fileSize)} • ${this.formatDate(image.createdAt)}
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * 选择图片库中的图片
   */
  selectGalleryImage(imageId) {
    const userId = document.getElementById('galleryUserId').value;
    const token = document.getElementById('galleryToken').value;
    
    // 切换到查看选项卡并填充信息
    this.switchTab('view');
    document.getElementById('viewImageId').value = imageId;
    document.getElementById('viewUserId').value = userId;
    document.getElementById('viewToken').value = token;
  }

  /**
   * 运行系统测试
   */
  async runSystemTest() {
    if (!this.isInitialized) {
      this.showNotification('系统尚未初始化完成', 'warning');
      return;
    }

    try {
      const results = await this.#imageViewer.testSystem();
      this.displayTestResults(results);
      this.showNotification('系统测试完成', 'success');
    } catch (error) {
      this.showNotification(`测试失败: ${error.message}`, 'error');
    }
  }

  /**
   * 运行性能测试
   */
  runPerformanceTest() {
    if (!this.isInitialized) {
      this.showNotification('系统尚未初始化完成', 'warning');
      return;
    }

    const perfInfo = this.#imageViewer.getPerformanceInfo();
    this.displayPerformanceInfo(perfInfo);
    this.showNotification('性能测试完成', 'success');
  }

  /**
   * 显示测试结果
   */
  displayTestResults(results) {
    const testResults = document.getElementById('testResults');
    
    const html = `
      <div class="test-item ${results.api.success ? 'success' : 'error'}">
        <div class="test-title">API连接测试</div>
        <div class="test-description">
          ${results.api.success ? '✅ API服务正常' : `❌ ${results.api.error}`}
        </div>
      </div>
      
      <div class="test-item ${results.decryptor.wasm?.success ? 'success' : 'warning'}">
        <div class="test-title">WASM解密测试</div>
        <div class="test-description">
          ${results.decryptor.wasm?.success ? '✅ WASM解密功能正常' : 
            results.decryptor.wasm ? `❌ ${results.decryptor.wasm.error}` : '⚠️ WASM不可用'}
        </div>
      </div>
      
      <div class="test-item ${results.decryptor.fallback.success ? 'success' : 'error'}">
        <div class="test-title">CryptoJS解密测试</div>
        <div class="test-description">
          ${results.decryptor.fallback.success ? '✅ CryptoJS解密功能正常' : 
            `❌ ${results.decryptor.fallback.error}`}
        </div>
      </div>
      
      <div class="test-item ${results.renderer.success ? 'success' : 'error'}">
        <div class="test-title">Canvas渲染测试</div>
        <div class="test-description">
          ${results.renderer.success ? '✅ Canvas渲染功能正常' : '❌ Canvas渲染异常'}
        </div>
      </div>
    `;
    
    testResults.innerHTML = html;
  }

  /**
   * 显示性能信息
   */
  displayPerformanceInfo(perfInfo) {
    const performanceInfo = document.getElementById('performanceInfo');
    const decryptor = perfInfo.decryptor;
    const capabilities = decryptor.capabilities || {};
    const memInfo = capabilities.memoryInfo || {};
    
    // 更新性能信息显示
    document.getElementById('perfDecryptorMode').textContent = decryptor.currentMode || 'unknown';
    document.getElementById('perfWasmSupport').textContent = capabilities.wasmSupported ? '✅ 支持' : '❌ 不支持';
    document.getElementById('perfSimdSupport').textContent = capabilities.simdSupported ? '✅ 支持' : '❌ 不支持';
    document.getElementById('perfDeviceMemory').textContent = memInfo.deviceMemory ? 
      `${memInfo.deviceMemory} GB` : '未知';
    document.getElementById('perfCpuCores').textContent = memInfo.cores || '未知';
    document.getElementById('perfJsMemory').textContent = memInfo.usedJSHeapSize ? 
      this.formatFileSize(memInfo.usedJSHeapSize) : '未知';
    
    performanceInfo.style.display = 'block';
  }

  /**
   * 清除测试结果
   */
  clearTestResults() {
    const testResults = document.getElementById('testResults');
    testResults.innerHTML = `
      <div class="test-placeholder">
        <div class="placeholder-icon">🧪</div>
        <div class="placeholder-text">点击按钮开始测试</div>
      </div>
    `;
    
    document.getElementById('performanceInfo').style.display = 'none';
  }

  /**
   * 处理上传进度
   */
  handleUploadProgress(data) {
    if (data.stage === 'upload') {
      this.updateProgress(data.progress, '上传中...');
    }
  }

  /**
   * 处理上传完成
   */
  handleUploadComplete(result) {
    this.hideProgress();
    
    // 保存上传结果
    this.#lastUploadResult = result;
    
    // 显示结果
    document.getElementById('resultImageId').textContent = result.imageId;
    document.getElementById('resultFileSize').textContent = 
      this.formatFileSize(result.metadata.fileSize);
    document.getElementById('resultEncryptedSize').textContent = 
      this.formatFileSize(result.metadata.encryptedSize);
    
    document.getElementById('uploadResult').style.display = 'block';
    
    this.showNotification('图片上传加密成功！', 'success');
  }

  /**
   * 处理查看进度
   */
  handleViewProgress(data) {
    if (data.stage) {
      this.updateViewProgress(data.stage, data.progress);
    }
  }

  /**
   * 处理加载完成
   */
  handleLoadComplete(result) {
    this.hideViewProgress();
    this.showNotification('图片加载成功！', 'success');
  }

  /**
   * 更新系统信息
   */
  updateSystemInfo(initResult) {
    document.getElementById('decryptorMode').textContent = 
      initResult.decryptorMode === 'wasm' ? '🚀 WASM高性能' : '🔄 CryptoJS兼容';
    document.getElementById('wasmSupport').textContent = 
      initResult.capabilities.wasmSupported ? '✅ 支持' : '❌ 不支持';
  }

  /**
   * 更新图片信息
   */
  updateImageInfo(result, processTime) {
    const renderResult = result.renderResult;
    
    document.getElementById('originalSize').textContent = 
      `${renderResult.dimensions.original.width} × ${renderResult.dimensions.original.height}`;
    document.getElementById('displaySize').textContent = 
      `${renderResult.dimensions.rendered.width} × ${renderResult.dimensions.rendered.height}`;
    document.getElementById('decryptEngine').textContent = result.decryptorMode;
    document.getElementById('processTime').textContent = `${processTime}ms`;
    
    document.getElementById('imageInfo').style.display = 'block';
  }

  /**
   * 显示进度
   */
  showProgress() {
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('uploadResult').style.display = 'none';
  }

  /**
   * 隐藏进度
   */
  hideProgress() {
    document.getElementById('progressSection').style.display = 'none';
  }

  /**
   * 更新进度
   */
  updateProgress(progress, text) {
    document.getElementById('progressFill').style.width = `${progress}%`;
    document.getElementById('progressText').textContent = text;
  }

  /**
   * 显示查看进度
   */
  showViewProgress() {
    document.getElementById('viewProgress').style.display = 'block';
    document.getElementById('canvasOverlay').style.display = 'flex';
  }

  /**
   * 隐藏查看进度
   */
  hideViewProgress() {
    document.getElementById('viewProgress').style.display = 'none';
    document.getElementById('canvasOverlay').style.display = 'none';
  }

  /**
   * 更新查看进度
   */
  updateViewProgress(stage, progress) {
    const stageElement = document.querySelector(`[data-stage="${stage}"]`);
    if (stageElement) {
      stageElement.classList.add('active');
      if (progress >= 100) {
        stageElement.classList.add('completed');
        stageElement.classList.remove('active');
      }
    }
  }

  /**
   * 显示通知
   */
  showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notifications.appendChild(notification);
    
    // 自动移除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  /**
   * 复制到剪贴板
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showNotification('已复制到剪贴板', 'success');
    } catch (error) {
      this.showNotification('复制失败', 'error');
    }
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 格式化日期
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

// 全局函数
window.showAbout = function() {
  document.getElementById('modalTitle').textContent = '关于系统';
  document.getElementById('modalBody').innerHTML = `
    <h4>跨平台高性能图片加密/解密系统</h4>
    <p>这是一个基于现代Web技术构建的图片安全系统，提供以下特性：</p>
    <ul>
      <li>🔐 AES-256-CBC 工业级加密</li>
      <li>🚀 Rust WebAssembly 高性能解密</li>
      <li>🌐 跨平台兼容性支持</li>
      <li>🛡️ 多重安全防护机制</li>
      <li>📱 移动端优化适配</li>
    </ul>
    <p><strong>技术栈：</strong></p>
    <ul>
      <li>后端：Node.js + Express + crypto</li>
      <li>前端：Vanilla JavaScript + WebAssembly</li>
      <li>加密：Rust + AES-256-CBC</li>
      <li>降级：CryptoJS 兼容方案</li>
    </ul>
  `;
  document.getElementById('modal').style.display = 'flex';
};

window.showHelp = function() {
  document.getElementById('modalTitle').textContent = '使用帮助';
  document.getElementById('modalBody').innerHTML = `
    <h4>如何使用</h4>
    <ol>
      <li><strong>上传图片：</strong>在"图片上传"页面选择或拖拽图片文件</li>
      <li><strong>查看图片：</strong>使用图片ID和访问令牌在"图片查看"页面加载图片</li>
      <li><strong>管理图片：</strong>在"图片库"页面查看用户的所有图片</li>
      <li><strong>系统测试：</strong>在"系统测试"页面检查各项功能</li>
    </ol>
    
    <h4>安全特性</h4>
    <ul>
      <li>所有图片使用AES-256-CBC加密存储</li>
      <li>访问令牌具有时效性限制</li>
      <li>Canvas渲染防止直接下载</li>
      <li>水印保护和右键禁用</li>
    </ul>
    
    <h4>浏览器兼容性</h4>
    <ul>
      <li>支持WebAssembly的现代浏览器可获得最佳性能</li>
      <li>不支持WASM的浏览器自动降级到CryptoJS</li>
      <li>移动端浏览器完全支持</li>
    </ul>
  `;
  document.getElementById('modal').style.display = 'flex';
};

window.closeModal = function() {
  document.getElementById('modal').style.display = 'none';
};

// 创建全局应用实例
const app = new App();
window.app = app;

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

export default App;