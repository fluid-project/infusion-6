<script>
// The home page header - the {{ if .IsHome }} branches of Hugo's header.html. A partial template adds the avatar and
// media icons before the heading, and the title and subtitle come from site parameters rather than the page.
fluid.def("beautifulWend.header.home", {
    title: "{site}.config.params.homeTitle",
    subtitle: "{site}.config.params.subtitle",
    bigimg: "{site}.config.params.bigimg",
    view: {
        $component: {
            $layers: ["fluid.sfcTemplateViewComponent", "fluid.partialViewComponent"],
            relativeContainer: "before: .ponder-heading"
        }
    },
    mediaIcons: {
        $component: {
            $layers: "beautifulWend.mediaIcons"
        }
    }
});
</script>

<!-- The theme fits the bio image to 300x300 webp via Hugo's resources.Get -->
<template>
    <div class="avatar-container">
        <div class="avatar-img-border">
            <a title="@{{site}.config.title}" href="/">
                <img class="avatar-img" src="/@{{site}.config.params.bio}" alt="@{{site}.config.title}" />
            </a>
        </div>
        <div @id="mediaIcons"></div>
    </div>
</template>
