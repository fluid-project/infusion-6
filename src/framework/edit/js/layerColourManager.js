"use strict";

fluid.def("fluid.layerColourManager", {
    $layers: "fluid.component",
    saturation: 42,
    lightness: 83,
    hueStep: -75.5,
    nextHue: 198,

    errorColour: "#dc362e",

    frameworkHue: 230,
    liveHue: 60,

    layerColours: {},

    isReservedHue: {
        $method: {
            func: (self, hue) => {
                const inRange = (test, mid) => test >= mid - 25 && test <= mid + 25;
                return inRange(hue, self.frameworkHue) || inRange(hue, self.liveHue);
            }
        }
    },

    hueToColour: {
        $method: {
            func: (self, hue) => `hsl(${hue}, ${self.saturation}%, ${self.lightness}%)`,
            args: ["{self}", "{0}:hue"]
        }
    },

    getNextColour: {
        $method: {
            func: self => {
                const togo = self.hueToColour(self.nextHue.toFixed(1));
                do {
                    self.nextHue = (self.nextHue + self.hueStep) % 360;
                } while (self.isReservedHue(self.nextHue));
                return togo;
            },
            args: "{self}"
        }
    },
    allocateColour: {
        $method: {
            func: (self, layerName, layerDef) => {
                const existing = self.layerColours[layerName];
                if (existing) {
                    return existing;
                } else {
                    let newColour;
                    if (layerDef.$variety === "framework") {
                        newColour = self.hueToColour(self.frameworkHue - 10);
                    } else if (layerDef.$variety === "frameworkAux") {
                        newColour = self.hueToColour(self.frameworkHue + 10);
                    } else {
                        newColour = self.getNextColour();
                    }
                    self.layerColours[layerName] = newColour;
                    return newColour;
                }
            },
            args: ["{self}", "{0}:layerName", "{1}:layerDef"]
        }
    },
// Currently unused: layerList does it
    /*
    colourAllocationEffect: {
        $effect: {
            func: (self, layerStore) =>
                fluid.each(layerStore, (layerRec, layerName) => self.allocateColour(layerName, layerRec.raw)),
            args: ["{self}", fluid.layerStore]
        }
    }*/
    $variety: "frameworkAux"
});

