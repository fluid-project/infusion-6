/* eslint-env node */
"use strict";

const glob = require("glob"),
    fs = require("fs-extra"),
    linkedom = require("linkedom");

const path = require("path");
const terser = require("terser");

const parseDocument = function (path) {
    const resolved = path;
    const stats = fs.statSync(resolved);
    console.log("Read " + stats.size + " bytes from " + resolved);
    const text = fs.readFileSync(resolved, "utf8");
    const now = Date.now();
    const togo = linkedom.parseHTML(text).document;
    console.log("Parsed in " + (Date.now() - now) + " ms");
    return togo;
};


const buildIndex = {
    coreSource: [
        "src/framework/core/js/Fluid.js",
        "src/framework/core/js/FluidIL.js",
        "src/framework/core/js/FluidView.js"
    ],

    copy: [{
        src: "node_modules/codemirror/lib/codemirror.js",
        dest: "src/lib/codemirror/js/codemirror.js"
    }, {
        src: "node_modules/codemirror/lib/codemirror.css",
        dest: "src/lib/codemirror/css/codemirror.css"
    }, {
        src: "node_modules/codemirror/mode/css/css.js",
        dest: "src/lib/codemirror/js/css.js"
    }, {
        src: "node_modules/codemirror/mode/javascript/javascript.js",
        dest: "src/lib/codemirror/js/javascript.js"
    }, {
        src: "node_modules/codemirror/mode/xml/xml.js",
        dest: "src/lib/codemirror/js/xml.js"
    }, {
        src: "node_modules/codemirror/mode/markdown/markdown.js",
        dest: "src/lib/codemirror/js/markdown.js"
    }, {
        src: "node_modules/codemirror/mode/vue/vue.js",
        dest: "src/lib/codemirror/js/vue.js"
    }, {
        src: "src/lib/pell",
        dest: "docs/pell"
    }, {
        src: "src/lib/codemirror",
        dest: "docs/codemirror"
    }, {
        src: "demo/**",
        dest: "docs/"
    }, {
        src: "src",
        dest: "docs/src"
    }]
};

const writeFile = function (filename, data) {
    fs.writeFileSync(filename, data, "utf8");
    const stats = fs.statSync(filename);
    console.log("Written " + stats.size + " bytes to " + filename);
};

const rewriteUrlBase = function (source, destination, importMap) {
    const parsed = parseDocument(source);
    if (importMap) {
        const imports = [...parsed.querySelectorAll("fluid-url-base")];
        console.log("Got imports ", imports.map(jmport => jmport.getAttribute("id")).join(", "));
        // TODO: Currently noop, not required yet
    }
    const outMarkup = "<!DOCTYPE html>" + parsed.documentElement.outerHTML;
    writeFile(destination, outMarkup);
};

// These two taken from reknit.js

const copyGlob = function (sourcePattern, targetDir, importMap = {}) {
    console.log("copyGlob ", sourcePattern);
    const fileNames = glob.sync(sourcePattern, {nodir: true});
    console.log("Got files ", fileNames);
    fileNames.forEach(filePath => {
        const destinationPath = path.join(targetDir, filePath);

        fs.ensureDirSync(path.dirname(destinationPath));
        if (filePath.endsWith(".html")) {
            rewriteUrlBase(filePath, destinationPath, importMap);
        } else {
            fs.copyFileSync(filePath, destinationPath);
        }
        console.log(`Copied file: ${filePath} to ${destinationPath}`);
    });
};

/** Copy dependencies into docs directory for GitHub pages **/

const copyDep = function (source, target, options = {}) {
    /*
    const targetPath = fluid.module.resolvePath(target);
    const sourceModule = fluid.module.refToModuleName(source);
    if (sourceModule && sourceModule !== "maxwell") {
        require(sourceModule);
    }
    const sourcePath = fluid.module.resolvePath(source);
    */
    const sourcePath = source;
    const targetPath = target;
    if (options.replaceSource) {
        const text = fs.readFileSync(sourcePath, "utf8");
        const replaced = text.replace(options.replaceSource, options.replaceTarget);
        fs.writeFileSync(targetPath, replaced, "utf8");
        console.log(`Copied file: ${targetPath}`);
    } else if (sourcePath.includes("*")) {
        copyGlob(sourcePath, targetPath, options.importMap);
    } else {
        fs.ensureDirSync(path.dirname(targetPath));
        fs.copySync(sourcePath, targetPath);
        console.log(`Copied file: ${targetPath}`);
    }
};

const filesToContentHash = function (allFiles, extension) {
    const extFiles = allFiles.filter(function (file) {
        return file.endsWith(extension);
    });
    const hash = Object.fromEntries(
        extFiles.map(filename => [filename, fs.readFileSync(filename, "utf8")])
    );
    return hash;
};

const minify = async function (hash, filename) {
    console.log("Minifying " + Object.keys(hash).length + " JS files to " + filename);
    return await terser.minify(hash, {
        mangle: false,
        compress: false, // https://github.com/terser/terser?tab=readme-ov-file#terser-fast-minify-mode
        sourceMap: {
            filename,
            url: filename + ".map",
            root: "../.."
        }
    });
};

const doBuild = async function (buildIndex) {
    fs.rmSync("docs", { recursive: true });

    buildIndex.copy.forEach(function (oneCopy) {
        copyDep(oneCopy.src, oneCopy.dest);
    });

    const coreJsHash = filesToContentHash(buildIndex.coreSource, ".js");
    console.log("coreFiles ", buildIndex.coreSource);
    const coreJs = await minify(coreJsHash, "fluid.core.min.js");

    fs.writeFileSync("dist/fluid.core.min.js", coreJs.code, "utf8");
    fs.writeFileSync("dist/fluid.core.min.js.map", coreJs.map);
};

doBuild(buildIndex).then(null, function (error) {
    console.log(error);
});
