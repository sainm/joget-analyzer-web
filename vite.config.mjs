import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { transform as esbuildTransform } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB_DIR = path.join(HERE, 'lib');

/**
 * lib/ 配下の CommonJS を ESM に変換するプラグイン。
 *
 * なぜ必要か:
 *   統合オブジェクトモデル（lib/objectModel.js）は Node 側（設計書生成等）と
 *   ブラウザ側（画面）の両方から読む。二重定義を避けるには CJS 一択だが、
 *   Vite は開発サーバーでプロジェクト内の CJS を変換してくれない。
 *   結果として `npm run dev` では `module is not defined` で画面が落ちる。
 *   本番ビルド（build.commonjsOptions）だけでは開発時に壊れるため、
 *   開発サーバー向けにも変換を入れる。
 *
 * なぜ esbuild を直接呼ぶか:
 *   Rollup の commonjs プラグインは `module.exports = { A, B }` の省略形を
 *   静的解析できず、ビルドが失敗する。esbuild は確実に変換できる。
 *
 * 注意: このプラグインを消すと build は通るが dev が壊れる。
 * test-dev-transform.mjs がその状態を検出する。
 */
function libCjsToEsm() {
  return {
    name: 'joget:lib-cjs-to-esm',
    enforce: 'pre',
    async transform(code, id) {
      // プロジェクトの lib/ 直下だけ。node_modules/foo/lib/bar.js は対象外
      if (path.dirname(id) !== LIB_DIR) return null;
      if (!/\.(js|cjs|mjs)$/.test(id)) return null;
      // 既に ESM なら触らない（二重変換で壊れる）
      if (/^\s*(import|export)[\s{]/m.test(code)) return null;
      const out = await esbuildTransform(code, {
        loader: 'js',
        format: 'esm',
        target: 'es2020',
        sourcefile: path.basename(id),
      });
      return out.code;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), libCjsToEsm()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    /**
     * 本番ビルドでも lib/ 配下の CJS を変換対象に含める。
     * 既定では node_modules しか見ないため、これを書かないと
     * 「"STATUS" is not exported by "lib/objectModel.js"」で失敗する。
     * Node 側の require は通るので、build を回すまで気づかない。
     */
    commonjsOptions: {
      include: [/lib\//, /node_modules/],
    },
  },
});
