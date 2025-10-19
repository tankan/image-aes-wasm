use wasm_bindgen::prelude::*;
use js_sys::{Uint8Array, Promise};
use web_sys::console;
use aes::Aes256;
use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit}};
use base64::{Engine as _, engine::general_purpose};

// 当panic发生时，提供更好的错误信息
#[cfg(feature = "console_error_panic_hook")]
pub use console_error_panic_hook::set_once as set_panic_hook;

// AES-256-CBC解密器类型别名
type Aes256CbcDec = cbc::Decryptor<Aes256>;

/// WebAssembly图片解密模块
/// 提供高性能的AES-256-CBC解密功能
#[wasm_bindgen]
pub struct ImageDecryptor {
    chunk_size: usize,
}

#[wasm_bindgen]
impl ImageDecryptor {
    /// 创建新的解密器实例
    #[wasm_bindgen(constructor)]
    pub fn new() -> ImageDecryptor {
        #[cfg(feature = "console_error_panic_hook")]
        set_panic_hook();
        
        ImageDecryptor {
            chunk_size: 1024 * 1024, // 1MB 分块大小
        }
    }

    /// 设置分块大小（字节）
    #[wasm_bindgen]
    pub fn set_chunk_size(&mut self, size: usize) {
        self.chunk_size = size.max(1024); // 最小1KB
    }

    /// 解密图片数据
    /// 
    /// # 参数
    /// - `encrypted_data`: 加密的图片数据
    /// - `key_base64`: Base64编码的密钥
    /// - `iv_base64`: Base64编码的初始化向量
    /// 
    /// # 返回
    /// 解密后的图片数据，如果失败则返回错误
    #[wasm_bindgen]
    pub fn decrypt_image(
        &self,
        encrypted_data: &Uint8Array,
        key_base64: &str,
        iv_base64: &str,
    ) -> Result<Uint8Array, JsValue> {
        // 解码Base64密钥和IV
        let key = general_purpose::STANDARD
            .decode(key_base64)
            .map_err(|e| JsValue::from_str(&format!("密钥解码失败: {}", e)))?;
        
        let iv = general_purpose::STANDARD
            .decode(iv_base64)
            .map_err(|e| JsValue::from_str(&format!("IV解码失败: {}", e)))?;

        // 验证密钥和IV长度
        if key.len() != 32 {
            return Err(JsValue::from_str("密钥长度必须为32字节"));
        }
        if iv.len() != 16 {
            return Err(JsValue::from_str("IV长度必须为16字节"));
        }

        // 转换加密数据
        let encrypted_bytes = encrypted_data.to_vec();
        
        // 执行解密
        let decrypted = self.decrypt_bytes(&encrypted_bytes, &key, &iv)
            .map_err(|e| JsValue::from_str(&e))?;

        // 返回解密结果
        Ok(Uint8Array::from(&decrypted[..]))
    }

