<script>
// The page footer - Hugo's partials/footer.html, less its trailing scripts, which are rendered by the document from
// its `footerScripts` record, and less the disclaimer, gcse and piwik blocks, which are contributed by adaptations.
fluid.def("beautifulWend.footer", {
    author: "{site}.config.author"
});
</script>

<!-- The theme's i18n "poweredBy" string holds HTML, which can't be interpolated, so its markup is
     written out here -->
<template>
    <footer>
        <div class="container">
            <div class="row ponder-credits-row">
                <div class="col-lg-8 col-lg-offset-2 col-md-10 col-md-offset-1">
                    <p class="credits copyright text-muted">
                        <a href="@{author.website}">@{author.name}</a>
                        &nbsp;&copy;
                        @{{site}.buildYear}
                    </p>
                    <p class="credits theme-by text-muted">&nbsp;&bull;&nbsp;
                        <a href="https://github.com/fluid-project/infusion-6">Infusion 6</a> powered &nbsp;&bull;&nbsp;
                        Theme <a href="https://github.com/fluid-project/infusion-6/tree/main/packages/wend-theme-beautiful">Beautiful Wend</a> adapted from <a href="https://github.com/halogenica/beautifulhugo">Beautiful Hugo</a> adapted from
                        <a href="https://deanattali.com/beautiful-jekyll/">Beautiful Jekyll</a> &nbsp;&bull;&nbsp;
                    </p>
                </div>
            </div>
        </div>
    </footer>
</template>
