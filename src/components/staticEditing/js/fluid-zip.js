"use strict";

// Reading of a widget dropped as a ZIP file - loaded into a page being edited from the site's copy of Infusion, e.g. by
// the "Edit in Infusion" extension's bridge.js. A ZIP file holds a widget as the files
// of its PTF document, as Infusion's fluid.ptf.componentToParts makes them, and any images it shows:
//   layers/<layer>.vue | .js | .json      - a layer part, named for the layer it defines, e.g. layers/fluid.demos.counter.vue
//   components/potentia.json              - the potentia of the widget's root component, e.g. {"$layers": ["fluid.demos.counter"]}
//   components/<member>/.../potentia.json - the potentia of a component beneath it, at that path of member names
//   components/[<member>/...]live.json    - the live values of a component, as a PTF "live" part holds them
//   img/<name>                            - an image, written to the site's images as <name>
// A ZIP file holding a PTF document itself, as a file ending ".ptf", is read as that document, and any images beside it.
// Any other .vue or .js file is taken as a layer, named for its file as fluid.pathToLayerName names an SFC's - e.g.
// energy-driver.vue defines energy.driver - and an image anywhere is taken as if in img/. Each layer's file must define
// the layer it is named for, since a site finds a layer by its file's name once published, and a script loaded by the
// `src` of another file is refused, since a widget can't carry plain scripts. A ZIP file with no potentia for its root
// is a widget of its only layer, or else of its driver - the one layer which no other of its files refers to, whether
// by a <fluid-import> or <script> src, or by its name, e.g. in a `$layers` or `fluid-layers`.
// Entries are read by the ZIP file's central directory, each stored or deflated - ZIP64 and encrypted entries are not.

