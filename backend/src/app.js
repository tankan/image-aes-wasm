const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const imageRoutes = require('./routes/imageRoutes');
const SecurityMiddleware = require('./middleware/security');

const app = express();
const securityMiddleware = new SecurityMiddleware();

// 基础安全配置
app.use(helmet({
  crossOriginEmbedderPolicy: false, // 允许WASM加载
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'"], // WASM需要unsafe-eval
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));

// CORS配置
const corsOptions = {
  origin: function (origin, callback) {
    // 允许的源
    const allowedOrigins = [
      process.env.CORS_ORIGIN || 'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ];
    
    // 开发环境允许无origin的请求（如Postman）
    if (!origin && process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS策略不允许此源'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Token-Refresh-Needed', 'X-Token-Expires-Soon']
};

app.use(cors(corsOptions));

// 请求日志
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// 安全中间件
app.use(securityMiddleware.securityHeaders());
app.use(securityMiddleware.preventPathTraversal());

// 解析JSON请求体
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 静态文件服务（用于前端）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
}

// API路由
app.use('/api', imageRoutes);

// 根路径
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '图片加密系统API服务',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      encryptImage: 'POST /api/encrypt-image',
      getKey: 'GET /api/get-key/:imageId',
      downloadImage: 'GET /api/download-image/:imageId',
      verifyKey: 'GET /api/verify-key/:imageId',
      getUserImages: 'GET /api/images',
      getImageInfo: 'GET /api/image-info/:imageId',
      deleteImage: 'DELETE /api/image/:imageId',
      oneTimeToken: 'POST /api/one-time-token/:imageId'
    }
  });
});

// 生产环境下的前端路由处理
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在',
    path: req.path,
    method: req.method
  });
});

// 全局错误处理
app.use((error, req, res, next) => {
  console.error('全局错误:', error);
  
  // CORS错误
  if (error.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      error: 'CORS策略错误'
    });
  }
  
  // JSON解析错误
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: 'JSON格式错误'
    });
  }
  
  // 默认错误响应
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || '服务器内部错误';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 优雅关闭处理
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在优雅关闭...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在优雅关闭...');
  process.exit(0);
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 服务器运行在 http://${HOST}:${PORT}`);
  console.log(`📝 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 CORS源: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
  console.log(`📁 上传路径: ${process.env.UPLOAD_PATH || './uploads'}`);
});

// 设置服务器超时
server.timeout = 30000; // 30秒

module.exports = app;