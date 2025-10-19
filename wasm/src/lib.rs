use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use js_sys::Uint8Array;
use aes::Aes256;
use cbc::cipher::{BlockDecryptMut, KeyIvInit};
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
    // 移除chunk_size字段，因为CBC模式不支持真正的分块解密
}

#[wasm_bindgen]
impl ImageDecryptor {
    /// 创建新的解密器实例
    #[wasm_bindgen(constructor)]
    pub fn new() -> ImageDecryptor {
        #[cfg(feature = "console_error_panic_hook")]
        set_panic_hook();
        
        ImageDecryptor {}
    }

    /// 解密图片数据
    /// 使用AES-256-CBC算法进行高性能解密
    /// 
    /// # 参数
    /// - `encrypted_data`: 加密的图片数据
    /// - `key_base64`: Base64编码的32字节密钥
    /// - `iv_base64`: Base64编码的16字节初始化向量
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
        match self.decrypt_bytes_internal(encrypted_data, key_base64, iv_base64) {
            Ok(decrypted) => Ok(decrypted),
            Err(e) => Err(JsValue::from_str(&e))
        }
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
            return js_sys::JSON::stringify(&js_sys::Object::new()).unwrap().into();
        }

        let result = js_sys::Object::new();
        
        // 检测文件类型
        let file_type = self.detect_image_type(&data);
        js_sys::Reflect::set(&result, &"fileType".into(), &JsValue::from_str(&file_type)).unwrap();
        
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
        let info = js_sys::Object::new();
        
        // WASM特性检测
        js_sys::Reflect::set(&info, &"wasmSupported".into(), &true.into()).unwrap();
        
        // 内存使用情况（简化实现）
        let memory_pages = wasm_bindgen::memory()
            .dyn_into::<js_sys::WebAssembly::Memory>()
            .ok()
            .and_then(|mem| mem.buffer().dyn_into::<js_sys::ArrayBuffer>().ok())
            .map(|buf| buf.byte_length() / (64 * 1024))
            .unwrap_or(0);

        js_sys::Reflect::set(&info, &"memoryPages".into(), &memory_pages.into()).unwrap();
        
        info.into()
    }
}

impl ImageDecryptor {
    /// 内部解密方法 - 统一的高性能解密实现
    /// 减少数据复制，提高性能，统一错误处理
    fn decrypt_bytes_internal(&self, encrypted_data: &Uint8Array, key_base64: &str, iv_base64: &str) -> Result<Uint8Array, String> {
        // 统一的输入验证
        if key_base64.is_empty() {
            return Err("密钥不能为空".to_string());
        }
        
        if iv_base64.is_empty() {
            return Err("IV不能为空".to_string());
        }
        
        if encrypted_data.length() == 0 {
            return Err("加密数据不能为空".to_string());
        }
        
        // 验证加密数据长度（必须是16字节的倍数）
        if encrypted_data.length() % 16 != 0 {
            return Err("加密数据长度必须是16字节的倍数".to_string());
        }

        // 解码密钥和IV
        let key = general_purpose::STANDARD
            .decode(key_base64)
            .map_err(|e| format!("密钥Base64解码失败: {}", e))?;
        
        let iv = general_purpose::STANDARD
            .decode(iv_base64)
            .map_err(|e| format!("IV Base64解码失败: {}", e))?;

        // 验证长度
        if key.len() != 32 {
            return Err(format!("密钥长度必须为32字节，当前为{}字节", key.len()));
        }
        
        if iv.len() != 16 {
            return Err(format!("IV长度必须为16字节，当前为{}字节", iv.len()));
        }

        // 创建解密器
        let cipher = Aes256CbcDec::new_from_slices(&key, &iv)
            .map_err(|e| format!("AES解密器初始化失败: {}", e))?;

        // 直接从Uint8Array创建buffer，避免额外复制
        let mut buffer = encrypted_data.to_vec();
        
        // 验证buffer不为空
        if buffer.is_empty() {
            return Err("解密缓冲区为空".to_string());
        }
        
        // 执行解密并移除填充
        let decrypted = cipher.decrypt_padded_mut::<cbc::cipher::block_padding::Pkcs7>(&mut buffer)
            .map_err(|_| "PKCS7填充验证失败，数据可能已损坏".to_string())?;

        // 验证解密结果
        if decrypted.is_empty() {
            return Err("解密结果为空".to_string());
        }

        // 直接创建Uint8Array，避免额外的to_vec()调用
        Ok(Uint8Array::from(decrypted))
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
    let info = js_sys::Object::new();
    
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