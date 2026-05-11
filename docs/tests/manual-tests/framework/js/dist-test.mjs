import fluid from "../../../../dist/FluidCell.mjs"

const A = fluid.cell(1);

const B = fluid.cell().computed(a => a + 1, [A]);

console.log("B's value computed to ", B.get());
