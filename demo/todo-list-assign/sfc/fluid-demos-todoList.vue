<script>
fluid.def("fluid.demos.todoList", {
    $layers: "fluid.sfcTemplateViewComponent",
    todos: {
        $reactiveRoot: []
    },
    filteredTodos: {
        $compute: {
            func: (filters, todos) => {
                console.log("Got filters ", filters);
                return todos.filter(todo => filters.every(filter => filter.accept(todo)));
            },
            args: ["{filters fluid.demos.filter}", "{self}.todos"]
        }
    },
    todoItems: {
        $component: {
            $layers: "fluid.demos.todoItem",
            $for: {
                source: "{todoList}.filteredTodos",
                value: "todo",
                key: "itemIndex"
            },
            text: "{todo}.text",
            completed: "{todo}.completed"
        }
    },
    facets: {
        $component: {
            $layers: "fluid.demos.facets"
        }
    },
    filters: {
        $component: {
            $layers: "fluid.demos.filters"
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
        <section class="fl-controls-section">
            <div @id="facets"></div>
        </section>
        <section class="fl-controls-section">
            <div @id="filters"></div>
        </section>
        <section class="section">
            <input class="input is-rounded" @onkeyup="fluid.demos.todoKeyUp({0}, {todoList}.todos)" type="text" placeholder="New todo">
            <div @id="todoItems" class="section"></div>
        </section>

    </div>
</template>

<style src="%todoApp/css/bulma.css"></style>

<style>
    .fl-controls-section {
        max-width: 35rem;
        margin: auto;
        padding-top: 1rem;
        text-align: left;
    }

    .fl-controls {
        background: #F5F5F5;
        border-radius: 10px;
        margin-bottom: 16px;
        padding: 8px;

        font-size: 1.1em;
    }

    .fl-controls h3 {
        font-size: 1.5em;
        font-weight: 400;
    }

    .fl-control-label {
        padding-right: 5px;
    }

    section.section input {
        width: 25em !important;
        text-align: center;
    }

    .section {
        padding: 1rem 1.5rem;
    }

    section {
        text-align: center;
    }

    html {

        /** Override these insane definitions from bulma.css - see https://github.com/jgthms/bulma/issues/931 **/
        overflow-y: auto;
        overflow-x: auto;

        /** No idea why it now renders by default with a scrollbar. If we don't set this at all, somehow edit UI
         * doesn't constrain its height at all.
         */
        height: calc(100% - 5px);
    }
</style>
