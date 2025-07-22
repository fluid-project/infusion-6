<script>
fluid.def("fluid.demos.todoItem", {
});
</script>

<template>
    <div>
        <span class="todo tag is-large"
              @class="completed:@{completed}, is-info:!@{completed}"
              @onclick="{todoList}.toggleItem({itemIndex})">
            <span>@{text}</span>
            <button class="delete is-small"
                @onclick.stop="{todoList}.deleteItem({itemIndex})"></button>
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
