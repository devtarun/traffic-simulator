// Production build with Vite: `npm run build` writes dist/ with one
// index.html, one app.css and one app.js; `npm run preview` serves it.
//
// The app is plain <script src> files sharing one global scope, not ES
// modules, and Vite only bundles modules. So the classicScripts() plugin
// takes those script tags out of index.html and gives Vite one virtual
// module instead: every script, in index.html order, inside a single
// function. That keeps their shared scope, and turns all their top-level
// names into locals, which the minifier then shortens (compressed and
// obfuscated; nothing is left global). The source page is untouched and
// still runs straight from disk.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLASSIC_SCRIPT = /<script\s+src="([^"]+)"\s*>\s*<\/script>/g;
const ENTRY = "virtual:app";

function classicScripts() {
    let scripts = [];
    return {
        name: "classic-scripts",
        apply: "build",
        transformIndexHtml: {
            // Before Vite reads the page, swap the plain scripts for the entry
            order: "pre",
            handler(html) {
                scripts = [...html.matchAll(CLASSIC_SCRIPT)].map((m) => m[1]);
                return html
                    .replace(CLASSIC_SCRIPT, "")
                    .replace(
                        "</body>",
                        `<script type="module" src="/${ENTRY}"></script></body>`,
                    );
            },
        },
        resolveId(id) {
            if (id.endsWith(ENTRY)) return "\0" + ENTRY;
        },
        load(id) {
            if (id !== "\0" + ENTRY) return;
            const code = scripts.map((f) =>
                fs.readFileSync(path.join(ROOT, f), "utf8"),
            );
            return "(() => {\n" + code.join("\n;\n") + "\n})();\n";
        },
    };
}

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
    plugins: [classicScripts(), minifyHtml()],
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
