
"use strict";

// The build's trace, and the provenance records of its pages - what the static site publishes about what made it, so that
// an editing client, e.g. the "Edit in Infusion" browser extension, may verify what it is looking at, and recognise
// when its own edits have been published.
//
// The trace written here is a coarse verifying trace, in the sense of Mokhov et al.'s "Build
// Systems a la Carte" (section 4.2.2): for each output document, the keys of the inputs from which it was built, whose
// hashes are held once each, in `sources`. A regular page depends on its own content file; a list page, on every
// content file. Every page also depends on `template`, a single hash of all the site's templates, scripts and
// configuration, together with the version of Infusion - the pessimistic self-tracking of the paper's section 6.5.

const fs = require("fs"),
    path = require("path"),
    crypto = require("crypto");
const siteModel = require("./siteModel.js"),
    wendSite = require("./site.js");

const wend = {trace: {}};

// The type of the inert script element holding a page's provenance record
wend.trace.provenanceType = "application/fluid-provenance+json";
// The file name of the trace, at the root of the published site
wend.trace.traceFile = "fluid-trace.json";
// The key in the trace of the input standing for all of the site's templates
wend.trace.templateKey = "#template";
// The directory of the published site holding its markdown pipeline, for the editing client - see markdown.js
wend.trace.rendererDir = "js/fluid-markdown";

// The scripts of the markdown pipeline as the browser loads them, in order - the browser builds of the packages
// siteModel.js requires, and markdown.js itself
wend.trace.rendererScripts = [
    {packageName: "markdown-it", file: "dist/markdown-it.min.js"},
    {packageName: "markdown-it-attrs", file: "markdown-it-attrs.browser.js"},
    {packageName: "markdown-it-footnote", file: "dist/markdown-it-footnote.min.js"},
    {packageName: "markdown-it-deflist", file: "dist/markdown-it-deflist.min.js"},
    // The theme's, found amongst the site's static files - see site.js
    {staticFile: "js/highlight.min.js", name: "highlight"},
    {local: "markdown.js"}
];

/**
 * Find the directory of an installed package, as node resolves it from the site - by resolving its entry point and
 * walking up to the package.json bearing its name, since not every package exports its package.json
 * @param {String} packageName - The name of the package
 * @param {String} siteDir - The directory holding the site
 * @return {String} The absolute path of the package's directory
 */
wend.trace.packageDir = function (packageName, siteDir) {
    let dir = path.dirname(require.resolve(packageName, {paths: [siteDir]}));
    let found = null;
    while (found === null) {
        const manifest = path.join(dir, "package.json");
        if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, "utf8")).name === packageName) {
            found = dir;
        } else if (path.dirname(dir) === dir) {
            throw new Error("Can't find the directory of package " + packageName);
        } else {
            dir = path.dirname(dir);
        }
    }
    return found;
};

/**
 * Copy the markdown pipeline into the published site, so that the editing client renders with the build's own code
 * @param {String} siteDir - The directory holding the site
 * @param {String} outDir - The publish directory
 * @return {String[]} The paths of the scripts copied, relative to `outDir` with "/" separators, in loading order
 */
wend.trace.publishRenderer = function (siteDir, outDir) {
    const targetDir = path.join(outDir, wend.trace.rendererDir);
    fs.mkdirSync(targetDir, {recursive: true});
    const published = wend.trace.rendererScripts.map(script => {
        let source, name;
        if (script.staticFile) {
            source = wendSite.staticFile(script.staticFile);
            // Named by its content, as the site's own file holds no version
            const digest = siteModel.hashText(fs.readFileSync(source, "utf8")).substring("sha256-".length, "sha256-".length + 12);
            name = script.name + "-" + digest + ".js";
        } else if (script.local) {
            source = path.join(__dirname, script.local);
            // Named by wend's version, as the packages are by theirs, below - so a change to the file must come with a
            // fresh version of wend, or a browser may hold the former file under the same name
            const version = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8")).version;
            name = "wend-" + script.local.replace(/\.js$/, "-" + version + ".js");
        } else {
            const dir = wend.trace.packageDir(script.packageName, siteDir);
            const version = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
            source = path.join(dir, script.file);
            // The version is in the name, so that a page and the pipeline it names never disagree through caching
            name = script.packageName + "-" + version + ".js";
        }
        fs.copyFileSync(source, path.join(targetDir, name));
        return wend.trace.rendererDir + "/" + name;
    });
    // Versions published by earlier builds are removed, as no page now refers to them
    const names = new Set(published.map(script => path.basename(script)));
    fs.readdirSync(targetDir).filter(name => !names.has(name)).forEach(name => fs.rmSync(path.join(targetDir, name)));
    return published;
};

/**
 * List the files whose content is the task description of the build - the templates, scripts and configuration of
 * the site - other than content files, which are inputs of their own
 * @param {String} siteDir - The directory holding the site
 * @return {String[]} Their paths relative to `siteDir` with "/" separators, sorted
 */
