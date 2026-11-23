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
// Any other .vue or .js file is taken as a layer, named for its file, and an image anywhere is taken as if in img/. A
// ZIP file with no potentia for its root but a single layer is a widget of that layer.
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
                    filename: base.substring(0, base.lastIndexOf(".")), body: decoder.decode(entry.bytes)});
            }
        });
        let togo;
        if (ptf !== null) {
            togo = {ptf, images};
        } else {
            const hasRoot = componentParts.some(part => part.kind === "potentia" && part.filename === "/");
            if (!hasRoot && layerParts.length === 1) {
                componentParts.unshift({kind: "potentia", contentType: fluid.zip.layerMimeTypes.json, filename: "/",
                    body: JSON.stringify({$layers: [layerParts[0].filename]})});
            } else if (!hasRoot) {
                throw new Error(layerParts.length === 0 ? "The ZIP file holds no widget - neither layers/ nor a .ptf file" :
                    "The ZIP file holds several layers but no components/potentia.json naming the widget's own");
            }
            togo = {parts: [...layerParts, ...componentParts], images};
        }
        return togo;
    };

};

if (typeof(fluid) !== "undefined") {
    fluidZipScope(fluid);
}
