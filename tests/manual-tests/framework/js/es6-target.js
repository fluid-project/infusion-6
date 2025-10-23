const inside = function (a) {
    console.log(`a is ${a}`);
    return a * 2;
};

const result = inside(4);

export {inside, result};