wend.trace.templateFiles = function (siteDir) {
    // The SFCs and scripts of every module - wend's, its theme's and the site's - and the site's forks of them
    const moduleFiles = [...Object.values(wendSite.modules), wendSite.overrides].filter(dir => fs.existsSync(dir))
        .flatMap(dir => siteModel.listFiles(dir).filter(file => /\.(vue|js|html|json)$/.test(file) && !file.startsWith("static" + path.sep))
            .map(file => wendSite.rel(path.join(dir, file))));
    // The SFCs of widgets, which content may hold, are templates too - see widgetDir
    const widgetFiles = wend.trace.widgetFiles(siteDir).map(widget => "static/" + wend.trace.widgetDir + "/" + widget.file);
    return [...new Set([...moduleFiles, ...widgetFiles, wendSite.rel(wendSite.editing), "wend.json", "wend.site.json"])].sort();
};

/**
 * Compute the single hash of all the site's templates, together with the version of Infusion which renders them
 * @param {String} siteDir - The directory holding the site
 * @param {String} infusionVersion - The version of Infusion
 * @return {String} The hash, as by `siteModel.hashText`
 */
wend.trace.templateHash = function (siteDir, infusionVersion) {
    const parts = wend.trace.templateFiles(siteDir).map(file => file + "\n" + siteModel.hashText(fs.readFileSync(path.join(siteDir, file), "utf8")));
    return siteModel.hashText(["infusion-6@" + infusionVersion, ...parts].join("\n"));
};

// The script, relative to the site's infusion directory, booting a page's whole component tree in the browser
wend.trace.pageBootFile = "js/pageBoot.js";

// The file of the published site holding the traces formed from the cell graph by `formTraces` - kept apart from
// `traceFile`, which an editing client polls, and which is kept small
wend.trace.buildTraceFile = "fluid-build-trace.json";

/**
 * Render a value as JSON for hashing, with the members of objects in a fixed order, so that equal values hash alike
 * @param {any} value - The value
 * @return {String} Its JSON, or, if it can't be rendered, a marker unique to this call, so that the input is never
 * found unchanged
 */
wend.trace.stableJSON = function (value) {
    let togo;
    try {
        togo = JSON.stringify(value, (key, member) => member && typeof(member) === "object" && !Array.isArray(member) ?
            Object.fromEntries(Object.keys(member).sort().map(name => [name, member[name]])) : member);
    } catch (error) {
        // A value which can't be rendered can't be compared, so is taken to differ from every other - never to be up to date
        togo = "unrenderable " + Math.random();
    }
    return togo === undefined ? "undefined" : togo;
};

/**
 * Express the key of a trace input in terms which are the same from one build to the next whatever pages are added -
 * a page or alias is named by its permalink rather than its position, e.g. "model site.pages[/post/x/].title"
 * @param {String} key - The key, as `fluid.traceInputKey` forms it
 * @param {Object} model - The site's model, as loaded by siteModel.load
 * @return {String} The key, so expressed
 */
wend.trace.siteKey = function (key, model) {
    return key.replace(/ site\.(pages|aliases)\.(\d+)(?=\.|$| )/, (match, collection, index) =>
        ` site.${collection}[${model[collection][+index]?.relPermalink ?? model[collection][+index]?.permalink ?? index}]`);
};

/**
 * Hash the value of a trace input. A layer or template defined by a Single File Component is hashed by the SFC's text,
 * which holds its script and template whole - so that a change to any of it, including the functions its layer calls,
 * is a change to the input. A layer of Infusion's own is hashed by Infusion's version
 * @param {Object} fluid - Infusion
 * @param {TraceInput} input - The input
 * @param {String} infusionVersion - The version of Infusion
 * @return {String} The hash
 */
wend.trace.inputHash = function (fluid, input, infusionVersion) {
    let togo;
    if (input.kind === "layer" || input.kind === "template") {
        const text = fluid.sfcStore[input.layerName]?.textSignal?._value;
        togo = typeof(text) === "string" ? siteModel.hashText(text) : "infusion-6@" + infusionVersion;
    } else {
        togo = siteModel.hashText(wend.trace.stableJSON(input.value));
    }
    return togo;
};

/**
 * Form the trace of every output document of a build from the cell graph - see `fluid.traceOutputDocuments` - in the
 * terms of the site: each input keyed as by `siteKey`, and hashed as by `inputHash`, and the content files whose pages
 * the document read
 * @param {Object} fluid - Infusion
 * @param {UpdateRecorder} recorder - The recorder active whilst the documents were rendered
 * @param {Object} model - The site's model, as loaded by siteModel.load
 * @param {String} infusionVersion - The version of Infusion
 * @param {Object} [buildMaterial] - What the build writes into each page once it is rendered, e.g. the locations of the
 * published material its provenance record names - recorded as the input "build provenance"
 * @return {Object<String, Object>} For each document's location, its `inputs`, a map of key to hash, `sources`, the
 * paths of the content files it read, and `pageModel`, the slice of the model it alone needs - see `pageModel`
 */
