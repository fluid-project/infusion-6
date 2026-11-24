<script>
// Hugo distinguishes between two and three or more languages - a single link versus a dropdown. Only the dropdown is
// sketched here.
fluid.def("beautifulWend.navItem.languages", {
    translationLinks: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{document}.page.translations",
                valueAs: "translation"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: "<a href=\"@{translation.permalink}\">@{translation.languageName}</a>"
                }
            }
        }
    }
});
</script>

<template>
    <li class="navlinks-container">
        <a class="navlinks-parent" role="button" tabindex="0">@{{i18n}.strings.languageSwitcherLabel}</a>
        <div @id="translationLinks" class="navlinks-children"></div>
    </li>
</template>