const fluidZipScope = function (fluid) {
    fluid.registerNamespace("fluid.zip");

    // The MIME types of layer parts, as Infusion's fluid.layerMimeTypes names them
    fluid.zip.layerMimeTypes = {
        vue: "text/x-vue",
        js: "text/javascript",
        json: "application/json"
    };

    // The extensions of files taken as images
    fluid.zip.imagePattern = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

    /**
     * Inflate the raw deflated data of a ZIP entry
     * @param {Uint8Array} data - The deflated data
     * @return {Promise<Uint8Array>} The inflated bytes
     */
    fluid.zip.inflate = async function (data) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    };

    /**
     * Determine whether bytes are those of a ZIP file, by its signature
     * @param {Uint8Array} bytes - The bytes
     * @return {Boolean} `true` if they begin as a ZIP file does
     */
    fluid.zip.isZip = bytes => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

    /**
     * Read the files of a ZIP file
     * @param {Uint8Array} bytes - The ZIP file's bytes
     * @return {Promise<Object[]>} `{name, bytes}` for each file it holds, `name` its path within the ZIP file -
     * directories are left out
     */
    fluid.zip.read = async function (bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        // The end of central directory record, beneath a comment of at most 65535 bytes
        let end = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535) && end < 0; --i) {
            if (view.getUint32(i, true) === 0x06054b50) {
                end = i;
            }
        }
        if (end < 0) {
            throw new Error("The file is not a ZIP file which can be read");
        }
        const count = view.getUint16(end + 10, true);
        let offset = view.getUint32(end + 16, true);
        const decoder = new TextDecoder();
        const entries = [];
        for (let n = 0; n < count; ++n) {
            if (view.getUint32(offset, true) !== 0x02014b50) {
                throw new Error("The ZIP file's directory is damaged");
            }
            const flags = view.getUint16(offset + 8, true);
            const method = view.getUint16(offset + 10, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const nameLength = view.getUint16(offset + 28, true);
            const extraLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const localOffset = view.getUint32(offset + 42, true);
            const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
            offset += 46 + nameLength + extraLength + commentLength;
            if (!name.endsWith("/")) {
                if (flags & 1) {
                    throw new Error("The ZIP file's entry " + name + " is encrypted");
                }
                const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
                const data = bytes.subarray(start, start + compressedSize);
                let content;
                if (method === 0) {
                    content = data;
                } else if (method === 8) {
                    content = await fluid.zip.inflate(data);
                } else {
                    throw new Error("The ZIP file's entry " + name + " is compressed by a method which can't be read (" + method + ")");
                }
                entries.push({name, bytes: content});
            }
        }
        return entries;
    };

    /**
     * Determine whether a file of a ZIP file is of no account - made by the archiver rather than the widget's author
     * @param {String} name - The file's path within the ZIP file
     * @return {Boolean} `true` if it is to be ignored
     */
    fluid.zip.isIgnored = name => /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/.test(name);

    /**
     * Render a component's path of member names as a PTF part filename, as Infusion's fluid.ptf.segsToFilename does
     * @param {String[]} segs - The member names
     * @return {String} The filename, "/" for the root
     */
    fluid.zip.segsToFilename = segs => "/" + segs.map(seg => encodeURIComponent(seg)).join("/");

    /**
     * Name the layer a file of a ZIP file defines, as Infusion's fluid.pathToLayerName names that of a Single File
     * Component - e.g. "energy-driver.vue" defines energy.driver, and "fluid.demos.counter.vue" fluid.demos.counter
     * @param {String} base - The file's name, without its directory
     * @return {String} The layer's name
     */
    fluid.zip.fileToLayerName = base => base.substring(0, base.lastIndexOf(".")).replace(/-/g, ".");

    /**
     * Name the file a layer is held in, as the extension writes it to the site - see fluid.blockEditor.layerFile
     * @param {String} layerName - The layer's name
     * @param {String} extension - The file's extension, e.g. "vue"
     * @return {String} The file's name, e.g. "energy-driver.vue"
     */
    fluid.zip.layerToFileName = (layerName, extension) => layerName.replace(/\./g, "-") + "." + extension;

    /**
     * Find the names of the layers a layer's text defines, by its calls to `fluid.def` with a literal name
     * @param {String} text - The text
     * @return {String[]} The names
     */
    fluid.zip.definedLayers = text => [...text.matchAll(/fluid\.def\(\s*["'`]([^"'`]+)["'`]\s*,/g)].map(match => match[1]);

    /**
     * Determine whether a text loads a file by the `src` of an element, e.g. a `<fluid-import>` or `<script>`
     * @param {String} file - The file's name
     * @param {String} text - The text
     * @return {Boolean} `true` if it does
     */
    fluid.zip.loadsBySrc = (file, text) => new RegExp("src\\s*=\\s*[\"'](?:[^\"']*/)?" + fluid.zip.escapeRegExp(file) + "[\"']").test(text);

    /**
     * Escape a string to be matched literally within a regular expression
     * @param {String} text - The string
     * @return {String} It, escaped
     */
    fluid.zip.escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    /**
     * Determine whether a layer's file is referred to by another of the widget's files - by the `src` of a
     * `<fluid-import>` or `<script>`, by a `fluid-layers` attribute, or by its name as a string, e.g. in `$layers`
     * @param {String} layerName - The layer's name
     * @param {String} file - The name of its file
     * @param {String} text - The text of another file
     * @return {Boolean} `true` if that text refers to it
     */
    fluid.zip.refersTo = function (layerName, file, text) {
        return new RegExp("[\"'`\\s]" + fluid.zip.escapeRegExp(layerName) + "[\"'`\\s,]").test(text) || fluid.zip.loadsBySrc(file, text);
    };

    /**
     * Check the layers a ZIP file holds, that each will be found where the site looks for it once published: a Single
     * File Component must define the layer its file is named for, since a site finds a layer by its file's name, and a
     * script loaded by another file's `src` is not a layer, which a widget can't yet carry. `{self}.container` is
     * refused too: it names nothing, a component's element being its view's, and whatever waits on it never runs
     * @param {Object[]} layerParts - The layer parts
     * @param {String[]} layerFiles - The name of the file of each
     */
    fluid.zip.checkLayers = function (layerParts, layerFiles) {
        const problems = [];
        layerParts.forEach((part, i) => {
            const file = layerFiles[i];
            const others = layerParts.filter((other, j) => j !== i);
            const defined = fluid.zip.definedLayers(part.body);
            if (file.endsWith(".js") && others.some(other => fluid.zip.loadsBySrc(file, other.body))) {
                problems.push(file + " is a script loaded by its src, which a widget can't carry - move its code into the " +
                    "<script> of the SFC which loads it");
            }
            const missing = [...part.body.matchAll(/<fluid-import\s[^>]*src\s*=\s*["']([^"']+)["']/g)].map(match => match[1])
                .filter(src => !src.startsWith("%") && !/^([a-z]+:)?\//i.test(src) && !layerFiles.includes(src.substring(src.lastIndexOf("/") + 1)));
            if (missing.length > 0) {
                problems.push(file + " imports " + missing.join(", ") + ", which the ZIP file doesn't hold");
            }
            if (/\{self\}\.container\b/.test(part.body)) {
                problems.push(file + " refers to {self}.container, which no component has, so whatever waits on it never " +
                    "runs - a component's element is {self}.view.container");
            }
            if (defined.length > 0 && !defined.includes(part.filename)) {
                const extension = file.substring(file.lastIndexOf(".") + 1);
                problems.push(file + " defines " + defined.join(", ") + " but no " + part.filename + ", the layer its name gives - " +
                    "a file defines the layer it is named for, e.g. " + fluid.zip.layerToFileName(defined[0], extension));
            }
        });
        if (problems.length > 0) {
            throw new Error("The ZIP file's layers can't be published as they are: " + problems.join("; "));
        }
    };

    /**
     * Find the root layer of a widget whose ZIP file names none in components/potentia.json - its only layer, or else
     * its driver, the only one which none of its other files refers to
     * @param {Object[]} layerParts - The layer parts
     * @param {String[]} layerFiles - The name of the file of each
     * @return {String} The root layer's name
     */
    fluid.zip.rootLayer = function (layerParts, layerFiles) {
        const unreferred = layerParts.filter((part, i) => !layerParts.some((other, j) => j !== i &&
            fluid.zip.refersTo(part.filename, layerFiles[i], other.body)));
        let togo;
        if (layerParts.length === 0) {
            throw new Error("The ZIP file holds no widget - neither layers nor a .ptf file");
        } else if (layerParts.length === 1) {
            togo = layerParts[0].filename;
        } else if (unreferred.length === 1) {
            togo = unreferred[0].filename;
        } else {
            throw new Error("The ZIP file holds several layers but no components/potentia.json naming the widget's own, " +
                "and its driver can't be told - " + (unreferred.length === 0 ? "each layer is referred to by another" :
                unreferred.map(part => part.filename).join(", ") + " are each referred to by no other"));
        }
        return togo;
    };

    /**
     * @typedef {Object} ZipWidget
     * @property {String} [ptf] - The text of a PTF document the ZIP file holds, if it holds one
     * @property {Object[]} [parts] - Otherwise, the PTF parts its files make, `{kind, contentType, filename, body}`
     * @property {Object[]} images - `{name, bytes}` for each image, `name` its path beneath the site's images
     */

    /**
     * Read the widget a ZIP file holds, as the files of its PTF document
     * @param {Object[]} entries - The ZIP file's files, as by `fluid.zip.read`
     * @return {ZipWidget} The widget
     */
    fluid.zip.toWidget = function (entries) {
        const decoder = new TextDecoder();
        const images = [];
        const layerParts = [];
        const componentParts = [];
        // The name of the file of each layer part, in step with layerParts
        const layerFiles = [];
        let ptf = null;
        entries.filter(entry => !fluid.zip.isIgnored(entry.name)).forEach(entry => {
            const name = entry.name.replace(/^\/+/, "");
            const components = /^components\/(?:(.*)\/)?(potentia|live)\.json$/.exec(name);
            const base = name.substring(name.lastIndexOf("/") + 1);
            if (fluid.zip.imagePattern.test(name)) {
                images.push({name: name.replace(/^img\//, "").split("/").filter(seg => seg && seg !== "..").join("/"), bytes: entry.bytes});
            } else if (name.endsWith(".ptf")) {
                ptf = decoder.decode(entry.bytes);
            } else if (components) {
                const segs = components[1] ? components[1].split("/").filter(seg => seg) : [];
                componentParts.push({kind: components[2], contentType: fluid.zip.layerMimeTypes.json,
                    filename: fluid.zip.segsToFilename(segs), body: decoder.decode(entry.bytes)});
            } else if (/\.(vue|js)$/.test(base) || name.startsWith("layers/") && base.endsWith(".json")) {
                const extension = base.substring(base.lastIndexOf(".") + 1);
                layerParts.push({kind: "layer", contentType: fluid.zip.layerMimeTypes[extension],
                    filename: fluid.zip.fileToLayerName(base), body: decoder.decode(entry.bytes)});
                layerFiles.push(base);
            }
        });
        let togo;
        if (ptf !== null) {
            togo = {ptf, images};
        } else {
            fluid.zip.checkLayers(layerParts, layerFiles);
            const hasRoot = componentParts.some(part => part.kind === "potentia" && part.filename === "/");
            if (!hasRoot) {
                componentParts.unshift({kind: "potentia", contentType: fluid.zip.layerMimeTypes.json, filename: "/",
                    body: JSON.stringify({$layers: [fluid.zip.rootLayer(layerParts, layerFiles)]})});
            }
            togo = {parts: [...layerParts, ...componentParts], images};
        }
        return togo;
    };

};

if (typeof(fluid) !== "undefined") {
    fluidZipScope(fluid);
}