wend.trace.formTraces = function (fluid, recorder, model, infusionVersion, buildMaterial) {
    // What the build writes into each page after rendering it - its provenance record and the scripts booting it - which is
    // outside the cell graph, and so an input of every page of its own
    const buildMaterialHash = siteModel.hashText(wend.trace.stableJSON(buildMaterial ?? null));
    const traces = fluid.traceOutputDocuments(recorder, fluid.outputDocuments.get());
    const pagesByPermalink = new Map(model.pages.map(page => [page.permalink, page]));
    return Object.fromEntries(traces.map(trace => {
        const inputs = {};
        const sources = new Set();
        trace.inputs.forEach(input => {
            inputs[wend.trace.siteKey(input.key, model)] = wend.trace.inputHash(fluid, input, infusionVersion);
            const page = input.kind === "model" && input.segs[0] === "pages" && input.segs.length > 1 ? model.pages[+input.segs[1]] : null;
            if (page && page.sourcePath) {
                sources.add(page.sourcePath);
            }
        });
        inputs["build provenance"] = buildMaterialHash;
        const sortedInputs = Object.fromEntries(Object.keys(inputs).sort().map(key => [key, inputs[key]]));
        const ownPage = pagesByPermalink.get(trace.location);
        // The slice of the model the page alone needs, which is not written into the build's trace itself - see pageModel
        const pageModel = ownPage ? wend.trace.pageModel(trace, ownPage, model) : null;
        return [trace.location, {effects: trace.effects, sources: [...sources].sort(), inputs: sortedInputs, pageModel}];
    }));
};

/**
 * Name the file beside a page's own holding the slice of the model from which the page alone can be rendered - see
 * `pageModel` - e.g. "index.model.json" beside "index.html"
 * @param {String} outputPath - The path of the page's file, e.g. "/post/x/index.html"
 * @return {String} The path of its model's file, e.g. "/post/x/index.model.json"
 */
wend.trace.pageModelPath = outputPath => outputPath.replace(/\.html$/, ".model.json");

/**
 * Find the layers which apply any of a set of layers by linkage - e.g. a feature such as
 * beautifulWend.feature.selfHosted, whose $linkage applies beautifulWend.document.selfHosted to the document. Such a
 * layer contributes nothing which the trace records as rendering the page, but unless it is loaded before the page is
 * booted, the page's first rendering lacks the layers it links, and its markup is rewritten once it arrives - e.g. the
 * href of every stylesheet, flashing the page unstyled.
 * @param {Set<String>} rendered - The names of the layers which rendered the page
 * @return {String[]} The names of the layers holding a $linkage record whose output layers include any of them
 */
wend.trace.linkingLayers = function (rendered) {
    const outputsOf = record => [].concat(record).flatMap(linkage => [].concat(linkage.outputLayers || []));
    return Object.keys(fluid.layerStore.get()).filter(layerName => {
        const layer = fluid.def(layerName);
        return !!layer && Object.values(layer).some(value => fluid.isPlainObject(value, true) && value.$linkage
            && outputsOf(value.$linkage).some(output => rendered.has(output)));
    });
};

/**
 * Form the slice of the site's model from which a single page can be rendered on its own, e.g. by a client booting the
 * page's whole component tree over the page as published: the site's configuration, the page's own record, and the
 * value which the page read of each computation shared with other pages, e.g. the summary of every page used to find
 * related posts - which, supplied in place of the computation, spare the client the records of all the other pages,
 * and render exactly what the build did, e.g. its year - together with the record of each page it read, e.g. those
 * it lists, supplied as the site's `pagesByPermalink`
 * @param {DocumentTrace} trace - The page's trace, as formed by `fluid.traceOutputDocuments`
 * @param {Object} page - The page's record
 * @param {Object} model - The site's model, as loaded by siteModel.load
 * @return {Object} The slice - `patch`, the site's configuration, `pages`, holding just the page, `shared`, the values of the shared computations
 * of the site, by member name, including the pages it read, as `pagesByPermalink`, and `layers`, those which rendered it
 */
wend.trace.pageModel = function (trace, page, model) {
    const shared = {};
    trace.inputs.filter(input => input.kind === "computed" && input.segs.length === 1).forEach(input => {
        shared[input.segs[0]] = input.value;
    });
    // Every other page whose record it read, e.g. those it lists, is supplied through the index by which pages are
    // looked up, rather than amongst the pages - which would make the client boot a document for each of them
    const read = new Set(trace.inputs.filter(input => input.kind === "model" && input.segs[0] === "pages" && input.segs.length > 1)
        .map(input => model.pages[+input.segs[1]]).filter(other => other && other !== page));
    if (read.size > 0) {
        shared.pagesByPermalink = Object.fromEntries([page, ...read].map(other => [other.relPermalink, other]));
    }
    // The layers which rendered the page, so that a client can load their files before booting its tree - whose first
    // rendering is then its last, claiming the page's markup rather than replacing it once a layer arrives
    const rendered = new Set(trace.inputs.filter(input => input.kind === "layer" || input.kind === "template")
        .map(input => input.layerName));
    const layers = [...new Set([...rendered, ...wend.trace.linkingLayers(rendered)])].sort();
    // The site's configuration is the whole of its patch, wend.json - see siteModel.readPatch
    return {patch: model.patch, pages: [page], shared, layers};
};

/**
 * Compare the traces of a build with those of the previous one, as a verifying build system would to decide which
 * documents to render - a document whose inputs all hash as before is up to date
 * @param {Object<String, Object>} previous - The traces of the previous build, as returned by `formTraces`, or `{}`
 * @param {Object<String, Object>} current - The traces of this build
 * @return {Object} `{unchanged, changed, added}` - the locations of the documents in each case, and for each changed
 * document, in `differences`, the keys of the inputs which differ
 */
