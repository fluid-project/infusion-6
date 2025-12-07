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

    acornSource: [
        "src/lib/acorn/acorn.js"
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
        src: "node_modules/codemirror/addon/mode/overlay.js",
        dest: "src/lib/codemirror/js/overlay.js"
    }, {
        src: "node_modules/codemirror/mode/vue/vue.js",
        dest: "src/lib/codemirror/js/vue.js"
    }, {
        src: "node_modules/codemirror/mode/htmlmixed/htmlmixed.js",
        dest: "src/lib/codemirror/js/htmlmixed.js"
    }, {
        src: "node_modules/codemirror/addon/lint/lint.js",
        dest: "src/lib/codemirror/js/lint.js"
    }, {
        src: "node_modules/codemirror/addon/lint/lint.css",
        dest: "src/lib/codemirror/css/lint.css"
    }, {
        src: "node_modules/codemirror/addon/lint/javascript-lint.js",
        dest: "src/lib/codemirror/js/javascript-lint.js"
    }, {
        src: "node_modules/codemirror/addon/lint/json-lint.js",
        dest: "src/lib/codemirror/js/json-lint.js"
    }, {
        src: "node_modules/codemirror/addon/lint/css-lint.js",
        dest: "src/lib/codemirror/js/css-lint.js"
    }, {
        src: "node_modules/jshint/dist/jshint.js",
        dest: "src/lib/codemirror/js/jshint.js"
    }, {
        src: "node_modules/jsonlint/web/jsonlint.js",
        dest: "src/lib/codemirror/js/jsonlint.js"
    }, {
        src: "node_modules/csslint/dist/csslint.js",
        dest: "src/lib/codemirror/js/csslint.js"
    }, {
        src: "node_modules/htmlhint/dist/htmlhint.js",
        dest: "src/lib/codemirror/js/htmlhint.js"
    }, {
        src: "node_modules/acorn-loose/dist/acorn-loose.js",
        dest: "src/lib/acorn-loose/acorn-loose.js"
    }, {
        src: "node_modules/acorn/dist/acorn.js",
        dest: "src/lib/acorn/acorn.js"
    }, {
        src: "src/lib/pell",
        dest: "docs/pell"
    }, {
        src: "src/lib/codemirror",
        dest: "docs/codemirror"
    }, {
        src: "src/lib/lezer",
        dest: "docs/lezer"
    }, {
        src: "demo/**",
        dest: "docs/"
    }, {
        src: "src",
        dest: "docs/src"
    }, {
        src: "tests",
        dest: "docs/tests"
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

const makeJSBundle = async function (buildIndex, key, fileName) {
    const jsHash = filesToContentHash(buildIndex[key], ".js");
    console.log(key + " ", buildIndex[key]);
    const minBundle = await minify(jsHash, fileName);

    fs.writeFileSync(`dist/${fileName}`, minBundle.code, "utf8");
    fs.writeFileSync(`dist/${fileName}.map`, minBundle.map);
};

const doBuild = async function (buildIndex) {
    fs.rmSync("docs", { recursive: true });

    buildIndex.copy.forEach(function (oneCopy) {
        copyDep(oneCopy.src, oneCopy.dest);
    });

    await makeJSBundle(buildIndex, "coreSource", "fluid.core.min.js");
    await makeJSBundle(buildIndex, "acornSource", "acorn.min.js");
};

doBuild(buildIndex).then(null, function (error) {
    console.log(error);
});
