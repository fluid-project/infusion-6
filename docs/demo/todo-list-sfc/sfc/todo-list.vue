<script>
fluid.def("fluid.demos.todoList", {
    $layers: "fluid.templateViewComponent",
    todos: {
        $reactiveRoot: []
    },
    todoItems: {
        $component: {
            $layers: "fluid.demos.todoItem",
            $for: {
                source: "{todoList}.todos",
                value: "todo",
                key: "itemIndex"
            },
            text: "{todo}.text",
            completed: "{todo}.completed"
        }
    },
    toggleItem: {
        $method: {
            func: (todos, itemIndex) => {
                todos[itemIndex].completed = !todos[itemIndex].completed;
            },
            args: ["{self}.todos", "{0}:itemIndex"]
        }
    },
    deleteItem: {
        $method: {
            func: (todos, itemIndex) => {
                todos = todos.splice(itemIndex, 1);
            },
            args: ["{self}.todos", "{0}:itemIndex"]
        }
    }
});

fluid.demos.todoKeyUp = function (e, todos) {
    if (e.key === "Enter") {
        const input = e.target;
        const newTodo = {text: input.value, completed: false};
        todos.push(newTodo);
        input.value = "";
    }
};
</script>

<template>
    <div>
        <section class="hero is-dark">
            <div class="hero-body">
                <h1 class="title">Todo List</h1>
                <h2 class="subtitle">Get in charge of your life</h2>
            </div>
        </section>
        <section class="section">
            <input class="input is-rounded" @onkeyup="fluid.demos.todoKeyUp({0}, {todoList}.todos)" type="text" placeholder="New todo">
            <div @id="todoItems" class="section"></div>
        </section>
    </div>
</template>

<style src="@{todoUrlBase}/css/bulma.css"></style>

<style>
    section input {
        width: 25em !important;
        text-align: center;
    }

    section {
        text-align: center;
    }

    html {
        overflow-y: auto;
    }
</style>