wend.trace.compareTraces = function (previous, current) {
    const togo = {unchanged: [], changed: [], added: [], differences: {}};
    Object.entries(current).forEach(([location, trace]) => {
        const before = previous[location];
        if (!before) {
            togo.added.push(location);
        } else {
            const keys = new Set([...Object.keys(before.inputs), ...Object.keys(trace.inputs)]);
            const differing = [...keys].filter(key => before.inputs[key] !== trace.inputs[key]);
            if (differing.length === 0) {
                togo.unchanged.push(location);
            } else {
                togo.changed.push(location);
                togo.differences[location] = differing;
            }
        }
    });
    return togo;
};

/**
 * List the headings of rendered content which bear ids
 * @param {String} html - The content's HTML
 * @return {Object[]} The headings, in order, each `{id, text, level}`, the text without markup or entities
 */
wend.trace.headingsOf = function (html) {
    return [...html.matchAll(/<h([1-6])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)].map(([, level, id, inner]) => ({
        id, level: +level, text: siteModel.plainText(inner).trim()
    }));
};

/**
 * List the site's own static files which content may link to - its images and documents, not the theme's
 * @param {String} staticDir - The site's static directory
 * @return {String[]} Their paths from the root of the site, e.g. "/img/pond.jpg", sorted
 */
wend.trace.assetPaths = function (staticDir) {
    return fs.existsSync(staticDir) ? siteModel.listFiles(staticDir).filter(file => /\.(png|jpe?g|gif|svg|webp|pdf)$/i.test(file))
        .map(file => "/" + file.split(path.sep).join("/")).sort() : [];
};

/**
 * Hash each of the site's static files, so that an editing client may tell when a file it committed - an image, or
 * an SFC of a widget - is published, as it tells by `sources` for content files
 * @param {String} siteDir - The site's working tree
 * @return {Object<String, String>} The hash of each file beneath static/, as `siteModel.hashText` hashes text, keyed by
 * its path in the repository, e.g. "static/img/pond.jpg"
 */
wend.trace.staticHashes = function (siteDir) {
    const staticDir = path.join(siteDir, "static");
    return fs.existsSync(staticDir) ? Object.fromEntries(siteModel.listFiles(staticDir).sort().map(file => ["static/" + file.split(path.sep).join("/"),
        "sha256-" + crypto.createHash("sha256").update(fs.readFileSync(path.join(staticDir, file))).digest("hex")])) : {};
};

/**
 * Make the trace of a build
 * @param {Object} options - The build's particulars
 * @param {Object} options.model - The site's model, as loaded by siteModel.load
 * @param {Object<String, String>} options.sources - The hash of each content file, as by `siteModel.hashSources`
 * @param {String} options.template - The hash of the site's templates, as by `templateHash`
 * @param {String} options.infusionVersion - The version of Infusion
 * @param {String} [options.commit] - The commit built, if known
 * @param {String} options.outDir - The publish directory, holding the documents written
 * @param {Object<String, Object>} [options.formed] - The traces formed from the cell graph, as by `formTraces`
 * @param {String[]} [options.assets] - The paths, from the root of the site, of its own static files which may be
 * linked to, as by `assetPaths`
 * @param {Object<String, String>} [options.staticFiles] - The hash of each static file, as by `staticHashes`
 * @return {Object} The trace, ready to be written as JSON
 */
wend.trace.make = function ({model, sources, template, infusionVersion, commit, outDir, formed, assets, staticFiles}) {
    const allSources = Object.keys(sources).sort();
    const pages = Object.fromEntries(model.pages.map(page => {
        const file = path.join(outDir, page.outputPath);
        const output = fs.existsSync(file) ? siteModel.hashText(fs.readFileSync(file, "utf8")) : null;
        // The content files whose pages the document read, as its trace formed from the cell graph records them -
        // otherwise the coarse approximation: its own content file, or every content file for a list
        const traced = formed && formed[page.permalink];
        const inputs = traced ? traced.sources : page.sourcePath ? [page.sourcePath] : allSources;
        return [page.relPermalink, {
            // What an editing client offers in completing a link to the page - see Infusion's fluid-sourceView.vue
            title: page.title,
            kind: page.kind,
            // The headings of its content, by the ids the pipeline gave them, for completing links to them
            headings: wend.trace.headingsOf(page.content || ""),
            outputPath: page.outputPath,
            output,
            inputs: [wend.trace.templateKey, ...inputs]
        }];
    }));
    return {
        version: 1,
        commit: commit || null,
        infusion: infusionVersion,
        template,
        sources,
        pages,
        // The site's own static files which may be linked to, e.g. images, by their paths from the root of the site
        assets: assets || [],
        staticFiles: staticFiles || {}
    };
};

// The file of the published site, beneath `js/`, recording the hash of the content of each directory which
// `publishModule` writes, by its name - so that what changes in a build is visible there, rather than in the directories'
// names, which would rename every file of a module, and change every page, whenever any file of it changed
wend.trace.digestsFile = "digests.json";

/**
 * Copy a set of files into a directory of the published site of a fixed name, recording the hash of their content in
 * `digestsFile`. Only files whose content has changed are written, and files no longer in the set are removed, so that a
 * build changes no more of the published site than its sources changed. A directory of the same prefix named by a
 * hash, as earlier builds of wend wrote them, is removed
 * @param {String} sourceDir - The directory holding the files
 * @param {String[]} files - Their paths relative to `sourceDir`, with "/" separators
 * @param {String} outDir - The publish directory
 * @param {String} prefix - The name of the directory to be made beneath `js/`
 * @param {Function} [resolve] - Finds the file to be copied for each path - by default, the one at that path in
 * `sourceDir`
 * @return {String} The path of the directory made, relative to `outDir`, ending in "/"
 */
