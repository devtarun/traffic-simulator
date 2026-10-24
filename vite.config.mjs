// Vite serves the app in development (`npm run dev`) and builds it for
// production: `npm run build` writes dist/ with one index.html, one app.css
// and one app.js; `npm run preview` serves that.
//
// The app is ES modules (js/main.js is the entry), so Vite needs no plugin to
// bundle them. The bundle is minified, which also shortens every top-level
// name (compressed and obfuscated; nothing is left global).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Minifies the built page: comments out, whitespace between tags collapsed
function minifyHtml() {
    return {
        name: "minify-html",
        apply: "build",
        transformIndexHtml: {
            order: "post",
            handler: (html) =>
                html
                    .replace(/<!--[\s\S]*?-->/g, "")
                    .replace(/>\s+</g, "><")
                    .replace(/\s{2,}/g, " ")
                    .trim(),
        },
    };
}

export default defineConfig({
    root: ROOT,
    base: "./", // relative paths, so dist/ works from any folder
    publicDir: false,
    plugins: [minifyHtml()],
    server: { host: "127.0.0.1", port: 8080, strictPort: true },
    preview: { host: "127.0.0.1", port: 8081, strictPort: true },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        assetsDir: "",
        target: ["chrome100", "edge100", "firefox100", "safari15"],
        modulePreload: { polyfill: false }, // one script, nothing to preload
        rolldownOptions: {
            output: {
                entryFileNames: "app.js",
                assetFileNames: (asset) =>
                    (asset.names?.[0] ?? asset.name ?? "").endsWith(".css")
                        ? "app.css"
                        : "[name][extname]",
            },
        },
    },
});
