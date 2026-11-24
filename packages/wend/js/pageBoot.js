"use strict";

// Boots the whole of a page of the site in the browser, from the slice of the site's model the build wrote beside it
// (`<page>.model.json` - see trace.js) - the site's configuration, wend.json, its own record, and the values it read of computations shared
// with other pages - so that the page's own document component renders the whole of it, claiming its markup as the
// build rendered it. The islands of its content, e.g. a shortcode's widget, are then children of the components
// rendering its blocks, so that adapting those components later, e.g. when the page is edited in place, leaves the
// widgets as they are.
//
// Published with the site's SFCs, and named by each page's provenance record as `migration.pageBoot`. A page whose islands
// must run in the browser loads it after FluidBoot.js, bearing `data-fluid-boot-page`, and it boots the page once the
// document has loaded. An editing client, e.g. the "Edit in Infusion" extension, loads it without, and calls `boot`.
// Either way the page's root element bears `fluid-page-boot`, so that Infusion boots none of its elements alone.

(function () {
    const wendPageBoot = {
        booted: null
    };

    /**
     * Boot the page's whole component tree from its slice of the site's model, once
     * @param {Object} provenance - The page's provenance record, or as much of it as booting needs - its `model` and `migration`
     * @return {Promise<Object>} The site's component
     */
    wendPageBoot.boot = function (provenance) {
        if (!wendPageBoot.booted) {
            wendPageBoot.booted = (async function () {
                // Relative to the page's own location, not to any <base> it declares
                const response = await fetch(new URL(provenance.model, location.href));
                const slice = await response.json();
                // The files of the layers which rendered the page are loaded first - only those, of all the site's
                // imports - so that the tree's first rendering is its last, claiming the page's markup as it stands
                const imported = (slice.layers || []).filter(layerName => fluid.loadImport(layerName));
                await Promise.all(imported.map(layerName => fluid.cell.waitFor(fluid.subscribeDocToInjections(layerName, document))));
                // The site's patch, wend.json, as the build applies it - see siteModel.patchOptions
                const isSyntax = value => !!value && typeof(value) === "object" && Object.keys(value).some(key => key.startsWith("$"));
                const patchOptions = Object.fromEntries(Object.entries(slice.patch).map(([member, value]) =>
                    [member, isSyntax(value) ? value : {$reactiveRoot: value}]));
                const site = fluid.initFreeComponent(provenance.migration.root, {
                    ...patchOptions,
                    pages: {$reactiveRoot: slice.pages},
                    aliases: {$reactiveRoot: []},
                    data: {$reactiveRoot: {}},
                    ...slice.shared
                });
                await fluid.cell.settle();
                return site;
            })();
        }
        return wendPageBoot.booted;
    };

    window.wendPageBoot = wendPageBoot;

    const script = document.currentScript;
    if (script && script.hasAttribute("data-fluid-boot-page")) {
        fluid.applyOnLoad(() => {
            const provenanceNode = document.getElementById("fluid-provenance");
            wendPageBoot.boot(JSON.parse(provenanceNode.textContent));
        });
    }
})();
