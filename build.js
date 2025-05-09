/* eslint-env node */
"use strict";

const glob = require("glob"),
    fs = require("fs-extra");
const path = require("path");
const terser = require("terser");

const buildIndex = {
    coreSource: [
        "src/framework/core/js/Fluid.js",
        "src/framework/core/js/FluidIL.js",
        "src/framework/core/js/FluidView.js",
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
        src: "demo",
        dest: "docs/demo"
    }, {
        src: "src",
        dest: "docs/src"
    }]
};


// These two taken from reknit.js

const copyGlob = function (sourcePattern, targetDir) {
    console.log("copyGlob ", sourcePattern);
    const fileNames = glob.sync(sourcePattern);
    console.log("Got files ", fileNames);
    fileNames.forEach(filePath => {
        const fileName = path.basename(filePath);
        const destinationPath = path.join(targetDir, fileName);

        fs.ensureDirSync(path.dirname(destinationPath));
        fs.copyFileSync(filePath, destinationPath);
        console.log(`Copied file: ${fileName}`);
    });
};

/** Copy dependencies into docs directory for GitHub pages **/

const copyDep = function (source, target, replaceSource, replaceTarget) {
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
    if (replaceSource) {
        const text = fs.readFileSync(sourcePath, "utf8");
        const replaced = text.replace(replaceSource, replaceTarget);
        fs.writeFileSync(targetPath, replaced, "utf8");
        console.log(`Copied file: ${targetPath}`);
    } else if (sourcePath.includes("*")) {
        copyGlob(sourcePath, targetPath);
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

    buildIndex.copy.forEach(function (oneCopy) {
        copyDep(oneCopy.src, oneCopy.dest);
    });

    const coreJsHash = filesToContentHash(buildIndex.coreSource, ".js");
    console.log("newCoreFiles ", buildIndex.newCoreSource);
    const coreJs = await minify(coreJsHash, "fluid.core.min.js");

    fs.writeFileSync("dist/fluid.core.min.js", coreJs.code, "utf8");
    fs.writeFileSync("dist/fluid.core.min.js.map", coreJs.map);
};

doBuild(buildIndex).then(null, function (error) {
    console.log(error);
});
