<script>
// A list of pages - Hugo's _default/list.html. The page record of a list page carries a `paginator` holding the
// permalinks of the pages on this page of the list, and those of its neighbouring pages - see siteModel.js. Each page
// of a paginated list is a separate document, so pagination is decided entirely by the site model.
fluid.def("beautifulWend.main.list", {
    $layers: "beautifulWend.main",
    content: {
        $component: {
            $layers: "wend.content",
            html: "{document}.page.content"
        }
    },
    listedPages: "$compute:beautifulWend.site.lookupPages({site}.pagesByPermalink, {document}.page.paginator.pages)",
    previews: {
        $component: {
            $layers: "beautifulWend.postPreview",
            $for: {
                source: "{main}.listedPages",
                valueAs: "page"
            }
        }
    },
    listPager: {
        $component: {
            $layers: "beautifulWend.listPager"
        }
    }
});
</script>

<template>
    <div class="container" role="main">
        <div class="row">
            <div class="col-lg-8 col-lg-offset-2 col-md-10 col-md-offset-1">
                <div class="well" @id="content" @if="{document}.page.content"></div>
                <div @id="previews" class="posts-list"></div>
                <ul @id="listPager" @if="beautifulWend.main.hasPager({document}.page.paginator)"></ul>
            </div>
        </div>
    </div>
</template>
