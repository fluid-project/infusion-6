<script>
fluid.def("fluid.demos.todoApp", {
    todoList: {
        $component: {
            $layers: "fluid.demos.todoList",
            todos: "$compute:fluid.demos.fetchTodos()"
        }
    }
});

fluid.demos.fetchTodos = () => [
    {
        "text": "Write some code",
        "completed": false,
        "assignee": "Makary Kronbernkzion"
    },
    {
        "text": "Eat some food",
        "completed": true,
        "assignee": "Makary Kronbernkzion"
    },
    {
        "text": "Sleep",
        "completed": false,
        "assignee": "<none>"
    }
];

</script>

<template>
    <div @id="todoList">
    </div>
</template>

<style>

</style>
