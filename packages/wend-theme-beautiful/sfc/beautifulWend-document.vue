<script>
// One output HTML document - Hugo's baseof.html. Created by beautifulWend.site's `documents` list, with the page record as
// the iteration variable `page`.
//
// Hugo's layout lookup (kind x type -> list.html, single.html, index.html, terms.html, 404.html) and the type-specific
// branches within partials ({{ if eq .Type "post" }} ...) become *dynamic layers* named from the page's kind and type.
// Each such layer re-targets the slots below (header, main, footer, ...) - see packages/wend-theme-beautiful/sfc/kinds/.
fluid.def("beautifulWend.document", {
    $layers: ["fluid.component", "{self}.pageLayers"],
    pageLayers: "$compute:beautifulWend.document.pageLayers({self}.page.kind, {self}.page.type, {self}.features)",
    // The switches of the features which a page may have of its own - the site's `features`, overridden by any in the
    // page's front matter, e.g. `features: {katex: true}` - see beautifulWend.document.pageFeatures
    features: "$compute:beautifulWend.document.features({site}.features, {self}.page.params)",

    // Renders into an output document of its own, whose documentElement is the container. Its
    // location is the page's URL, so that on the client, which renders into its own document only, the view renders
    // just when it is this page - recognised by its path relative to the site's base URL, so wherever the site is
    // served from that path, e.g. locally. The build writes each document to the file of the page at its URL.
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.outputDocumentView"],
            documentLocation: "{document}.page.permalink",
            baseURL: "{site}.config.baseURL"
        }
    },

    // Assets are keyed records rather than arrays so that adaptation layers can override or add individual entries
    // by the ordinary merge rules - see beautifulWend.document.selfHosted and beautifulWend.document.hljs.
    // Each $for over them orders them by `priority`, higher first, as Infusion's priorities do
    stylesheets: {
        fontawesome: {priority: 980, href: "https://use.fontawesome.com/releases/v5.5.0/css/all.css"},
        // In place of Bootstrap 3, on which Beautiful Hugo was built - just what the theme's markup uses of it
        base: {priority: 970, href: "/css/beautifulWend-base.css"},
        main: {priority: 960, href: "/css/main.css"},
        syntax: {priority: 940, href: "/css/syntax.css"},
        codeblock: {priority: 930, href: "/css/codeblock.css"},
        // The theme's own styling of its markup - its navigation bar, menus, avatar and media icons
        beautifulWend: {priority: 925, href: "/css/beautifulWend.css"}
    },
    // The site's former /js/ponder.js, which added an anchor to each heading once the page had loaded, is gone - the
    // anchors of content's headings are rendered by its markdown pipeline (packages/wend/js/markdown.js)
    headScripts: {},
    footerScripts: {},
    // The URLs of KaTeX's assets, which beautifulWend.document.katex adds while the site's `features.katex` is set
    katexAssets: {
        css: "https://cdn.jsdelivr.net/npm/katex@0.16.7/dist/katex.min.css",
        js: "https://cdn.jsdelivr.net/npm/katex@0.16.7/dist/katex.min.js",
        autoRender: "https://cdn.jsdelivr.net/npm/katex@0.16.7/dist/contrib/auto-render.min.js"
    },

    head: {
        $component: {
            $layers: "beautifulWend.head"
        }
    },
    navbar: {
        $component: {
            $layers: "beautifulWend.navbar"
        }
    },
    header: {
        $component: {
            $layers: "beautifulWend.header"
        }
    },
    // Hugo's {{ block "main" . }} - every kind layer supplies its own
    main: {
        $component: {
            $layers: "beautifulWend.main"
        }
    },
    // Hugo's page_meta.html, for pages of type "page" only - beautifulWend.type.page restores it
    pageMeta: null,
    footer: {
        $component: {
            $layers: "beautifulWend.footer"
        }
    },
    footerScriptTags: {
        $component: {
            $layers: "wend.scriptTag",
            $for: {
                source: "{document}.footerScripts",
                valueAs: "script"
            }
        }
    }
});

// The features which a page may switch for itself, each by the adaptation layer beautifulWend.document.<feature>. Other
// features, e.g. selfHosted, are the whole site's, each switched by a holder of beautifulWend.site
beautifulWend.document.pageFeatures = ["katex", "hljs"];

/**
 * Compute the switches of a page's features - the site's, overridden by those of the page's front matter
 * @param {Object} siteFeatures - The site's `features`, from wend.json
 * @param {Object} params - The page's front matter, whose `features`, if any, override the site's
 * @return {Object<String, Boolean>} Whether each of beautifulWend.document.pageFeatures is switched on for the page
 */
beautifulWend.document.features = function (siteFeatures, params) {
    const pageFeatures = params.features ?? {};
    // A switch is set only by a Boolean - one missing from the page's front matter, or from the site's features, which
    // are a reactive root, leaves the feature to the site's switch, or off
    const switched = (switches, feature) => typeof(switches?.[feature]) === "boolean" ? switches[feature] : undefined;
    return Object.fromEntries(beautifulWend.document.pageFeatures.map(feature =>
        [feature, (switched(pageFeatures, feature) ?? switched(siteFeatures, feature)) === true]));
};

/**
 * Compute the dynamic layers for a page from its features, kind and type - the last two the analogue of Hugo's template
 * lookup order. Of the candidates, those which are defined are applied. A type layer applies only to a single page.
 * @param {String} kind - Hugo's page kind - "home", "section", "page", "taxonomy", "term" or "404"
 * @param {String} type - The page's content type, e.g. "post", "page", "wip", "infusion-docs"
 * @param {Object<String, Boolean>} features - The page's features, as computed by beautifulWend.document.features
 * @return {String[]} The names of the dynamic layers to apply, most specific, and hence strongest, last
 */
beautifulWend.document.pageLayers = function (kind, type, features) {
    const featureLayers = Object.keys(features).filter(feature => features[feature]).map(feature => "beautifulWend.document." + feature);
    return fluid.definedLayers(featureLayers, "beautifulWend.kind." + kind, kind === "page" ? "beautifulWend.type." + type : []);
};

</script>

<!-- A template rooted at <html>, with head and body as @id slots, rendered onto the documentElement of the page's own
     output document -->
<template>
<html lang="@{{site}.lang}" itemscope itemtype="http://schema.org/WebPage">
    <head @id="head"></head>
    <body class="@{page.type}">
        <!-- Each @id element bears the same tag as its subcomponent's template root, since on elision the container's
             tag wins and the root's is silently dropped -->
        <nav @id="navbar"></nav>
        <header @id="header"></header>
        <div @id="main"></div>
        <div @id="pageMeta"></div>
        <footer @id="footer"></footer>
        <!-- A fragment slot renders the list's members alone, with no wrapping element -->
        <fluid-fragment @id="footerScriptTags"></fluid-fragment>
    </body>
</html>
</template>
