<script>
fluid.def("beautifulWend.postMeta.translations", {
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
            relativeContainer: "after: .ponder-date"
        }
    },
    translationLinks: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{postMeta}.page.translations",
                valueAs: "translation",
                positionAs: "position"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    // Hugo's `delimit` - the separator precedes every member but the first. Position is numeric, in list order,
                    // whatever the source
                    template: "<span @if=\"!position.first\">@{{i18n}.strings.translationsSeparator}</span><a href=\"@{translation.permalink}\" lang=\"@{translation.lang}\">@{translation.languageName}</a>"
                }
            }
        }
    }
});
</script>

<template>
    <span class="ponder-translations">&nbsp;&bull;&nbsp;@{{i18n}.strings.translationsLabel}<span @id="translationLinks"></span></span>
</template>
