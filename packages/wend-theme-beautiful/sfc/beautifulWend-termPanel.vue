<script>
// One collapsible panel of the taxonomy accordion
fluid.def("beautifulWend.termPanel", {
    anchor: "$compute:beautifulWend.urlize({self}.term.name)",
    termPages: "$compute:beautifulWend.site.lookupPages({site}.pagesByPermalink, {self}.term.pages)",
    pageLinks: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{termPanel}.termPages",
                valueAs: "termPage"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: "<a href=\"@{termPage.relPermalink}\" class=\"list-group-item\">@{termPage.title}</a>"
                }
            }
        }
    }
});
</script>

<template>
    <div class="panel panel-default">
        <a class="collapsed" role="button" data-toggle="collapse" data-target="#collapse@{anchor}" data-parent="#accordion">
            <div class="panel-heading" id="header@{anchor}">
                <h4 class="panel-title">
                    @{term.name}
                    <span class="badge">@{term.count}</span>
                </h4>
            </div>
        </a>
        <div id="collapse@{anchor}" class="panel-collapse collapse">
            <div class="panel-body">
                <a href="/@{{document}.page.data.plural}/@{anchor}/" class="list-group-item view-all">View all</a>
                <div @id="pageLinks" class="list-group"></div>
            </div>
        </div>
    </div>
</template>
