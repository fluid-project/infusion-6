<script>
fluid.def("fluid.editor.substratePane", {
    substrateTree: {
        $component: {
            $layers: "fluid.substrateTree"
        }
    },
    $variety: "frameworkAux"
});
</script>

<script src="%fluid-edit/js/substrateTree.js"></script>

<template>
    <div class="fl-substrate-pane" @id="substrateTree">
    </div>
</template>

<style>

.fl-substrate-pane {
    padding: 4px;
    margin: 0 4px;
    border: 1px solid #ccc;
    overflow: auto;
    cursor: default;
}

.fl-highlight {
    filter: brightness(1.5);
    outline: dashed 1px #ccc;
}


li.fl-substrate-row {
    margin-left: 16px;
    white-space: nowrap;
    list-style-type: none;
}

.fl-substrate-string {
    color: #d43737;
}
.fl-substrate-primitive {
    color: #1a1aa6
}

.fl-substrate-ref {
    color: #37d437
}

.fl-substrate-key {
    color: #8d1b85
}

.pretty {
    position: relative;
    display: inline-block;
    margin-right: 1em;
    white-space: nowrap;
    line-height: 1;
}

.pretty.p-icon.fl-fold-control .state .fl-icon {
    font-size: 1.5em;
    top: -0.1em;
    left: -6px;
    width: 1em;
    height: 1em;
    opacity: 1;
}

.pretty.p-icon .state .fl-icon {
    position: absolute;
    font-size: 1em;
    width: calc(1em + 2px);
    height: calc(1em + 2px);
    left: 0;
    z-index: 1;
    text-align: center;
    line-height: normal;
    border: 1px solid transparent;
}

.pretty.p-icon .state .fl-icon:before {
    margin: 0;
    width: 100%;
    height: 100%;
    text-align: center;
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    flex: 1;
    justify-content: center;
    align-items: center;
    line-height: 1
}

.pretty .state label:after, .pretty .state label:before {
    content: '';
    width: calc(1em + 2px);
    height: calc(1em + 2px);
    display: block;
    box-sizing: border-box;
    border-radius: 0;
    z-index: 0;
    position: absolute;
    left: 0;
    background-color: transparent;
}

.pretty .state label {
    position: initial;
    display: inline-block;
    font-weight: 400;
    margin: 0;
    text-indent: 1.5em;
    min-width: calc(1em + 2px);
}

.pretty.p-icon input:checked~.state .icon {
    opacity: 1
}

.pretty.fl-fold-control.active {
    cursor: pointer;
    margin-right: -0.1em;
    color: #555;
}

.pretty.fl-fold-control.inactive {
    /* display: none; */
    margin-left: 0.4em;
}

.pretty.fl-fold-control {
    margin-right: -0.4em;
}

</style>
