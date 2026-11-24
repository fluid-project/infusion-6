<script>
// Adds a language switcher entry to the navigation bar, after any search entry
fluid.def("beautifulWend.navbar.multilingual", {
    extraItems: {
        languages: {
            priority: 910,
            layer: "beautifulWend.navItem.languages"
        }
    }
});
</script>
