<script>
// The document's <head> - Hugo's partials/head.html, seo/opengraph.html and head_custom.html.
// The Kind-dependent cascade of {{ $.Scratch.Set "Title" ... }} becomes two computed members. Stylesheets and scripts
// are rendered from the document's keyed asset records, so that adaptations override them as data.
fluid.def("beautifulWend.head", {
    title: "$compute:beautifulWend.head.title({document}.page, {site}.config.params.homeTitle)",
    description: "$compute:beautifulWend.head.description({document}.page)",
    shareImage: "$compute:beautifulWend.head.shareImage({document}.page.params, {site}.config.params.logo, {site}.config.baseURL)",
    // The site's own stylesheets, after the theme's - Hugo's `params.custom_css`, as `params.customCSS`
    customStylesheets: "$compute:beautifulWend.head.customStylesheets({site}.config.params.customCSS)",
    // The URL of a <base> element, if any - beautifulWend.kind.404 supplies the site's root, since the 404 page is served at
    // whatever URL was missing, against which its relative URLs would not resolve
    baseHref: false,
    stylesheetTags: {
        $component: {
            $layers: "wend.stylesheetTag",
            $for: {
                source: "{document}.stylesheets",
                valueAs: "stylesheet"
            }
        }
    },
    customStylesheetTags: {
        $component: {
            $layers: "wend.stylesheetTag",
            $for: {
                source: "{head}.customStylesheets",
                valueAs: "stylesheet"
            }
        }
    },
    scriptTags: {
        $component: {
            $layers: "wend.scriptTag",
            $for: {
                source: "{document}.headScripts",
                valueAs: "script"
            }
        }
    }
});

/**
 * Compute the document title - the {{ if .IsHome }} and Kind cascade at the top of Hugo's head.html
 * @param {Object} page - The page record
 * @param {String} homeTitle - The site's `homeTitle` parameter
 * @return {String} The content of the <title> element
 */
beautifulWend.head.title = function (page, homeTitle) {
    let title;
    if (page.kind === "home") {
        title = homeTitle;
    } else if (page.kind === "taxonomy") {
        title = `Overview of all pages with ${page.data.plural}, ordered by ${page.data.singular} - ${homeTitle}`;
    } else if (page.kind === "term") {
        title = `Overview of all pages with the ${page.data.singular} #${page.title} - ${homeTitle}`;
    } else {
        title = page.title + " - " + homeTitle;
    }
    return title;
};

/**
 * Compute the meta description of a page - Hugo's `.Description | default .Params.subtitle | default .Summary`
 * @param {Object} page - The page record
 * @return {String} The description, truncated to 180 characters
 */
beautifulWend.head.description = function (page) {
    const description = page.description || page.params.subtitle || page.summaryText || "";
    return description.length > 180 ? description.substring(0, 179) + "…" : description;
};

/**
 * The site's own stylesheets, as records for wend.stylesheetTag - each a path within the site, e.g. "css/site.css",
 * or a URL
 * @param {String[]} [customCSS] - The site's `params.customCSS`
 * @return {Object[]} The stylesheets, each `{href}` - an empty array if the site names none
 */
beautifulWend.head.customStylesheets = function (customCSS) {
    return (customCSS || []).map(sheet => ({href: /^[a-z]+:|^\//.test(sheet) ? sheet : "/" + sheet}));
};

/**
 * Compute the OpenGraph share image of a page
 * @param {Object} params - The page's front matter
 * @param {String} logo - The site's `logo` parameter
 * @param {String} baseURL - The site's base URL
 * @return {String} The absolute URL of the image, as Hugo's absURL renders it
 */
beautifulWend.head.shareImage = function (params, logo, baseURL) {
    const image = params.share_img ?? params.image ?? logo;
    return /^[a-z]+:/.test(image) ? image : baseURL + "/" + image.replace(/^\//, "");
};
</script>

<template>
<head>
    <meta charset="utf-8" />
    <!-- Hugo emits this after most of the stylesheets, but a <base> rebases only URLs resolved after it is parsed -->
    <base @if="baseHref" href="@{baseHref}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <title>@{title}</title>
    <meta name="description" content="@{description}">
    <meta name="author" content="@{{site}.config.author.name}"/>
    <meta property="og:title" content="@{{document}.page.title}" />
    <meta property="og:description" content="@{description}">
    <meta property="og:image" content="@{shareImage}" />
    <meta property="og:url" content="@{{document}.page.permalink}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="@{{site}.config.title}" />
    <!-- Rooted rather than absolute, as the theme's other assets, so that it is found wherever the site is served -->
    <link href="/@{{site}.config.params.favicon}" rel="icon" type="image/x-icon"/>
    <meta name="generator" content="Infusion 6">
    <link rel="alternate" href="@{{site}.config.baseURL}/index.xml" type="application/rss+xml" title="@{{site}.config.title}">
    <!-- Fragment slots, since no element may wrap these within <head> -->
    <fluid-fragment @id="stylesheetTags"></fluid-fragment>
    <fluid-fragment @id="customStylesheetTags"></fluid-fragment>
    <fluid-fragment @id="scriptTags"></fluid-fragment>
</head>
</template>
