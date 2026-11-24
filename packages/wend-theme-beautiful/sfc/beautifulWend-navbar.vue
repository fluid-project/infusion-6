<script>
// The site navigation bar - Hugo's partials/nav.html.
// Menu items render from the site's menu tree, plus `extraItems`, a keyed record to which adaptations contribute
// further entries as data - e.g. the search entry of beautifulWend.navbar.gcse and the language switcher of
// beautifulWend.navbar.multilingual. The {{ if isset .Site.Params "gcse" }} and {{ if .Site.IsMultiLingual }} blocks of the
// Hugo partial therefore have no counterpart here.
fluid.def("beautifulWend.navbar", {
    extraItems: {},
    allItems: "$compute:beautifulWend.navbar.allItems({site}.menu, {self}.extraItems)",
    items: {
        $component: {
            $layers: ["beautifulWend.navItem", "{self}.variantLayer"],
            $for: {
                source: "{navbar}.allItems",
                valueAs: "item"
            },
            // An item with children renders as a dropdown; an extra item names its own layer
            // Variants are layers rather than @if/@else pairs since an adaptation may name its own
            variantLayer: "$compute:beautifulWend.navbar.variantLayer({self}.item)"
        }
    }
});

/**
 * Merge the site menu with extra items contributed by adaptations, which are placed after the menu in order of
 * priority
 * @param {Object[]} menu - The site's menu tree
 * @param {Object<String, Object>} extraItems - Extra item records keyed by name, each with `layer` and `priority`
 * @return {Object[]} The items to be rendered
 */
beautifulWend.navbar.allItems = function (menu, extraItems) {
    return [...menu, ...fluid.orderKeyedRecords(extraItems).map(([key, item]) => ({key, ...item}))];
};

/**
 * Choose the variant layer for a navigation item
 * @param {Object} item - A menu tree entry, or an extra item record
 * @return {String} The name of the layer with which the item is rendered
 */
beautifulWend.navbar.variantLayer = function (item) {
    let layer;
    if (item.layer) {
        layer = item.layer;
    } else if (item.children.length > 0) {
        layer = "beautifulWend.navItem.parent";
    } else {
        layer = "beautifulWend.navItem.leaf";
    }
    return layer;
};
</script>

<template>
<nav class="navbar navbar-default navbar-fixed-top navbar-custom">
    <div class="container-fluid">
        <div class="navbar-ponder">
            <a class="navbar-ponder-brand" href="/">@{{site}.config.title}</a>
            <button type="button" class="navbar-toggle" data-toggle="collapse" data-target="#main-navbar">
                <span class="sr-only">@{{i18n}.strings.toggleNavigation}</span>
                <svg width="36" height="36" viewBox="0 0 24 24" stroke="#888" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 7L4 7" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M20 12L4 12" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M20 17L4 17" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
            <div class="collapse navbar-collapse" id="main-navbar">
                <ul @id="items" class="nav navbar-nav navbar-right"></ul>
            </div>
        </div>
    </div>
</nav>
</template>
