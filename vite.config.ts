import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

// 将 content.js 转换为纯 ASCII（Chrome Manifest V3 要求）
// Chrome 的内容脚本验证器对非 ASCII 字符非常严格
function convertToAscii() {
  return {
    name: 'convert-to-ascii',
    closeBundle() {
      const contentPath = 'dist/content.js';
      if (fs.existsSync(contentPath)) {
        let content = fs.readFileSync(contentPath, 'utf8');

        // 将所有非 ASCII 字符转义为 \uXXXX 格式
        let ascii = '';
        for (let i = 0; i < content.length; i++) {
          const code = content.charCodeAt(i);
          if (code < 128) {
            // ASCII 字符保持原样
            ascii += content[i];
          } else {
            // 非 ASCII 字符转义为 \uXXXX
            ascii += '\\u' + code.toString(16).padStart(4, '0');
          }
        }

        fs.writeFileSync(contentPath, ascii, 'ascii');
        const nonAsciiCount = content.split('').filter(c => c.charCodeAt(0) >= 128).length;
        console.log(`✓ Converted ${nonAsciiCount} non-ASCII characters to Unicode escapes in content.js`);
      }
    },
  };
}

// 构建后将 manifest.json 和 icons 复制到 dist
function copyExtensionFiles() {
  return {
    name: 'copy-extension-files',
    closeBundle() {
      fs.copyFileSync('manifest.json', 'dist/manifest.json');
      if (fs.existsSync('background.js')) fs.copyFileSync('background.js', 'dist/background.js');
      if (fs.existsSync('icon')) {
        fs.mkdirSync('dist/icon', { recursive: true });
        fs.readdirSync('icon').forEach(f =>
          fs.copyFileSync(`icon/${f}`, `dist/icon/${f}`)
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), convertToAscii(), copyExtensionFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild', // 启用压缩以移除 null 字节
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/content.ts'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
