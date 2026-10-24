// Builds the page into one HTML, one CSS and one JS file (dist/ by default):
//
//   npm run build
//
// - app.js: every script from index.html, in its order, wrapped in a single
//   function and minified with esbuild. Wrapping turns the scripts' shared
//   top-level names into locals, so the minifier shortens them all, which
//   compresses and obfuscates the code; nothing is left as a global.
// - app.css: style.css, minified.
// - index.html: the markup pointing at those two files, comments stripped
//   and whitespace between tags collapsed.

const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
// Browsers the built JS must run in; esbuild rewrites newer syntax for them
const TARGET = ["chrome100", "edge100", "firefox100", "safari15"];

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

async function build(out = path.join(ROOT, "dist")) {
    const html = read("index.html");
    const scripts = [
        ...html.matchAll(/<script\s+src="([^"]+)"\s*>\s*<\/script>/g),
    ].map((m) => m[1]);

    // The scripts share one global scope in the browser; inside one function
    // they share one local scope instead, in the same order
    const source =
        "(() => {\n" + scripts.map((f) => read(f)).join("\n;\n") + "\n})();\n";
    const js = await esbuild.transform(source, {
        minify: true,
        target: TARGET,
        legalComments: "none",
    });
    const css = await esbuild.transform(read("style.css"), {
        loader: "css",
        minify: true,
        target: TARGET,
    });

    const page = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(
            /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/,
            '<link rel="stylesheet" href="app.css">',
        )
        .replace(/<script\s+src="[^"]+"\s*>\s*<\/script>/g, "")
        .replace("</body>", '<script src="app.js"></script></body>')
        .replace(/>\s+</g, "><")
        .replace(/\s{2,}/g, " ")
        .trim();

    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "index.html"), page + "\n");
    fs.writeFileSync(path.join(out, "app.css"), css.code);
    fs.writeFileSync(path.join(out, "app.js"), js.code);
    return {
        out,
        sizes: {
            "index.html": page.length + 1,
            "app.css": css.code.length,
            "app.js": js.code.length,
        },
    };
}

module.exports = { build };

if (require.main === module) {
    build().then(({ out, sizes }) => {
        console.log(`Built ${path.relative(ROOT, out) || "."}/`);
        for (const [f, n] of Object.entries(sizes))
            console.log(`  ${f.padEnd(11)} ${(n / 1024).toFixed(1)} KB`);
    });
}
