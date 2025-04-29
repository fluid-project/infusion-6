"use strict";

const todos = [
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

fluid.def("fluid.demos.todoItem", {
    $layers: "fluid.templateViewComponent",
    template:
        `<div>
            <span class="todo tag is-large" @class="completed:@{completed},is-info:!@{completed}" @onclick="{todoList}.toggleItem({itemIndex})">
            @{text}<button class="delete is-small" @onclick.stop="{todoList}.deleteItem({itemIndex})"></button>
            </span>
         </div>`
});

fluid.demos.todoKeyUp = function (e, todos) {
    if (e.key === "Enter") {
        const input = e.target;
        const newTodo = {text: input.value, completed: false};
        todos.push(newTodo);
        input.value = "";
    }
};

fluid.def("fluid.demos.todoList", {
    $layers: "fluid.templateViewComponent",
    todos: {
        $deepReactive: todos
    },
    template:
        `<div id="main">
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
    </div>`,
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

const qs = (sel, parent) => (parent || document).querySelector(sel);
const container = qs("#main");
const that = fluid.demos.todoList({container});
