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


// The files a page loads to boot Infusion, as listed by its bootstrap
const fluidBoot = require("./src/framework/core/js/FluidBoot.js");

const buildIndex = {
    // Bundled as the "built" form of a page's bootstrap - see fluid.writeBootScript in server-support.js
    bootSource: fluidBoot.files,
    coreSource: [
        "src/framework/core/js/FluidCore.js",
        "src/framework/core/js/FluidSignals.js",
        "src/framework/core/js/Fluid.js",
        "src/framework/core/js/FluidModules.js",
        "src/framework/core/js/FluidIL.js",
        "src/framework/core/js/FluidView.js",
        "src/framework/core/js/FluidPTF.js"
    ],

    copy: [{
        src: "node_modules/acorn-loose/dist/acorn-loose.js",
        dest: "src/lib/acorn-loose/acorn-loose.js"
    }, {
        src: "node_modules/acorn/dist/acorn.js",
        dest: "src/lib/acorn/acorn.js"
    }, {
        src: "demo/**",
        dest: "docs/"
    }, {
        src: "src",
        dest: "docs/src"
    }, {
        src: "tests",
        dest: "docs/tests"
    }, {
        src: "src/",
        dest: "dist/src"
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

const minify = async function (hash, filename, isModule) {
    console.log("Minifying " + Object.keys(hash).length + " JS files to " + filename);
    return await terser.minify(hash, {
        mangle: false,
        compress: false, // https://github.com/terser/terser?tab=readme-ov-file#terser-fast-minify-mode
        module: isModule,
        sourceMap: {
            filename,
            url: filename + ".map",
            root: "../.."
        }
    });
};

const makeJSBundle = async function (buildIndex, key, fileName, isModule) {
    const jsHash = filesToContentHash(buildIndex[key], isModule ? ".mjs" : ".js");
    console.log(key + " ", buildIndex[key]);
    const minBundle = await minify(jsHash, fileName, isModule);

    fs.writeFileSync(`dist/${fileName}`, minBundle.code, "utf8");
    fs.writeFileSync(`dist/${fileName}.map`, minBundle.map);
};

const doBuild = async function (buildIndex) {
    fs.rmSync("docs", { recursive: true, force: true });

    buildIndex.copy.forEach(function (oneCopy) {
        copyDep(oneCopy.src, oneCopy.dest);
    });

    await makeJSBundle(buildIndex, "coreSource", "fluid.core.min.js");
    await makeJSBundle(buildIndex, "bootSource", fluidBoot.builtFile.replace(/^dist\//, ""));
};

if (require.main === module) {
    doBuild(buildIndex).then(null, function (error) {
        console.log(error);
    });
}

module.exports = {buildIndex, makeJSBundle};
