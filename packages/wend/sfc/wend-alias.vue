<script>
// A redirecting alias document - Hugo's alias.html, written at page/1/ beneath each paginated list. Created by
// beautifulWend.site's `aliasDocuments` list, with the alias record `{permalink, outputPath, target}` as the iteration variable
// `alias`, each rendering into an output document of its own at the alias's URL.
fluid.def("wend.alias", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.outputDocumentView"],
            documentLocation: "{alias}.alias.permalink",
            baseURL: "{site}.config.baseURL"
        }
    }
});
</script>

<template>
<html lang="en">
    <head>
        <title>@{alias.target}</title>
        <link rel="canonical" href="@{alias.target}">
        <meta name="robots" content="noindex">
        <meta charset="utf-8">
        <meta http-equiv="refresh" content="0; url=@{alias.target}">
    </head>
</html>
</template>
