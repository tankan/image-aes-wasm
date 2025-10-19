# 跨平台高性能图片加密/解密系统

## 项目概述

本项目是一个基于 Node.js 后端和 Rust WebAssembly 前端的高性能图片加密/解密系统，提供安全的图片存储和访问控制解决方案。

## 核心特性

- 🔐 **AES-256-CBC 加密**：使用工业级加密标准保护图片安全
- ⚡ **WebAssembly 高性能**：Rust 编译的 WASM 模块提供极速解密
- 🌐 **跨平台兼容**：支持桌面和移动浏览器，自动降级兼容
- 🛡️ **多重安全防护**：Token 鉴权、防盗链、IP 限制等安全机制
- 📱 **移动端优化**：针对移动设备的性能和内存优化

## 技术架构

### 后端技术栈
- **Node.js + Express**：RESTful API 服务
- **crypto 模块**：AES-256-CBC 加密实现
- **JWT**：Token 鉴权机制
- **multer**：文件上传处理

### 前端技术栈
- **Rust + WebAssembly**：高性能解密引擎
- **CryptoJS**：JavaScript 降级解密方案
- **HTML5 Canvas**：安全图片渲染
- **Vanilla JavaScript**：轻量级前端实现

## 项目结构

```
image-aes-wasm/
├── backend/                 # Node.js 后端服务
│   ├── src/
│   │   ├── controllers/     # API 控制器
│   │   ├── middleware/      # 中间件
│   │   ├── services/        # 业务逻辑
│   │   └── utils/          # 工具函数
│   ├── uploads/            # 加密文件存储
│   └── package.json
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── js/            # JavaScript 模块
│   │   ├── css/           # 样式文件
│   │   └── wasm/          # WASM 模块
│   ├── public/            # 静态资源
│   └── package.json
├── wasm/                  # Rust WebAssembly 源码
│   ├── src/
│   │   └── lib.rs
│   └── Cargo.toml
└── package.json           # 项目根配置
```

## 核心流程

### 加密流程
1. 用户上传图片到后端 API
2. 后端使用 AES-256-CBC 加密图片
3. 生成随机密钥和 IV，进行二次加密
4. 存储加密文件，返回图片 ID 和访问 URL

### 解密流程
1. 前端请求获取解密密钥（需 Token 验证）
2. 下载加密的二进制文件
3. 检测 WASM 支持情况：
   - 支持：使用 Rust WASM 高性能解密
   - 不支持：降级使用 CryptoJS 解密
4. 解密后通过 Canvas 安全渲染

## 安全机制

- **Token 鉴权**：JWT Token 绑定用户和图片 ID
- **短期有效性**：密钥 Token 1分钟内有效
- **传输加密**：全站 HTTPS 强制加密
- **路径隐藏**：加密文件路径不直接暴露
- **防盗链保护**：Canvas 渲染 + 右键禁用
- **频率限制**：IP 访问频率限制和锁定

## 快速开始

### 环境要求
- Node.js 16+
- Rust 1.70+
- wasm-pack

### 安装依赖
```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../wasm && cargo build
```

### 开发模式
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 启动生产服务
```bash
npm start
```

## API 接口

### 图片加密上传
```
POST /api/encrypt-image
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

### 获取解密密钥
```
GET /api/get-key?imageId=<id>&token=<token>
```

### 下载加密文件
```
GET /api/download-image?imageId=<id>&token=<token>
```

## 性能优化

- **分块处理**：大文件分块解密，降低内存占用
- **SIMD 加速**：自动检测并启用 WASM SIMD 指令
- **流式渲染**：优化首屏加载时间
- **移动端适配**：根据设备性能自动调整策略

## 许可证

MIT License