wend.trace.publishModule = function (sourceDir, files, outDir, prefix, resolve = file => path.join(sourceDir, file)) {
    const texts = files.map(file => fs.readFileSync(resolve(file)));
    const digest = siteModel.hashText(files.map((file, i) => file + "\n" + siteModel.hashText(texts[i].toString("utf8"))).join("\n"))
        .substring("sha256-".length, "sha256-".length + 12);
    const dir = "js/" + prefix + "/";
    const jsDir = path.join(outDir, "js");
    const targetDir = path.join(outDir, dir);
    if (fs.existsSync(jsDir)) {
        fs.readdirSync(jsDir).filter(name => name.startsWith(prefix + "-") && /^[0-9a-f]{12}$/.test(name.substring(prefix.length + 1)))
            .forEach(name => fs.rmSync(path.join(jsDir, name), {recursive: true}));
    }
    // Files of an earlier build no longer in the set, and any directory they leave empty, are removed
    const wanted = new Set(files.map(file => file.split("/").join(path.sep)));
    if (fs.existsSync(targetDir)) {
        siteModel.listFiles(targetDir).filter(file => !wanted.has(file)).forEach(file => fs.rmSync(path.join(targetDir, file)));
        const removeEmpty = function (subDir) {
            fs.readdirSync(subDir, {withFileTypes: true}).filter(entry => entry.isDirectory())
                .forEach(entry => removeEmpty(path.join(subDir, entry.name)));
            if (subDir !== targetDir && fs.readdirSync(subDir).length === 0) {
                fs.rmdirSync(subDir);
            }
        };
        removeEmpty(targetDir);
    }
    files.forEach((file, i) => {
        const target = path.join(targetDir, file);
        if (!fs.existsSync(target) || !fs.readFileSync(target).equals(texts[i])) {
            fs.mkdirSync(path.dirname(target), {recursive: true});
            fs.writeFileSync(target, texts[i]);
        }
    });
    const digestsPath = path.join(jsDir, wend.trace.digestsFile);
    const digests = fs.existsSync(digestsPath) ? JSON.parse(fs.readFileSync(digestsPath, "utf8")) : {};
    digests[prefix] = digest;
    // Kept in order of name, and without the entries of directories no longer published, so that it changes only as they do
    const kept = Object.keys(digests).filter(name => fs.existsSync(path.join(jsDir, name))).sort();
    fs.writeFileSync(digestsPath, JSON.stringify(Object.fromEntries(kept.map(name => [name, digests[name]])), null, 4) + "\n");
    return dir;
};

// The directory of the published site holding the one copy of Infusion which its pages use - both the files which
// content refers to, e.g. the reactivity post's live demos, and those an editing client boots when it migrates a page
wend.trace.infusionDir = "js/infusion-6/";

/**
 * List the files of Infusion to which the site refers - its content, as `/js/infusion-6/<path within Infusion>`, and its
 * SFCs, as that or as `%infusion-6/<path within Infusion>`
 * @param {String} siteDir - The directory holding the site
 * @return {String[]} The paths within Infusion, sorted
 */
wend.trace.infusionReferences = function (siteDir) {
    const escaped = wend.trace.infusionDir.replace(/[/.-]/g, "\\$&");
    const pattern = new RegExp("(?:/" + escaped + "|%infusion-6/)([^\"'\\s)<>?#]+)", "g");
    const found = new Set();
    const scan = (dir, suffix) => siteModel.listFiles(dir).filter(file => file.endsWith(suffix)).forEach(file => {
        const text = fs.readFileSync(path.join(dir, file), "utf8");
        [...text.matchAll(pattern)].forEach(match => found.add(match[1]));
    });
    scan(path.join(siteDir, "content"), ".md");
    // The host document, e.g. importing Infusion's own components, such as the live examples of content
    [...fs.readFileSync(wendSite.host, "utf8").matchAll(pattern)].forEach(match => found.add(match[1]));
    [...Object.values(wendSite.modules), wendSite.overrides].filter(dir => fs.existsSync(dir)).forEach(dir => scan(dir, ".vue"));
    return [...found].sort();
};

// Infusion's components which an editing client, e.g. the "Edit in Infusion" extension, loads into a page from the
// site's own copy of Infusion - the resize bar setting off its panel, and Infusion's static editing: the mixin making a
// block editable, the block editor, its serialiser of markdown, its reader of widgets dropped as ZIP files, the editing
// panel, its logic and its source view, and the bundle of CodeMirror 6 which the source view uses - published whether
// or not content refers to them
wend.trace.editingFiles = [
    "src/components/sfc/fluid-resizeBar.vue",
    "src/components/staticEditing/js/fluid-withEditing.js",
    "src/components/staticEditing/js/fluid-markdownSerializer.js",
    "src/components/staticEditing/js/fluid-zip.js",
    "src/components/staticEditing/sfc/fluid-blockEditor.vue",
    "src/components/staticEditing/js/fluid-staticEditing.js",
    "src/components/staticEditing/sfc/fluid-staticEditor.vue",
    "src/components/staticEditing/sfc/fluid-sourceView.vue",
    "src/lib/fluid-lint/fluid-lint.js"
];

