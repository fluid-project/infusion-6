<script>
// Root of the whole site: one free component holding the site model, with one beautifulWend.document per output page.
// Replaces Hugo's .Site plus its per-page render loop. Environmental adaptations which in the Hugo theme are cascades
// of {{ if .Site.Params.xxx }} are held here as conditional linkage holders - see the bottom of this layer and
// packages/wend-theme-beautiful/adapt/. None of the layers they broadcast onto (navbar, head, footer, ...) mention them.
fluid.def("beautifulWend.site", {
    // fluid.resolveRoot derives from fluid.component - listing that too, before it, would be an inconsistent hierarchy
    $layers: "fluid.resolveRoot",
    // The site's configuration - the `config` member of wend.json, which as a whole is a patch of this component's
    // members, applied by wend.siteModel.patchOptions - see packages/wend/js/siteModel.js
    config: {$reactiveRoot: {}},
    // Switches of the site's optional features, each held by a member below - the `features` member of wend.json
    features: {$reactiveRoot: {}},
    // Page records, one per output document including paginated list pages - see siteModel.js for their shape
    pages: {$reactiveRoot: []},
    // Static data loaded alongside, e.g. for staticman comment counts - Hugo's .Site.Data
    data: {$reactiveRoot: {}},

    lang: "{self}.config.defaultContentLanguage",
    isMultilingual: "$compute:beautifulWend.site.isMultilingual({self}.config.languages)",
    buildYear: "$compute:beautifulWend.site.buildYear()",
    menu: "$compute:beautifulWend.site.buildMenu({self}.config.menu.main)",
    pagesByPermalink: "$compute:beautifulWend.site.indexPages({self}.pages)",
    // What beautifulWend.relatedPosts needs of every page - read by each single page in place of all the pages, so that the
    // trace of a page depends on this summary, and not on the whole of every page - see beautifulWend.site.relatedIndex
    relatedIndex: "$compute:beautifulWend.site.relatedIndex({self}.pages)",
    // The permalinks of the pages whose content holds maths - read by each list page, which may show them, in place of
    // all the pages - see beautifulWend.document.features
    mathsPermalinks: "$compute:beautifulWend.site.mathsPermalinks({self}.pages)",

    i18n: {
        $component: {
            // Hugo resolves i18n/<lang>.yaml - here the language selects a dynamic layer
            $layers: ["beautifulWend.i18n", "{site}.i18nLayer"]
        }
    },
    i18nLayer: "$compute:beautifulWend.site.i18nLayer({self}.lang)",

    documents: {
        $component: {
            $layers: "beautifulWend.document",
            $for: {
                source: "{site}.pages",
                valueAs: "page"
            }
        }
    },
    // Redirecting alias documents, each `{permalink, outputPath, target}` - see siteModel.js
    aliases: {$reactiveRoot: []},
    aliasDocuments: {
        $component: {
            $layers: "wend.alias",
            $for: {
                source: "{site}.aliases",
                valueAs: "alias"
            }
        }
    },

    // ---- Environmental adaptations ----
    // Each holder exists only while its configuration is set, and while it exists its $linkage broadcasts adaptation
    // layers onto the theme's layers. Cf. fluid.demos.assigneeControl in the todo-list-assign demo.
    // A $linkage entry may bear $if itself, but a holder per feature is kept, as it groups the
    // feature's linkages in its own layer within packages/wend-theme-beautiful/adapt/
    piwik: {
        $component: {
            $if: "{site}.config.params.piwik",
            $layers: "beautifulWend.feature.piwik"
        }
    },
    // katex and hljs are switched for each page by its document's dynamic layers - see beautifulWend.document.pageFeatures
    selfHosted: {
        $component: {
            $if: "{site}.features.selfHosted",
            $layers: "beautifulWend.feature.selfHosted"
        }
    },
    staticman: {
        $component: {
            $if: "{site}.config.params.staticman",
            $layers: "beautifulWend.feature.staticman"
        }
    },
    disclaimer: {
        $component: {
            $if: "{site}.config.params.disclaimerText",
            $layers: "beautifulWend.feature.disclaimer"
        }
    },
    multilingual: {
        $component: {
            $if: "{site}.isMultilingual",
            $layers: "beautifulWend.feature.multilingual"
        }
    }
});

/**
 * Determine whether the site is configured with more than one language
 * @param {Object} [languages] - The `languages` of the site's configuration, if any
 * @return {Boolean} `true` if more than one language is configured
 */
beautifulWend.site.isMultilingual = function (languages) {
    return Object.keys(languages ?? {}).length > 1;
};

/**
 * The year in which the site is built, as rendered in the copyright notice - Hugo's `dateFormat "2006" now`
 * @return {Number} The current year
 */
