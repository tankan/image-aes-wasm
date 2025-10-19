# Rust 和 WASM 编译环境设置指南

## 问题分析

当前系统缺少 Rust 编译环境，导致 WASM 模块无法编译。错误信息显示：

1. **Rust 未安装**: `can't find crate for 'core'` 和 `can't find crate for 'std'`
2. **WASM 目标未安装**: `the wasm32-unknown-unknown target may not be installed`
3. **Windows 链接器缺失**: `linker link.exe not found`

## 解决方案

### 方案一：完整 Rust 环境安装（推荐用于开发）

#### 1. 安装 Rust
```bash
# 下载并安装 Rustup
# 访问 https://rustup.rs/ 下载安装程序
# 或使用 PowerShell 命令：
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "rustup-init.exe"
./rustup-init.exe
```

#### 2. 安装 WASM 目标
```bash
rustup target add wasm32-unknown-unknown
```

#### 3. 安装 wasm-pack
```bash
cargo install wasm-pack
```

#### 4. 编译 WASM 模块
```bash
cd wasm
wasm-pack build --target web --out-dir ../frontend/public/wasm
```

### 方案二：使用预编译方案（快速部署）

系统已配置为自动降级到 CryptoJS，无需 WASM 编译：

1. **前端自动检测**: 系统会检测 WASM 模块是否可用
2. **自动降级**: 如果 WASM 不可用，自动使用 CryptoJS 解密
3. **功能完整**: CryptoJS 提供完整的 AES-256-CBC 解密功能

## 当前状态

- ✅ **后端**: Node.js 服务正常运行
- ✅ **前端**: Vite 开发服务器正常运行  
- ✅ **加密**: 后端 AES-256-CBC 加密正常
- ✅ **解密**: 前端 CryptoJS 降级解密正常
- ⚠️ **WASM**: 高性能模块未编译（可选）

## 性能对比

| 解密方式 | 性能 | 兼容性 | 安装复杂度 |
|----------|------|--------|------------|
| WASM (Rust) | 🚀 高性能 | 现代浏览器 | 复杂 |
| CryptoJS | ⚡ 良好 | 全兼容 | 简单 |

## 建议

- **生产环境**: 使用 CryptoJS 方案，兼容性好，性能足够
- **开发环境**: 可选择安装 Rust 获得最佳性能
- **CI/CD**: 建议使用 CryptoJS 避免构建环境复杂性

## 验证系统功能

当前系统完全可用，可以：
1. 上传并加密图片
2. 查看和解密图片  
3. 管理图片库
4. 运行系统测试

无需等待 WASM 编译即可使用完整功能。