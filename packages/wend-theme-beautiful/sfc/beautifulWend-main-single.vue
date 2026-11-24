<script>
// A single page of content - Hugo's _default/single.html. Its optional parts are slots bearing @if,
// absent from the markup when their condition fails. Conditions read whole records of parameters rather than
// optional members of them, since a reference to a missing member is unavailable rather than undefined.
fluid.def("beautifulWend.main.single", {
    $layers: "beautifulWend.main",
    content: {
        $component: {
            $layers: "wend.content",
            html: "{document}.page.content"
        }
    },
    tags: {
        $component: {
            $layers: "beautifulWend.tags",
            tags: "{document}.page.params.tags"
        }
    },
    share: {
        $component: {
            $layers: "beautifulWend.shareLinks"
        }
    },
    related: {
        $component: {
            $layers: "beautifulWend.relatedPosts"
        }
    },
    pager: {
        $component: {
            $layers: "beautifulWend.pager"
        }
    },
    // The comment provider is chosen by configuration rather than hard-coded into this layout, as giscus is in the
    // site's copy of single.html
    // The layers of the comment provider - a bare component rendering nothing, if the site has no comments or names no
    // provider, so that the component rendering them is never left unavailable for want of a layer. Computed here
    // rather than within it, since a component's layers can't be read from the component itself
    commentsLayers: "$compute:beautifulWend.main.single.commentsLayers({site}.config.params)",
    comments: {
        $component: {
            $layers: "{single}.commentsLayers"
        }
    }
});

/**
 * Decide whether to show social share links - the conditions of Hugo's single.html and share-links.html combined.
 * A page's `socialShare` parameter overrides the site's.
 * @param {Object} pageParams - The page's front matter
 * @param {Object} siteParams - The site's parameters
 * @return {Boolean} `true` if share links are to be shown
 */
beautifulWend.main.single.showShare = function (pageParams, siteParams) {
    return pageParams.socialShare ?? siteParams.socialShare ?? false;
};

/**
 * Decide whether to show related posts on a page - only if the site shows them and the page has some
 * @param {Object[]} pages - All of the site's pages, as summarised by beautifulWend.site.relatedIndex
 * @param {Object} page - The page
 * @param {Object} siteParams - The site's parameters
 * @return {Boolean} `true` if related posts are to be shown
 */
beautifulWend.main.single.showRelated = function (pages, page, siteParams) {
    return !!siteParams.showRelatedPosts && beautifulWend.relatedPosts.find(pages, page, siteParams.related_content_limit).length > 0;
};

/**
 * Name the layers of the component rendering comments - the site's provider, if it has comments and names one
 * @param {Object} siteParams - The site's parameters
 * @return {String[]} The provider's layer, or the bare `fluid.component`, which renders nothing - a component with no
 * layers at all is left unavailable
 */
beautifulWend.main.single.commentsLayers = function (siteParams) {
    return siteParams.comments && siteParams.commentsLayer ? [siteParams.commentsLayer] : ["fluid.component"];
};

/**
 * Decide whether to show comments on a page
 * @param {Object} pageParams - The page's front matter
 * @param {Object} siteParams - The site's parameters
 * @return {Boolean} `true` if the site has comments, and they are not disabled for the page
 */
beautifulWend.main.single.showComments = function (pageParams, siteParams) {
    return !!siteParams.comments && pageParams.comments !== false && !pageParams.disableComments;
};
</script>

<!-- The comments slot is a <script>, since the giscus template's root is its loader script, which is elided onto the
     slot whose tag wins -->
<template>
    <div role="main">
        <div class="row">
            <div class="col-lg-8 col-lg-offset-2 col-md-10 col-md-offset-1">
                <article role="main" class="blog-post">
                    <div @id="content" data-fluid-block="markdown"></div>
                    <div @id="tags" @if="{document}.page.params.tags"></div>
                    <div @id="share" @if="beautifulWend.main.single.showShare({document}.page.params, {site}.config.params)"></div>
                    <div @id="related" @if="beautifulWend.main.single.showRelated({site}.relatedIndex, {document}.page, {site}.config.params)"></div>
                </article>
                <ul @id="pager" class="pager blog-pager"></ul>
                <script @id="comments" @if="beautifulWend.main.single.showComments({document}.page.params, {site}.config.params)"></script>
            </div>
        </div>
    </div>
</template>