beautifulWend.site.buildYear = function () {
    return new Date().getFullYear();
};

/**
 * Name the i18n layer holding the strings for a language
 * @param {String} lang - The language code, e.g. "en"
 * @return {String} The layer name, e.g. "beautifulWend.i18n.en"
 */
beautifulWend.site.i18nLayer = function (lang) {
    return "beautifulWend.i18n." + lang;
};

/**
 * Convert the configuration's flat list of menu entries into a tree sorted by weight - Hugo's .Site.Menus.main.ByWeight
 * @param {Object[]} entries - Menu entries, each with `name`, `url`, `weight` and optional `identifier` and `parent`
 * @return {Object[]} Top-level entries, each with a `children` array of entries sorted by weight
 */
beautifulWend.site.buildMenu = function (entries) {
    // Hugo breaks ties of weight by name
    const byWeight = (a, b) => (a.weight ?? 0) - (b.weight ?? 0) || a.name.localeCompare(b.name);
    const withChildren = entries.map(entry => ({...entry, children: []}));
    const byId = Object.fromEntries(withChildren.map(entry => [entry.identifier ?? entry.name, entry]));
    withChildren.forEach(entry => {
        if (entry.parent) {
            byId[entry.parent].children.push(entry);
        }
    });
    withChildren.forEach(entry => entry.children.sort(byWeight));
    return withChildren.filter(entry => !entry.parent).sort(byWeight);
};

/**
 * Index page records by their relative permalink
 * @param {Object[]} pages - The site's page records
 * @return {Object<String, Object>} The page records keyed by `relPermalink`
 */
beautifulWend.site.indexPages = function (pages) {
    return Object.fromEntries(pages.map(page => [page.relPermalink, page]));
};

/**
 * Determine whether the HTML of content holds maths, which the markdown pipeline typesets with KaTeX, marking it by
 * KaTeX's class - see `maths` in wend's js/markdown.js
 * @param {String} [content] - The HTML
 * @return {Boolean} `true` if it holds maths
 */
beautifulWend.site.holdsMaths = function (content) {
    return typeof(content) === "string" && content.includes("class=\"katex");
};

/**
 * List the permalinks of the pages whose content holds maths, typeset by the markdown pipeline - a computation shared
 * by every list page, so that its build trace records this list rather than every page whole
 * @param {Object[]} pages - All of the site's page records
 * @return {String[]} The `relPermalink` of each page holding maths
 */
beautifulWend.site.mathsPermalinks = function (pages) {
    return pages.filter(page => !page.paginator && beautifulWend.site.holdsMaths(page.content)).map(page => page.relPermalink);
};

/**
 * Summarise the site's pages as beautifulWend.relatedPosts.find needs them - each page's permalink, title, kind and tags. A
 * computation shared by every single page, held as `relatedIndex`, so that a page's build trace records this summary
 * rather than every page whole, and the editing of one page's content leaves the other pages' traces unchanged. It is
 * defined here, where it is used, since the SFC of beautifulWend.relatedPosts is loaded only once a page demands its layer
 * @param {Object[]} pages - All of the site's page records
 * @return {Object[]} The summary of each page, in the same order
 */
beautifulWend.site.relatedIndex = function (pages) {
    return pages.map(page => ({relPermalink: page.relPermalink, title: page.title, kind: page.kind, params: {tags: page.params.tags}}));
};

/**
 * Look up a list of page records by permalink, as for a paginator's or related-posts' page list
 * @param {Object<String, Object>} pagesByPermalink - The site's page records keyed by `relPermalink`
 * @param {String[]} [permalinks] - The permalinks to look up
 * @return {Object[]} The corresponding page records
 */
beautifulWend.site.lookupPages = function (pagesByPermalink, permalinks) {
    return (permalinks ?? []).map(permalink => pagesByPermalink[permalink]);
};

/**
 * Convert a string into a URL path segment - Hugo's `urlize`
 * @param {String} text - The text to convert, e.g. a tag name
 * @return {String} The lower-cased, hyphenated form of the text
 */
beautifulWend.urlize = function (text) {
    return text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
};

/**
 * Format a date according to a Go reference-time layout such as "January 2, 2006" - Hugo's `.Date.Format`
 * Only the tokens used by this site's configuration are supported.
 * @param {String} isoDate - The date in ISO 8601 form
 * @param {String} layout - The Go layout string
 * @param {String} lang - The language in which month names are rendered
 * @return {String} The formatted date
 */
beautifulWend.formatDate = function (isoDate, layout, lang) {
    const date = new Date(isoDate);
    const month = date.toLocaleString(lang, {month: "long", timeZone: "UTC"});
    return layout.replace("January", month).replace("2006", String(date.getUTCFullYear()))
        .replace("2", String(date.getUTCDate()));
};
</script>
