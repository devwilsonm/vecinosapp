const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");

const copyDirs = ["views"];
const copyFiles = ["package.json", "package-lock.json", "README.md", "web.config"];

function removeDir(target) {
  if (!fs.existsSync(target)) return;
  for (const entry of fs.readdirSync(target)) {
    const entryPath = path.join(target, entry);
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyDir(source, target) {
  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function minifyJs(js) {
  return js
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}();,:=+<>?])\s*/g, "$1")
    .trim();
}

function copyAndMinifyPublic() {
  const publicSource = path.join(root, "public");
  const publicTarget = path.join(dist, "public");
  copyDir(publicSource, publicTarget);

  const cssDir = path.join(publicTarget, "css");
  if (fs.existsSync(cssDir)) {
    for (const file of fs.readdirSync(cssDir)) {
      if (file.endsWith(".css")) {
        const filePath = path.join(cssDir, file);
        fs.writeFileSync(filePath, minifyCss(fs.readFileSync(filePath, "utf8")));
      }
    }
  }

  const jsDir = path.join(publicTarget, "js");
  if (fs.existsSync(jsDir)) {
    for (const file of fs.readdirSync(jsDir)) {
      if (file.endsWith(".js")) {
        const filePath = path.join(jsDir, file);
        fs.writeFileSync(filePath, minifyJs(fs.readFileSync(filePath, "utf8")));
      }
    }
  }
}

function writeBuildInfo() {
  const builtAt = new Date().toISOString();
  const info = {
    app: "VecinosApp",
    mode: "production",
    builtAt,
    assetVersion: builtAt.replace(/\D/g, "")
  };
  fs.writeFileSync(path.join(dist, "build-info.json"), JSON.stringify(info, null, 2));
}

removeDir(dist);
ensureDir(dist);

execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", path.join(root, "tsconfig.json")], { stdio: "inherit" });

for (const dir of copyDirs) {
  copyDir(path.join(root, dir), path.join(dist, dir));
}

copyAndMinifyPublic();

for (const file of copyFiles) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dist, file));
}

const distPackagePath = path.join(dist, "package.json");
const distPackage = JSON.parse(fs.readFileSync(distPackagePath, "utf8"));
distPackage.scripts.start = "node src/server.js";
fs.writeFileSync(distPackagePath, JSON.stringify(distPackage, null, 2));

ensureDir(path.join(dist, "instance"));
fs.writeFileSync(path.join(dist, "instance", ".gitkeep"), "");
writeBuildInfo();

console.log("Build de producción generado en dist/");
