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
        "completed": false
    },
    {
        "text": "Eat some food",
        "completed": true
    },
    {
        "text": "Sleep",
        "completed": false
    }
];

</script>

<template>
    <div @id="todoList">
    </div>
</template>

<style>
html {
    height: 100%;
}
</style>
