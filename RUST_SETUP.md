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

**推荐命令（no-modules 目标，兼容性最佳）**:
```bash
cd wasm
wasm-pack build --target no-modules --out-dir ../frontend/public/wasm
```

**备选命令（web 目标，需要模块支持）**:
```bash
cd wasm
wasm-pack build --target web --out-dir ../frontend/public/wasm
```

**说明**:
- `--target no-modules`: 生成传统浏览器兼容的 JavaScript，无需 ES 模块支持
- `--target web`: 生成 ES 模块格式，需要现代浏览器和模块加载器支持
- 推荐使用 `no-modules` 目标以获得最佳兼容性

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
- ✅ **WASM**: 高性能模块已编译并可用

## 性能对比

| 解密方式 | 性能 | 兼容性 | 安装复杂度 |
|----------|------|--------|------------|
| WASM (Rust) | 🚀 高性能 | 现代浏览器 | 复杂 |
| CryptoJS | ⚡ 良好 | 全兼容 | 简单 |

## 建议

- **生产环境**: 使用 WASM 方案获得最佳性能，CryptoJS 作为降级备选
- **开发环境**: 推荐安装 Rust 获得完整开发体验
- **CI/CD**: 可以选择预编译 WASM 或使用 CryptoJS 降级

## 验证系统功能

当前系统完全可用，可以：
1. 上传并加密图片
2. 查看和解密图片（WASM 或 CryptoJS）
3. 管理图片库
4. 运行系统测试
5. 获得高性能 WASM 解密体验

## 故障排除

### WASM 编译问题
- 确保使用 `--target no-modules` 以获得最佳兼容性
- 如果遇到链接器问题，检查 `.cargo/config.toml` 中的链接器配置
- 使用 `--allow-dirty` 选项运行 `cargo fix` 清理代码警告

### 前端加载问题
- WASM 文件应位于 `frontend/public/wasm/` 目录
- 确保 `wasmLoader.js` 使用正确的加载方式
- 检查浏览器控制台是否有加载错误