/**
 * Publish the site's one copy of Infusion, at `js/infusion-6/` - the files a page loads to boot Infusion, and every
 * file of Infusion to which content refers - each at its path within the Infusion which built the site, so that a page
 * always runs the Infusion it was built with. Files published by an earlier build which neither names are removed
 * @param {String} outDir - The publish directory
 * @param {String} infusionDir - The directory of the Infusion which built the site
 * @param {String[]} files - The paths within Infusion of the files to be published
 * @return {String} The path of the directory, relative to `outDir`, ending in "/"
 */
wend.trace.publishInfusion = function (outDir, infusionDir, files) {
    const targetDir = path.join(outDir, wend.trace.infusionDir);
    const missing = files.filter(file => !fs.existsSync(path.join(infusionDir, file)));
    if (missing.length > 0) {
        throw new Error("Content refers to files absent from Infusion at " + infusionDir + ": " + missing.join(", "));
    }
    if (fs.existsSync(targetDir)) {
        const keep = new Set(files.map(file => path.join(targetDir, file)));
        siteModel.listFiles(targetDir).map(file => path.join(targetDir, file)).filter(file => !keep.has(file))
            .forEach(file => fs.rmSync(file));
    }
    files.forEach(file => {
        const target = path.join(targetDir, file);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.copyFileSync(path.join(infusionDir, file), target);
    });
    return wend.trace.infusionDir;
};

// The directory, beneath the site's static files, of the SFCs of widgets which content may hold - e.g. one inserted
// from the block editor's toolbar, or pasted as PTF. Published at sfc/ beside the site's other static files, and
// imported by every page, under the module `wendWidgets`. Each defines the layer its file is named for, e.g.
// fluid-demos-counter.vue defines fluid.demos.counter
wend.trace.widgetDir = "sfc";

// The directory, beneath the site's static files, of its images - one dropped into a page being edited is written
// there, published at img/ beside the site's other static files
wend.trace.imageDir = "img";

/**
 * Name the layer an SFC defines, by the convention that its file is named for it
 * @param {String} file - The file's path, e.g. "fluid-demos-counter.vue"
 * @return {String} The layer, e.g. "fluid.demos.counter"
 */
wend.trace.layerOfFile = file => path.basename(file).replace(/\.(vue|js)$/, "").replace(/-/g, ".");

/**
 * List the SFCs of widgets the site holds in static/sfc
 * @param {String} siteDir - The site's working tree
 * @return {Object[]} `{file, layer}` for each, `file` relative to static/sfc
 */
wend.trace.widgetFiles = function (siteDir) {
    const dir = path.join(siteDir, "static", wend.trace.widgetDir);
    return fs.existsSync(dir) ? siteModel.listFiles(dir).filter(file => file.endsWith(".vue")).sort()
        .map(file => ({file: file.split(path.sep).join("/"), layer: wend.trace.layerOfFile(file)})) : [];
};

/**
 * Publish what an editing client needs to migrate a page's blocks in place into live components - Infusion's own
 * browser files, as its FluidBoot.js would load them, published with the files content refers to by `publishInfusion`,
 * and the Single File Components of each of the site's modules - see plan item 13, and site.js
 * @param {String} siteDir - The directory holding the site
 * @param {String} outDir - The publish directory
 * @param {String} infusionDir - The directory of the Infusion which built the site
 * @param {Object} bootRecord - Infusion's record of how a page boots it, `fluid.bootRecord` - its `bootPath`, the path
 * of FluidBoot.js, and `files`, the files FluidBoot.js loads, in order, all relative to `infusionDir`
 * @return {Object} The record of the published material, relative to the root of the site - `framework`, the root of
 * Infusion and its files; `modules`, the root and files of each module's SFCs, by module id; `siteImports`, the SFCs the
 * host document imports, `{module, file}` each; `widgetImports`, the SFCs of widgets in static/sfc; and `pageBoot`,
 * the script booting a page's tree
 */
wend.trace.publishMigration = function (siteDir, outDir, infusionDir, bootRecord) {
    // Each module's SFCs, and the files beside them to which they refer, e.g. a shortcode's widget library - with the
    // site's forks in place of the module's own files, so that a page imports what the site renders with
    const modules = Object.fromEntries(Object.entries(wendSite.modules).map(([id, dir]) => {
        const files = ["sfc", "adapt"].filter(sub => fs.existsSync(path.join(dir, sub)))
            .flatMap(sub => siteModel.listFiles(path.join(dir, sub)).map(file => [sub, ...file.split(path.sep)].join("/")))
            .filter(file => /\.(vue|js|css)$/.test(file)).concat(id === "wend" ? [wend.trace.pageBootFile] : []).sort();
        const root = wend.trace.publishModule(dir, files, outDir, "wend-" + id, file => wendSite.effectiveFile(id, file));
        return [id, {root, files}];
    }));
    const infusionFiles = bootRecord.files;
    // The SFCs the site's host document imports - all those a page's whole component tree may use - by module
    const siteImports = [...fs.readFileSync(wendSite.host, "utf8").matchAll(/<fluid-import src="%([\w-]+)\/([^"]+)"/g)]
        .map(match => ({module: match[1], file: match[2]}));
    return {
        siteImports,
        modules,
        // The SFCs of widgets in static/sfc, which are published with the site's static files - see widgetDir
        widgetImports: wend.trace.widgetFiles(siteDir).map(widget => widget.file),
        // The same copy as content refers to, and pages booting Infusion load, so that a page which has booted it, e.g.
        // for a live island, is recognised as running this Infusion - see bridge.js in the "Edit in Infusion" extension
        framework: {root: wend.trace.publishInfusion(outDir, infusionDir,
            [...new Set([bootRecord.bootPath, ...infusionFiles, ...wend.trace.infusionReferences(siteDir), ...wend.trace.editingFiles])].sort()),
        files: infusionFiles, bootPath: bootRecord.bootPath},
        // The script booting a page's whole component tree, published with wend's SFCs - see pageBoot.js
        pageBoot: modules.wend.root + wend.trace.pageBootFile
    };
};

