<script>
fluid.def("fluid.demos.todoList.withAssignee", {
    $layers: "fluid.demos.assignees",
    assignees: {
        $reactiveRoot: ["Ashiata Shiemash", "Gornahoor Harharkh", "Makary Kronbernkzion"]
    },
    assignItem: {
        $method: {
            func: (todos, itemIndex, assignee) => {
                todos[itemIndex].assignee = assignee;
            },
            args: ["{self}.todos", "{0}:itemIndex", "{1}:assignee"]
        }
    },
});

/** Tag layer to allow assignees to be resolved from around the tree */
fluid.def("fluid.demos.assignees", {
    $layers: "fluid.component"
});
</script>
