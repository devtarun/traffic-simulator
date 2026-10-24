// Runs the production build (vite.config.mjs) into outDir, for tests

const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

async function viteBuild(outDir = path.join(ROOT, "dist")) {
    const { build } = await import("vite");
    await build({
        configFile: path.join(ROOT, "vite.config.mjs"),
        logLevel: "silent",
        build: { outDir, emptyOutDir: true },
    });
    return outDir;
}

module.exports = { viteBuild };
