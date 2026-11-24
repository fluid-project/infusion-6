<script>
// A navigation entry with a dropdown of children - the {{ if .HasChildren }} branch of Hugo's nav.html
fluid.def("beautifulWend.navItem.parent", {
    children: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{navItem}.item.children",
                valueAs: "child"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: "<a href=\"/@{child.url}\">@{child.name}</a>"
                }
            }
        }
    }
});
</script>

<!-- The theme's {{ if .URL }} ... {{ else }} <a role="button"> branch is dropped - every parent entry in this site's
     menu has a URL. With @if/@else on elements it could be restored directly. -->
<template>
    <li class="navlinks-container">
        <a class="navlinks-parent" href="/@{item.url}">@{item.name}</a>
        <div @id="children" class="navlinks-children"></div>
    </li>
</template>