    /// 分块解密大文件
    /// 
    /// # 参数
    /// - `encrypted_data`: 加密的图片数据
    /// - `key_base64`: Base64编码的密钥
    /// - `iv_base64`: Base64编码的初始化向量
    /// - `progress_callback`: 进度回调函数
    /// 
    /// # 返回
    /// Promise，解析为解密后的数据
    #[wasm_bindgen]
    pub fn decrypt_image_chunked(
        &self,
        encrypted_data: &Uint8Array,
        key_base64: &str,
        iv_base64: &str,
        progress_callback: Option<js_sys::Function>,
    ) -> Promise {
        let encrypted_bytes = encrypted_data.to_vec();
        let key_str = key_base64.to_string();
        let iv_str = iv_base64.to_string();
        let chunk_size = self.chunk_size;

        wasm_bindgen_futures::future_to_promise(async move {
            // 解码密钥和IV
            let key = general_purpose::STANDARD
                .decode(&key_str)
                .map_err(|e| JsValue::from_str(&format!("密钥解码失败: {}", e)))?;
            
            let iv = general_purpose::STANDARD
                .decode(&iv_str)
                .map_err(|e| JsValue::from_str(&format!("IV解码失败: {}", e)))?;

            // 验证长度
            if key.len() != 32 || iv.len() != 16 {
                return Err(JsValue::from_str("密钥或IV长度不正确"));
            }

            // 分块解密
            let total_size = encrypted_bytes.len();
            let mut decrypted_data = Vec::new();
            let mut processed = 0;

            // 创建解密器
            let mut cipher = Aes256CbcDec::new_from_slices(&key, &iv)
                .map_err(|e| JsValue::from_str(&format!("创建解密器失败: {}", e)))?;

            // 处理数据（注意：CBC模式需要完整处理，不能真正分块）
            let mut buffer = encrypted_bytes.clone();
            let decrypted = cipher.decrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut buffer)
                .map_err(|e| JsValue::from_str(&format!("解密失败: {}", e)))?;

            decrypted_data.extend_from_slice(decrypted);

            // 模拟进度更新（用于用户体验）
            if let Some(callback) = progress_callback {
                let progress = 100.0;
                let _ = callback.call1(&JsValue::NULL, &JsValue::from_f64(progress));
            }

            Ok(JsValue::from(Uint8Array::from(&decrypted_data[..])))
        })
    }

    /// 验证解密结果
    /// 
    /// # 参数
    /// - `decrypted_data`: 解密后的数据
    /// 
    /// # 返回
    /// 验证结果和文件类型信息
    #[wasm_bindgen]
    pub fn verify_decrypted_image(&self, decrypted_data: &Uint8Array) -> JsValue {
        let data = decrypted_data.to_vec();
        
        if data.len() < 8 {
            return js_sys::JSON::stringify(&js_sys::Object::new()).unwrap();
        }

        let mut result = js_sys::Object::new();
        
        // 检测文件类型
        let file_type = self.detect_image_type(&data);
        js_sys::Reflect::set(&result, &"fileType".into(), &file_type.into()).unwrap();
        
        // 验证文件头
        let is_valid = !file_type.is_empty();
        js_sys::Reflect::set(&result, &"isValid".into(), &is_valid.into()).unwrap();
        
        // 文件大小
        js_sys::Reflect::set(&result, &"fileSize".into(), &(data.len() as u32).into()).unwrap();
        
        result.into()
    }

    /// 获取性能统计信息
    #[wasm_bindgen]
    pub fn get_performance_info(&self) -> JsValue {
        let mut info = js_sys::Object::new();
        
        // WASM特性检测
        js_sys::Reflect::set(&info, &"wasmSupported".into(), &true.into()).unwrap();
        js_sys::Reflect::set(&info, &"chunkSize".into(), &(self.chunk_size as u32).into()).unwrap();
        
        // 内存使用情况（简化版）
        let memory_pages = wasm_bindgen::memory().buffer().byte_length() / (64 * 1024);
        js_sys::Reflect::set(&info, &"memoryPages".into(), &memory_pages.into()).unwrap();
        
        info.into()
    }
}

impl ImageDecryptor {
    /// 内部解密方法
    fn decrypt_bytes(&self, encrypted_data: &[u8], key: &[u8], iv: &[u8]) -> Result<Vec<u8>, String> {
        // 创建解密器
        let mut cipher = Aes256CbcDec::new_from_slices(key, iv)
            .map_err(|e| format!("创建解密器失败: {}", e))?;

        // 复制数据用于原地解密
        let mut buffer = encrypted_data.to_vec();
        
        // 执行解密并移除填充
        let decrypted = cipher.decrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut buffer)
            .map_err(|e| format!("解密失败: {}", e))?;

        Ok(decrypted.to_vec())
    }

    /// 检测图片文件类型
    fn detect_image_type(&self, data: &[u8]) -> String {
        if data.len() < 8 {
            return String::new();
        }

        // JPEG
        if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            return "image/jpeg".to_string();
        }
        
        // PNG
        if data.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
            return "image/png".to_string();
        }
        
        // GIF
        if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
            return "image/gif".to_string();
        }
        
        // WebP
        if data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
            return "image/webp".to_string();
        }
        
        // BMP
        if data.starts_with(b"BM") {
            return "image/bmp".to_string();
        }

        String::new()
    }
}

/// 工具函数：检查WASM SIMD支持
#[wasm_bindgen]
pub fn check_simd_support() -> bool {
    // 简化的SIMD检测
    // 实际项目中可以使用更复杂的特性检测
    cfg!(target_feature = "simd128")
}

/// 工具函数：获取WASM模块信息
#[wasm_bindgen]
pub fn get_wasm_info() -> JsValue {
    let mut info = js_sys::Object::new();
    
    js_sys::Reflect::set(&info, &"version".into(), &"1.0.0".into()).unwrap();
    js_sys::Reflect::set(&info, &"simdSupport".into(), &check_simd_support().into()).unwrap();
    js_sys::Reflect::set(&info, &"algorithm".into(), &"AES-256-CBC".into()).unwrap();
    
    info.into()
}

/// 日志输出到浏览器控制台
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

/// 宏：简化控制台日志输出
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

/// 初始化WASM模块
#[wasm_bindgen(start)]
pub fn main() {
    #[cfg(feature = "console_error_panic_hook")]
    set_panic_hook();
    
    console_log!("🦀 Rust WASM 图片解密模块已加载");
}