/**
 * Resolve the sources of the framing of every page which the site's editing configuration names. One is either a file
 * of the site's own, named by its `path`, e.g. wend.json, or a file of one of its modules, named by `module` and `file`,
 * e.g. the theme's footer - which the site edits by forking it: its path is that of the site's fork (see
 * `wendSite.overridePath`), whose first edit creates it from the module's file, and which thereafter stands in its place
 * @param {Object} editing - The site's editing configuration, e.g. wend/editing.json
 * @return {Object[]} `{path, kind, layer, label, module, file, forked, effective}` for each - `effective` the absolute
 * path of the file in effect, the fork if it exists
 */
wend.trace.framingSources = function (editing) {
    return (editing.framing || []).map(framing => {
        const forkable = !!framing.module;
        const filePath = forkable ? wendSite.overridePath(framing.module, framing.file) : framing.path;
        return {...framing, path: filePath, kind: framing.kind || "sfc",
            forked: forkable ? fs.existsSync(path.join(wendSite.siteDir, filePath)) : true,
            effective: forkable ? wendSite.effectiveFile(framing.module, framing.file) : path.join(wendSite.siteDir, framing.path)};
    });
};

/**
 * Hash the sources of the framing, keyed by their paths - a forkable one not yet forked by the hash of the module's
 * file, which an edit forks from - see `framingSources`
 * @param {Object} editing - The site's editing configuration
 * @return {Object<String, String>} The hashes, by path
 */
wend.trace.framingHashes = function (editing) {
    return Object.fromEntries(wend.trace.framingSources(editing).filter(framing => fs.existsSync(framing.effective))
        .map(framing => [framing.path, siteModel.hashText(fs.readFileSync(framing.effective, "utf8"))]));
};

/**
 * Make the provenance record of a page - what an editing client needs to find the source of the page and of its
 * blocks, and the trace by which to tell when an edit of them has been published
 * @param {Object} page - The page's record, as made by siteModel
 * @param {Object} editing - The site's editing configuration, e.g. wend/editing.json - its `repo` and `branch`
 * @param {Object<String, String>} sources - The hash of each content file, and of each source of framing
 * @param {String[]} rendererScripts - The scripts of the markdown pipeline, relative to the root of the site, as
 * returned by `publishRenderer`
 * @param {Object} migration - The material for migrating the page in place, as returned by `publishMigration`
 * @return {Object} The provenance record. Every page has one, naming how its whole component tree is booted over it; one
 * with a source of its own to edit also names the source and the blocks rendered from it
 */
