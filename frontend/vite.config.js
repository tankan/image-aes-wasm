import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    cors: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'crypto-js': ['crypto-js']
        }
      }
    },
    // Vite 7.x 新增的构建优化选项
    target: 'esnext',
    minify: 'esbuild'
  },
  optimizeDeps: {
    exclude: ['image-aes-wasm'],
    // Vite 7.x 改进的依赖预构建
    force: false
  },
  worker: {
    format: 'es'
  },
  // 添加WASM支持
  assetsInclude: ['**/*.wasm'],
  // Vite 7.x 新增的实验性特性
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      if (hostType === 'js') {
        return { js: `window.__assetsPath(${JSON.stringify(filename)})` }
      } else {
        return { relative: true }
      }
    }
  }
})