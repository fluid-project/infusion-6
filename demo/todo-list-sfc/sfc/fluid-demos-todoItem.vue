<script>
fluid.def("fluid.demos.todoItem", {
    toggle: {
        $method: {
            func: (item) => {
                item.todo.completed = !item.todo.completed;
            },
            args: ["{self}"]
        }
    },
    // Deleting the iteration variable follows its provenance upstream and removes the element from the source list
    remove: {
        $method: {
            func: (item) => {
                delete item.todo;
            },
            args: ["{self}"]
        }
    }
});
</script>

<template>
    <div>
        <span class="todo tag is-large"
              @class="completed:@{todo.completed}, is-info:!@{todo.completed}"
              @onclick="{self}.toggle()">
            <span>@{todo.text}</span>
            <button class="delete is-small"
                @onclick.stop="{self}.remove()"></button>
        </span>
    </div>
</template>

<style>
.todo {
    margin: 5px;
    cursor: pointer;
}

.todo.completed {
    text-decoration: line-through;
}
</style>
