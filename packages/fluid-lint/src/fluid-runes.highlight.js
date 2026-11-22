// The highlighting of the runes of configuration - see grammar/fluid-runes.grammar
import {styleTags, tags as t} from "@lezer/highlight";

export const fluidRunesHighlighting = styleTags({
    "Reference/{ Reference/}": t.special(t.brace),
    Context: t.namespace,
    "Selector/...": t.className,
    Segment: t.propertyName,
    Label: t.comment,
    "CompactRecord/$ RuneName": t.keyword,
    FunctionName: t.function(t.variableName),
    Number: t.number,
    Boolean: t.bool,
    BareArg: t.string,
    Escaped: t.escape,
    Literal: t.string,
    "Interpolation/@{ Interpolation/}": t.special(t.brace)
});