wend.trace.provenanceRecord = function (page, editing, sources, rendererScripts, migration) {
    // The trace is at the root of the site - its URL relative to the page's own directory
    const depth = page.outputPath.split("/").filter(segment => segment).length - 1;
    const toRoot = depth === 0 ? "./" : "../".repeat(depth);
    const togo = {
        version: 1,
        repo: editing.repo,
        branch: editing.branch,
        trace: toRoot + wend.trace.traceFile,
        page: page.relPermalink,
        // How a client boots the page's whole component tree over it - from the slice of the model it alone needs,
        // beside it, with the SFCs of the whole site
        model: path.basename(wend.trace.pageModelPath(page.outputPath)),
        migration: {
            framework: {root: toRoot + migration.framework.root, files: migration.framework.files},
            modules: {...Object.fromEntries(Object.entries(migration.modules).map(([id, module]) => [id, toRoot + module.root])),
                wendWidgets: toRoot + wend.trace.widgetDir + "/"},
            siteImports: [...migration.siteImports.map(({module, file}) => "%" + module + "/" + file), ...migration.widgetImports.map(file => "%wendWidgets/" + file)],
            pageBoot: toRoot + migration.pageBoot,
            // The layer of the root of the page's tree - see `root` in wend.site.json
            root: wendSite.root
        },
        // The sources of the framing of every page - e.g. its footer, rendered by an SFC - which a client may edit from
        // any page, an edit of one showing on every page holding it. Each is of a `kind`: "sfc", naming the layer its
        // SFC defines, by which the client applies an edit to the page's live tree, or "patch", the site's
        // configuration, wend.json, whose members the client sets on the root of the tree
        // A source forked from a module's file, not yet forked, names where its text is published - its `origin` - from
        // which a client reads the text it forks
        framing: wend.trace.framingSources(editing).filter(framing => sources[framing.path]).map(framing => ({
            path: framing.path, kind: framing.kind, layer: framing.layer, label: framing.label, hash: sources[framing.path],
            ...framing.forked ? {} : {origin: toRoot + migration.modules[framing.module].root + framing.file}
        }))
    };
    // A list of a section's posts names the directory of their sources, into which a client writes a new post, and the
    // elements listing them, at whose head it offers to
    if (page.kind === "section") {
        // Its further pages, e.g. /post/page/2/, list the same section
        togo.section = {contentDir: "content/" + page.relPermalink.split("/")[1], itemSelector: "article.post-preview"};
    }
    // A page with a source of its own has blocks which can be edited
    if (page.sourcePath) {
        Object.assign(togo, {
            source: {path: page.sourcePath, hash: sources[page.sourcePath]},
            // Each block names the layers of the component which renders it, so that a client may boot one over it
            blocks: [{selector: "[data-fluid-block=\"markdown\"]", kind: "markdown", key: page.sourcePath + "#body", layers: ["wend.content"]}],
            // How the client renders a source as the build does: load these scripts, in order, into the page, and
            // call wendMarkdown.renderSource(wendMarkdown.make(wendMarkdown.browserLibs(window)), text)
            renderers: {
                markdown: {scripts: rendererScripts.map(script => toRoot + script), global: "wendMarkdown"}
            },
            // The widgets which may be inserted into its blocks - the layers of static/sfc reaching
            // fluid.topLevelWidget - and where the SFCs of further ones, e.g. pasted as PTF, are written
            widgets: {
                dir: "static/" + wend.trace.widgetDir,
                layers: (migration.widgets || []).map(widget => ({layer: widget.layer, src: toRoot + wend.trace.widgetDir + "/" + widget.file}))
            },
            // Where images dropped into its blocks are written, e.g. those a widget dropped as a ZIP file brings
            images: {
                dir: "static/" + wend.trace.imageDir
            }
        });
    }
    return togo;
};

/**
 * Determine whether a page holds an island which must run in the browser, e.g. a shortcode whose widget is booted by
 * its component, so that the page must boot Infusion - see `insertBoot`
 * @param {Object} page - The page's record, as made by siteModel
 * @param {String[]} bootLayers - The layers of such islands, from the site's editing configuration
 * @return {Boolean} `true` if the page's content holds an island bearing one of them
 */
wend.trace.needsBoot = function (page, bootLayers) {
    return bootLayers.some(layer => (page.content || "").includes(`fluid-layers="${layer}"`));
};

/**
 * Make a page boot Infusion in the browser, from the copy the site publishes, and boot its whole component tree over
 * it from its slice of the model, with pageBoot.js - so that its islands, e.g. a shortcode whose widget is booted by
 * its component, are live, as children of the components rendering its blocks. Appended to the body, since
 * a <fluid-module> or <fluid-import> in the head would close it as a browser parses the page:
 * the module of the site's SFCs, the imports of all of them, FluidBoot.js, which declares Infusion's module at the
 * directory holding it and loads Infusion's files as the page is parsed, and pageBoot.js
 * @param {Document} dokkument - The rendered document
 * @param {Object} page - The page's record, as made by siteModel
 * @param {Object} migration - The published material, as returned by `publishMigration`
 */
wend.trace.insertBoot = function (dokkument, page, migration) {
    const depth = page.outputPath.split("/").filter(segment => segment).length - 1;
    const toRoot = depth === 0 ? "./" : "../".repeat(depth);
    const append = (tag, attrs) => {
        const element = dokkument.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
        dokkument.body.appendChild(element);
    };
    // The page's own component tree renders the whole of it, so Infusion boots none of its elements alone
    dokkument.documentElement.setAttribute("fluid-page-boot", "");
    Object.entries(migration.modules).forEach(([id, module]) => append("fluid-module", {id, src: toRoot + module.root}));
    migration.siteImports.forEach(({module, file}) => append("fluid-import", {src: "%" + module + "/" + file}));
    if (migration.widgetImports.length > 0) {
        append("fluid-module", {id: "wendWidgets", src: toRoot + wend.trace.widgetDir + "/"});
        migration.widgetImports.forEach(file => append("fluid-import", {src: "%wendWidgets/" + file}));
    }
    append("script", {src: toRoot + migration.framework.root + migration.framework.bootPath, "fluid-hydrated": "%infusion-6"});
    append("script", {src: toRoot + migration.pageBoot, "fluid-hydrated": "%wend", "data-fluid-boot-page": ""});
};

/**
 * Write a page's provenance record into its document's head, as an inert script element
 * @param {Document} dokkument - The rendered document
 * @param {Object} record - The provenance record, as made by `provenanceRecord`
 */
wend.trace.insertProvenance = function (dokkument, record) {
    const script = dokkument.createElement("script");
    script.setAttribute("type", wend.trace.provenanceType);
    script.setAttribute("id", "fluid-provenance");
    // Material of the build rather than of the page's templates, as is the script booting Infusion - so that the
    // page's component tree, booted over the page, leaves it alone - see fluid.classifyScriptNode
    script.setAttribute("fluid-hydrated", "provenance");
    // Escape "<" so that no content of the record can close the script element
    script.textContent = JSON.stringify(record).replace(/</g, "\\u003c");
    dokkument.head.appendChild(script);
};

module.exports = wend.trace;
