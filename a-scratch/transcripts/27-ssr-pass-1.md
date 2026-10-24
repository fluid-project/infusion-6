 ▐▛███▛█   Claude Code v2.1.309
▝▜██████▀  Opus 5.5 · Claude Pro
 ▝▝   ▝▝   /mnt/outer-source/gits/fluid-infusion-6


❯ Are you able to observe the remaining 5-day quota for this account and gate   
  your activities based on that?                                                

● No. None of my tools show your account's usage or remaining quota, so I can't
  check how much is left or stop work based on it. Hooks and the status line
  can't feed that number back to me either, as far as I know. I don't see a
  usage figure anywhere in my context.

  What would work:

  - You check, I adjust. Run /usage (or /status) in Claude Code to see where you
    stand, then tell me something like "keep this light" or "we're near the
    limit." I'll work more cheaply from then on: no subagents, targeted file
    reads instead of whole-file reads, fewer test runs.
  - Set a standing budget. If you want frugal behaviour by default on this
    project, I can save that as a memory so future sessions start that way. For
    example, "no subagents without asking" or "run single test files rather than
    full npm test unless asked."
  - Size estimates up front. Before a large task, I can say roughly how big I
    expect it to be (files touched, test runs, whether I'd want subagents). You
    can then decide whether to go ahead given what's left.

  Any limit I keep to has to come from what you tell me, not from the account's
  actual usage.

✻ Brewed for 8s · done Friday 23:52

❯ Look in the project ../ponder-infusion which has a infusion/REQUIREMENTS.md   
  file - address requirements R1 through R11. Many of these have "Comment"      
  following indicating that in this pass we will elaborate or further interpret 
  the requirement. If there is a comment with such a request, provide the       
  response rather than implementing the feature now, otherwise, do it.          

  Ran 1 shell command (ctrl+o to expand)

● This is a large task. Let me get oriented in the framework first.

  Read 1 file, listed 1 directory, ran 2 shell commands (ctrl+o to expand)

● I've reviewed the requirements and the framework's view layer, including
  FluidView.js, the template parser, and server boot/hydrate. Next I'll examine
  the ponder SFCs using the proposed features and the IL core ($for, $if,
  layers, linkage) before starting implementation.

  Searched for 1 pattern, read 2 files, ran 2 shell commands (ctrl+o to expand)

● Still mapping the framework — now reading the layer merge and priority-sorting
  code in Fluid.js, which R8 and R9 depend on.

  Read 2 files, ran 1 shell command (ctrl+o to expand)

● Let me establish a test baseline before changing anything.

  Ran 1 shell command (ctrl+o to expand)

● Baseline: 1739/1739 passing. A few more framework details to check before I
  start implementing.

  Searched for 1 pattern, read 2 files, ran 4 shell commands (ctrl+o to expand)

● I've mapped out the framework and confirmed baseline tests pass. I'll
  implement R1, R2, R4, R5, R7, R8, R10, parts of R6, and client-only scripts
  from R11, while answering the remaining open questions inline in
  REQUIREMENTS.md—starting now with the template-string scanner for R10's call
  syntax and R2's escape handling.

  Ran 2 shell commands (ctrl+o to expand)

● Implementing R10 and the R2 escape in fluid.parseAtStringTemplate.

  Searched for 1 pattern (ctrl+o to expand)

● Update(src/framework/core/js/Fluid.js)
  ⎿  Removed 2 lines
      2970          return {context, path, name, selector};
      2971      };
      2972  
      2973 -    const atTemplateRE = /@\{((?:.)+?)\}/g;                  
      2974 -                                                             
      2973      /**
      2974       * Renders a parsed context reference object back into it
            s string representation.
      2975       * @param {Object} parsed - The parsed context reference 
            object containing context, selector, and path

● Update(src/framework/core/js/Fluid.js)
  ⎿  Added 93 lines, removed 31 lines
      2980      };
      2981  
      2982      /**
      2983 +     * Find the brace which closes an interpolated expression
           + in a template string, passing over any braces and           
      2984 +     * parentheses nested within it, e.g. those of a context 
           +reference or of a function call, and the contents of any     
      2985 +     * quoted strings                                        
      2986 +     * @param {String} template - The template string        
      2987 +     * @param {Number} start - The index of the first charact
           +er of the expression, following its opening brace            
      2988 +     * @return {Number} The index of the closing brace, or -1
           + if the expression is not closed                             
      2989 +     */                                                      
      2990 +    fluid.findClosingBrace = function (template, start) {    
      2991 +        let depth = 0, quote = null, togo = -1;              
      2992 +        for (let i = start; i < template.length && togo === -
           +1; ++i) {                                                    
      2993 +            const c = template.charAt(i);                    
      2994 +            if (quote) {                                     
      2995 +                if (c === quote) {                           
      2996 +                    quote = null;                            
      2997 +                }                                            
      2998 +            } else if (c === "\"" || c === "'") {            
      2999 +                quote = c;                                   
      3000 +            } else if (c === "{" || c === "(") {             
      3001 +                ++depth;                                     
      3002 +            } else if (c === ")") {                          
      3003 +                --depth;                                     
      3004 +            } else if (c === "}") {                          
      3005 +                if (depth === 0) {                           
      3006 +                    togo = i;                                
      3007 +                } else {                                     
      3008 +                    --depth;                                 
      3009 +                }                                            
      3010 +            }                                                
      3011 +        }                                                    
      3012 +        return togo;                                         
      3013 +    };                                                       
      3014 +                                                             
      3015 +    /**                                                      
      3016 +     * @typedef {Object} AtTemplateToken                     
      3017 +     * @property {String} raw - The text of the interpolated 
           +expression, without its enclosing `@{` and `}`               
      3018 +     * @property {ParsedContext} [parsed] - For an expression
           + which is a reference, the parsed reference                  
      3019 +     * @property {FuncRec} [call] - For an expression which i
           +s a function call, the record of the call, as for a compact  
      3020 +     * `$compute` record                                     
      3021 +     */                                                      
      3022 +                                                             
      3023 +    /**                                                      
      3024 +     * Parse an expression interpolated into a template strin
           +g - either a context reference `{context}.path`, a function  
      3025 +     * call in the compact syntax of `$compute`, e.g. `fluid.
           +tests.urlize({self}.tag)`, or a bare path, which is          
      3026 +     * resolved against `{self}`                             
      3027 +     * @param {String} exp - The expression, without its encl
           +osing `@{` and `}`                                           
      3028 +     * @return {AtTemplateToken} The parsed token            
      3029 +     */                                                      
      3030 +    fluid.parseAtExpression = function (exp) {               
      3031 +        let togo;                                            
      3032 +        if (exp.startsWith("{")) {                           
      3033 +            togo = {raw: exp, parsed: fluid.parseContextRefer
           +ence(exp)};                                                  
      3034 +        } else if (/^[\w$.]+\s*\(/.test(exp) && exp.endsWith(
           +")")) {                                                      
      3035 +            togo = {raw: exp, call: fluid.compactStringToRec(
           +exp, "$compute")};                                           
      3036 +        } else {                                             
      3037 +            togo = {raw: exp, parsed: {context: "self", path:
           + exp}};                                                      
      3038 +        }                                                    
      3039 +        return togo;                                         
      3040 +    };                                                       
      3041 +                                                             
      3042 +    /**                                                      
      3043       * Takes a template string containing tokens in the form 
            of "@{value}", "@{deep.path.to.value}",
      2984 -     * or "@{{layerRec}.layerName}". Returns an array of toke
           -n segments which are either plain strings                    
      2985 -     * or objects holding the parsed token paths. For tokens 
           -of the form "@{{layerRec}.layerName}",                       
      2986 -     * the full body is sent to `fluid.parseContextReference`
           -.                                                            
      3044 +     * "@{{layerRec}.layerName}" or "@{func(args)}". Returns 
           +an array of token segments which are either plain strings    
      3045 +     * or objects holding the parsed tokens - see `fluid.pars
           +eAtExpression`. The sequence "@@{" stands for a literal      
      3046 +     * "@{", which is not interpolated, and an expression whi
           +ch is not closed is taken literally.                         
      3047       *
      3048       * @param {String} template - A string that contains plac
            eholders for tokens of the form `@{token}` embedded into it.
      2989 -     * @return {Array<String|Object>} An array of token value
           -s.                                                           
      3049 +     * @return {Array<String|AtTemplateToken>} An array of to
           +ken values, in which no two strings are adjacent             
      3050       */
      3051      fluid.parseAtStringTemplate = function (template) {
      3052          const tokens = [];
      2993 -        let lastIndex = 0;                                   
      2994 -        let match;                                           
      2995 -                                                             
      2996 -        const upgradeSimpleKey = key => ({context: "self", pa
           -th: key});                                                   
      2997 -                                                             
      2998 -        while ((match = atTemplateRE.exec(template))) {      
      2999 -            const index = match.index;                       
      3000 -            // Push text token                               
      3001 -            if (index > lastIndex) {                         
      3002 -                tokens.push(template.slice(lastIndex, index))
           -;                                                            
      3003 -            }                                                
      3004 -            // Interpolated token                            
      3005 -            const exp = match[1].trim();                     
      3006 -            if (exp.startsWith("{")) {                       
      3007 -                // Handle tokens of the form "@{{context}.pat
           -h}"                                                          
      3008 -                const endIndex = template.indexOf("}", atTemp
           -lateRE.lastIndex);                                           
      3009 -                if (endIndex === -1) {                       
      3010 -                    throw new Error("Unmatched '{' in templat
           -e: " + template);                                            
      3053 +        let text = "";                                       
      3054 +        let index = 0;                                       
      3055 +        while (index < template.length) {                    
      3056 +            const atPos = template.indexOf("@", index);      
      3057 +            if (atPos === -1) {                              
      3058 +                text += template.substring(index);           
      3059 +                index = template.length;                     
      3060 +            } else if (template.startsWith("@@{", atPos)) {  
      3061 +                text += template.substring(index, atPos) + "@
           +{";                                                          
      3062 +                index = atPos + 3;                           
      3063 +            } else if (template.charAt(atPos + 1) === "{") { 
      3064 +                const closePos = fluid.findClosingBrace(templ
           +ate, atPos + 2);                                             
      3065 +                if (closePos === -1) {                       
      3066 +                    text += template.substring(index);       
      3067 +                    index = template.length;                 
      3068 +                } else {                                     
      3069 +                    text += template.substring(index, atPos);
      3070 +                    if (text) {                              
      3071 +                        tokens.push(text);                   
      3072 +                        text = "";                           
      3073 +                    }                                        
      3074 +                    tokens.push(fluid.parseAtExpression(templ
           +ate.substring(atPos + 2, closePos).trim()));                 
      3075 +                    index = closePos + 1;                    
      3076                  }
      3012 -                const fullBody = template.slice(index + 2, en
           -dIndex); // Include the full body                            
      3013 -                tokens.push({raw: fullBody, parsed: fluid.par
           -seContextReference(fullBody)});                              
      3014 -                atTemplateRE.lastIndex = endIndex + 1; // Mov
           -e past the closing "}"                                       
      3077              } else {
      3016 -                // Handle tokens of the form "@{value}" or "@
           -{deep.path.to.value}"                                        
      3017 -                tokens.push({raw: exp, parsed: upgradeSimpleK
           -ey(exp)});                                                   
      3078 +                text += template.substring(index, atPos + 1);
      3079 +                index = atPos + 1;                           
      3080              }
      3019 -            lastIndex = atTemplateRE.lastIndex;              
      3081          }
      3021 -        if (lastIndex < template.length) {                   
      3022 -            tokens.push(template.slice(lastIndex));          
      3082 +        if (text) {                                          
      3083 +            tokens.push(text);                               
      3084          }
      3085          return tokens;
      3086      };
      3087  
      3088      fluid.atStringTemplate = function (template, model) {
      3089          const tokens = fluid.parseAtStringTemplate(template);
      3029 -        const segs = tokens.map(token => typeof(token) === "s
           -tring" ? token : fluid.get(model, token.parsed.path, "error")
           -);                                                           
      3090 +        const segs = tokens.map(token => typeof(token) === "s
           +tring" ? token :                                             
      3091 +            token.parsed ? fluid.get(model, token.parsed.path
           +, "error") : "@{" + token.raw + "}");                        
      3092          return segs.join("");
      3093      };
      3094  

● Now the view side: resolve call tokens in renderComputedStringTemplate.

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 1 line, removed 1 line
      1637          } else if (tokens.length === 1 && typeof(tokens[0]) =
            == "string") {
      1638              return tokens[0];
      1639          } else {
      1640 -            const liveTokens = tokens.map(token => fluid.isPr
           -imitive(token) ? token : fluid.fetchContextReference(token.pa
           -rsed, shadow));                                              
      1640 +            const liveTokens = tokens.map(token => fluid.isPr
           +imitive(token) ? token : fluid.templateTokenSignal(token, sha
           +dow));                                                       
      1641              const togo = fluid.cell(undefined, {name: "render
            ComputedStringTemplate"}).computed(function (...tokens) {
      1642                  return tokens.join("");
      1643              }, liveTokens, {mapArg: fluid.deSignal});

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 26 lines
      1622          }, [sig], {mapArg: fluid.deproxyAndDesignal});
      1623  
      1624      /**
      1625 +     * Resolve a function call interpolated into a template, 
           +e.g. `@{fluid.tests.urlize({self}.tag)}`, into a signal      
      1626 +     * for its result. As for a `$compute` record, the functi
           +on is invoked afresh whenever any of its arguments changes.  
      1627 +     * @param {AtTemplateToken} token - The parsed token hold
           +ing the call                                                 
      1628 +     * @param {Shadow} shadow - The shadow of the component a
           +gainst which the call's references are resolved              
      1629 +     * @return {Signal<any>} A signal for the result of the c
           +all                                                          
      1630 +     */                                                      
      1631 +    fluid.expandTemplateCall = function (token, shadow) {    
      1632 +        const {func, resolvedArgs} = fluid.resolveFuncRecord(
           +token.call, shadow, ["$template"]);                          
      1633 +        const name = `template call ${token.raw} at path ${sh
           +adow.path}`;                                                 
      1634 +        const togo = fluid.cell(undefined, {name}).computed(f
           +luid.makeFuncDispatcher(func),                               
      1635 +            fluid.flattenedArgCells(resolvedArgs, name));    
      1636 +        togo.$variety = "$compute";                          
      1637 +        return togo;                                         
      1638 +    };                                                       
      1639 +                                                             
      1640 +    /**                                                      
      1641 +     * Resolve a token interpolated into a template into a si
           +gnal for its value                                           
      1642 +     * @param {AtTemplateToken} token - The parsed token - a 
           +reference or a function call                                 
      1643 +     * @param {Shadow} shadow - The shadow of the component a
           +gainst which the token is resolved                           
      1644 +     * @return {Signal<any>} A signal for the token's value  
      1645 +     */                                                      
      1646 +    fluid.templateTokenSignal = function (token, shadow) {   
      1647 +        return token.call ? fluid.expandTemplateCall(token, s
           +hadow) : fluid.fetchContextReference(token.parsed, shadow);  
      1648 +    };                                                       
      1649 +                                                             
      1650 +    /**                                                      
      1651       * Renders a parsed string template against the local com
            ponent tree by replacing tokens with their corresponding valu
            es.
      1652       * Tokens that are primitives remain unchanged, while sig
            nal tokens are resolved and then the resulting token
      1653       * string concatenated.

  Ran 1 shell command (ctrl+o to expand)

● The @id disposer in vnode.renderEffects is never actually run — worth knowing.
  Next I need to check whether fluid.cell.effect runs eagerly, which my @if
  block design relies on.

  Read 1 file (ctrl+o to expand)

● Effects queue and flush correctly on stabilization for the block design. Next,
  I'll rewrite activateTemplate to support verbatim content and islands (R2),
  @if/@else blocks (R4), and joint-safe patching.

  Searched for 1 pattern, read 1 file (ctrl+o to expand)

● Bash(mkdir -p /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a
      3-97d2-445d-8bfc-4f99019ddb5a/scratchpad && cat >
      /tmp/claude-1000/-mnt-outer-source-gi…)
  ⎿  1771:    fluid.compositeVTree = function (compositedTree, rec, layerNa
     me) {
     1953:    fluid.activateTemplate = function (vtemplate, self, view, sco
     … +4 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView.js (+201 -13)
      1853      };
      1854  
      1855      /**
      1856 +     * Determine the component against which the references o
           +f a template rendered by a component's view are resolved.    
      1857 +     * This is the component itself, unless it is a `fluid.te
           +mplateBlock` rendering the markup of an element bearing      
      1858 +     * `@if` or `@else` within another template, in which cas
           +e it is the component whose template that is.                
      1859 +     * @param {ComponentComputer} self - The component whose 
           +view renders the template                                    
      1860 +     * @return {ComponentComputer} The component against whic
           +h the template's references are resolved                     
      1861 +     */                                                      
      1862 +    fluid.templateScopeOf = function (self) {                
      1863 +        let shadow = self[$m];                               
      1864 +        while (shadow.parentShadow && fluid.hasLayer(shadow.t
           +hat, "fluid.templateBlock")) {                               
      1865 +            shadow = shadow.parentShadow;                    
      1866 +        }                                                    
      1867 +        return shadow === self[$m] ? self : fluid.proxyMat(sh
           +adow.computer, shadow, []);                                  
      1868 +    };                                                       
      1869 +                                                             
      1870 +    /**                                                      
      1871 +     * Parse the condition of an element bearing `@if` in a t
           +emplate into a signal for its truth. The condition is an     
      1872 +     * expression as interpolated by `@{...}`, which may also
           + be written enclosed in `@{` and `}` - a context reference,  
      1873 +     * a function call or a bare path - optionally preceded b
           +y `!` to negate it. As for `$if`, an unavailable value is    
      1874 +     * false.                                                
      1875 +     * @param {String} condition - The value of the `@if` att
           +ribute                                                       
      1876 +     * @param {Shadow} shadow - The shadow of the component a
           +gainst which the condition is resolved                       
      1877 +     * @return {Signal<Boolean>} A signal for the truth of th
           +e condition                                                  
      1878 +     */                                                      
      1879 +    fluid.parseBlockCondition = function (condition, shadow) 
           +{                                                            
      1880 +        const trimmed = condition.trim();                    
      1881 +        const negate = trimmed.startsWith("!");              
      1882 +        const body = (negate ? trimmed.substring(1) : trimmed
           +).trim();                                                    
      1883 +        const exp = body.startsWith("@{") && body.endsWith("}
           +") ? body.substring(2, body.length - 1).trim() : body;       
      1884 +        const signal = fluid.templateTokenSignal(fluid.parseA
           +tExpression(exp), shadow);                                   
      1885 +        return fluid.cell(undefined, {name: `@if condition ${
           +condition} at path ${shadow.path}`}).computed(value => {     
      1886 +            const truthy = !!value && !fluid.isUnavailable(va
           +lue);                                                        
      1887 +            return negate ? !truthy : truthy;                
      1888 +        }, [signal], {mapArg: fluid.deproxyAndDesignal, isFre
           +e: true});                                                   
      1889 +    };                                                       
      1890 +                                                             
      1891 +    /**                                                      
      1892 +     * Assign conditions to those of a list of sibling templa
           +te nodes which bear `@if` or `@else`. An element bearing     
     … 234 more lines (ctrl+o to expand)

● Now the patching side: skip false @if joints, and don't strip attributes from
  joint containers.

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 20 lines, removed 5 lines
      2289  
      2290          // It may be undefined because this is a joint to a s
            ubcomponent as applied in fluid.processAttributeDirective
      2291          if (vnode.children !== undefined) {
      2292 -            const vcount = vnode.children.length;            
      2292 +            // An element bearing @if is omitted whilst its c
           +ondition is false - its node, if any, is first removed so    
      2293 +            // that the remaining nodes are matched up with t
           +heir vnodes                                                  
      2294 +            const isAbsent = vchild => vchild.ifSignal !== un
           +defined && !vchild.ifSignal.get();                           
      2295 +            vnode.children.filter(isAbsent).forEach(vchild =>
           + {                                                           
      2296 +                const absentNode = vchild.elementSignal?._val
           +ue;                                                          
      2297 +                if (absentNode?.parentNode === element) {    
      2298 +                    absentNode.remove();                     
      2299 +                }                                            
      2300 +            });                                              
      2301 +            const vchildren = vnode.children.filter(vchild =>
           + !isAbsent(vchild));                                         
      2302 +            const vcount = vchildren.length;                 
      2303              for (let i = 0; i < vcount; ++i) {
      2294 -                const vchild = vnode.children[i];            
      2304 +                const vchild = vchildren[i];                 
      2305                  let other = element.childNodes[i];
      2296 -                if (!other || !fluid.matchNodeToVNode(other, 
           -vchild)) {                                                   
      2306 +                // An element which has just become present i
           +s inserted rather than taking over its successor's node      
      2307 +                const freshlyPresent = vchild.ifSignal !== un
           +defined && other && other !== vchild.elementSignal?._value;  
      2308 +                if (!other || freshlyPresent || !fluid.matchN
           +odeToVNode(other, vchild)) {                                 
      2309                      const fresh = fluid.nodeFromVNode(element
            .ownerDocument, vchild);
      2298 -                    if (other) {                             
      2310 +                    if (freshlyPresent) {                    
      2311 +                        element.insertBefore(fresh, other);  
      2312 +                    } else if (other) {                      
      2313                          other.replaceWith(fresh);
      2314                      } else {
      2315                          element.appendChild(fresh);
      2316                      }
      2317                      other = fresh;
      2318                  }
      2305 -                fluid.patchChildren(vchild, other);          
      2319 +                // A joint's attributes are also written by t
           +he component rendering into it, and so are not removed       
      2320 +                fluid.patchChildren(vchild, other, vchild.isJ
           +oint);                                                       
      2321              }
      2322              for (let i = element.childNodes.length - 1; i >= 
            vcount; --i) {
      2323                  element.childNodes[i].remove();
● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 4 lines
      2362      fluid.def("fluid.viewComponent", {
      2363          $layers: "fluid.component",
      2364          elideParent: true,
      2365 +        // If true, a template supplied as markup is taken ve
           +rbatim - it is not scanned for bindings, may have any number 
      2366 +        // of top-level nodes, all of which are rendered with
           +in the container, and keeps its whitespace. Elements within  
      2367 +        // it bearing `fluid-layers` are rendered as islands 
           +- see fluid.activateTemplate                                 
      2368 +        verbatim: false,                                     
      2369          container: "$compute:fluid.unavailable(Container not 
            specified)",
      2370          // The markup at our container in our parent's templa
            te, supplied by the template record of a parent whose
      2371          // template designates our container with @id

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 32 lines, removed 1 line
      2464      // template of a Single File Component, as written by flu
            id.sfcToInjRecs
      2465      fluid.def("fluid.templateViewComponent", {
      2466          $layers: "fluid.viewComponent",
      2467 -        templateTree: "$compute:fluid.templateToTree({self}.t
           -emplate)",                                                   
      2467 +        templateTree: "$compute:fluid.templateToTree({self}.t
           +emplate, {self}.verbatim)",                                  
      2468          $variety: "framework"
      2469      });
      2470  
      2471 +    // An anonymous component rendering the markup of an elem
           +ent bearing @if or @else in another component's template,    
      2472 +    // which exists only whilst its condition holds - see flu
           +id.activateTemplate. References within its markup, and       
      2473 +    // subcomponents designated within it by @id, are resolve
           +d against the component whose template it is part of.        
      2474 +    fluid.def("fluid.templateBlock", {                       
      2475 +        $layers: "fluid.component",                          
      2476 +        view: {                                              
      2477 +            $component: {                                    
      2478 +                $layers: "fluid.templateBlockView"           
      2479 +            }                                                
      2480 +        },                                                   
      2481 +        $variety: "framework"                                
      2482 +    });                                                      
      2483 +                                                             
      2484 +    fluid.def("fluid.templateBlockView", {                   
      2485 +        $layers: "fluid.viewComponent",                      
      2486 +        elideParent: false,                                  
      2487 +        templateTree: "$compute:fluid.blockTemplateTree({self
           +}.parentTemplate)",                                          
      2488 +        vTree: "$compute:fluid.activateTemplate({self}.templa
           +teTree, {$parent}, {self}, {$parent}.templateScope)",        
      2489 +        $variety: "framework"                                
      2490 +    });                                                      
      2491 +                                                             
      2492      /**
      2493 +     * Produce the template of a `fluid.templateBlock` - the 
           +markup of the element bearing @if or @else, which is marked  
      2494 +     * as a placeholder so that it does not acquire a default
           + id                                                          
      2495 +     * @param {VNode} parentTemplate - The markup of the elem
           +ent                                                          
      2496 +     * @return {VNode} The block's template                  
      2497 +     */                                                      
      2498 +    fluid.blockTemplateTree = function (parentTemplate) {    
      2499 +        return {...parentTemplate, isPlaceholder: true};     
      2500 +    };                                                       
      2501 +                                                             
      2502 +    /**                                                      
      2503       * Parse markup supplied as a view's template, recording 
            any problems with it which would otherwise pass silently -
      2504       * tags left unclosed or closed without being opened, whi
            ch the parser repairs as best it can, and top-level nodes
      2505       * beyond the first, which are not rendered since the roo
            t of a template is elided onto its container. These are

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 13 lines, removed 1 line
      2485          $layers: "fluid.viewComponent",
      2486          elideParent: false,
      2487          templateTree: "$compute:fluid.blockTemplateTree({self
            }.parentTemplate)",
      2488 -        vTree: "$compute:fluid.activateTemplate({self}.templa
           -teTree, {$parent}, {self}, {$parent}.templateScope)",        
      2488 +        vTree: "$compute:fluid.activateBlockTemplate({self}.t
           +emplateTree, {$parent}, {self})",                            
      2489          $variety: "framework"
      2490      });
      2491  
      2492      /**
      2493 +     * Activate the template of a `fluid.templateBlock`, reso
           +lving its references against the component whose template    
      2494 +     * it is part of                                         
      2495 +     * @param {VNode} vtemplate - The block's template       
      2496 +     * @param {ComponentComputer} block - The block          
      2497 +     * @param {ComponentComputer} view - The block's view    
      2498 +     * @return {VNode} The activated tree                    
      2499 +     */                                                      
      2500 +    fluid.activateBlockTemplate = function (vtemplate, block,
           + view) {                                                     
      2501 +        return fluid.activateTemplate(vtemplate, block, view,
           + fluid.templateScopeOf(block));                              
      2502 +    };                                                       
      2503 +                                                             
      2504 +    /**                                                      
      2505       * Produce the template of a `fluid.templateBlock` - the 
            markup of the element bearing @if or @else, which is marked
      2506       * as a placeholder so that it does not acquire a default
             id
      2507       * @param {VNode} parentTemplate - The markup of the elem
            ent

● Now verbatim parsing in templateToTree.

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 31 lines, removed 2 lines
      2536      };
      2537  
      2538      /**
      2539 +     * Mark every node of a parsed tree as verbatim, so that 
           +it is not scanned for bindings by `fluid.activateTemplate`   
      2540 +     * @param {VNode} vnode - The root of the tree           
      2541 +     * @return {VNode} The same tree                         
      2542 +     */                                                      
      2543 +    fluid.markVerbatim = function (vnode) {                  
      2544 +        vnode.verbatim = true;                               
      2545 +        if (vnode.children) {                                
      2546 +            vnode.children.forEach(fluid.markVerbatim);      
      2547 +        }                                                    
      2548 +        return vnode;                                        
      2549 +    };                                                       
      2550 +                                                             
      2551 +    /**                                                      
      2552 +     * Parse markup to be rendered verbatim, e.g. HTML produc
           +ed by a content pipeline. All of its top-level nodes are     
      2553 +     * held by a single root, which is elided onto the view's
           + container, so that they are rendered within it. Whitespace  
      2554 +     * is kept, and no node is scanned for bindings - see `fl
           +uid.activateTemplate`.                                       
      2555 +     * @param {String} markup - The markup to be rendered    
      2556 +     * @return {VNode} The parsed tree, a fragment           
      2557 +     */                                                      
      2558 +    fluid.parseVerbatimMarkup = function (markup) {          
      2559 +        const parsed = fluid.parseHTMLToTree(markup, {fragmen
           +t: true, skipWhitespace: false});                            
      2560 +        const root = fluid.markVerbatim({tag: "verbatim", att
           +rs: {}, children: parsed.children});                         
      2561 +        return {tag: "fragment", children: [root]};          
      2562 +    };                                                       
      2563 +                                                             
      2564 +    /**                                                      
      2565       * Resolve the template held by a view to its parsed tree
      2566       * @param {String|Object} template - The view's template 
            - either markup, or a reference `{sfcLayer}` to the template
      2567       * of the named Single File Component layer, held in the 
            template store
      2568 +     * @param {Boolean} [verbatim] - If `true`, markup is par
           +sed by `fluid.parseVerbatimMarkup` rather than as a template 
      2569       * @return {VNode|Unavailable} The parsed template, or an
             unavailable value if the template is neither of these
      2570       */
      2544 -    fluid.templateToTree = function (template) {             
      2571 +    fluid.templateToTree = function (template, verbatim) {   
      2572          let togo;
      2546 -        if (typeof(template) === "string") {                 
      2573 +        if (typeof(template) === "string" && verbatim) {     
      2574 +            togo = fluid.parseVerbatimMarkup(template);      
      2575 +        } else if (typeof(template) === "string") {          
      2576              togo = fluid.parseTemplateMarkup(template);
      2577          } else if (fluid.isPlainObject(template, true) && typ
            eof(template.sfcLayer) === "string") {
      2578              togo = fluid.fetchParsedTemplate(template.sfcLaye
            r);

● Now R7. First checking what depends on the current partial machinery.

  Ran 1 shell command (ctrl+o to expand)

● Update(src/framework/core/js/Fluid.js)
  ⎿  Added 12 lines
      2833          }
      2834      };
      2835  
      2836 +    /** @type {SelectorParseStrategy} A strategy for selector
           +s matching nodes of a template, which may also designate     
      2837 +     * the element of a subcomponent by its member name, as `
           +@member` for the element bearing `@id="member"` */           
      2838 +    fluid.templateCSSMatcher = {                             
      2839 +        regexp: new RegExp("([#.@]?)(" + charStart + "]|\\\\.
           +)+)", "g"),                                                  
      2840 +        charToTag: {                                         
      2841 +            "": "tag",                                       
      2842 +            "#": "id",                                       
      2843 +            ".": "clazz",                                    
      2844 +            "@": "member"                                    
      2845 +        }                                                    
      2846 +    };                                                       
      2847 +                                                             
      2848      const childSeg = new RegExp("\\s*(>)?\\s*", "g");
      2849  
      2850      /**

  Read 1 file, ran 2 shell commands (ctrl+o to expand)

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 13 lines, removed 15 lines
      2333              return togo;
      2334          };
      2335  
      2336 -        const assignParents = (vnode, parentNode = null) => {
      2337 -            vnode.parentNode = parentNode;                   
      2338 -            if (vnode.children) {                            
      2339 -                vnode.children.forEach(child => assignParents
           -(child, vnode));                                             
      2340 -            }                                                
      2341 -            return vnode;                                    
      2342 -        };                                                   
      2336          if (!vtemplate) {
      2337              // TODO: looks like this can only occur through r
            eference like {self}.parentTemplate which should produce unav
            ailable by itself
      2338              return fluid.unavailable("Template not configured
            ");
     ...
      2340  
      2341          const tree = fluid.copy(vtemplate);
      2342          const useTree = fluid.effVTree(tree, view.elideParent
            );
      2350 -        let compositedTree = assignParents(useTree);         
      2343 +        let compositedTree = fluid.assignVTreeParents(useTree
           +);                                                           
      2344  
      2345          if (fluid.hasLayer(view, "fluid.partialViewComponent"
            )) {
      2346              compositedTree = fluid.compositePartials(composit
            edTree, self, view);
      2347          }
      2348  
      2356 -        // Currently returns its argument, but historical "ta
           -g-singularity" branch did funky stuff folding "virtual virtua
           -l DOM nodes" together                                        
      2357 -        const activatedTree = activateTemplate(compositedTree
           -);                                                           
      2349 +        let togo;                                            
      2350 +        if (fluid.isUnavailable(compositedTree)) {           
      2351 +            togo = compositedTree;                           
      2352 +        } else {                                             
      2353 +            // Currently returns its argument, but historical
           + "tag-singularity" branch did funky stuff folding "virtual vi
           +rtual DOM nodes" together                                    
      2354 +            const activatedTree = activateTemplate(composited
           +Tree);                                                       
      2355  
      2359 -        const filteredTree = !fluid.isUnavailable(selfEditing
           -) && selfEditing ? selfEditingRef.get().site.shadow.that.filt
           -erForSelfEditing(activatedTree, self) : activatedTree;       
      2356 +            const filteredTree = !fluid.isUnavailable(selfEdi
           +ting) && selfEditing ? selfEditingRef.get().site.shadow.that.
           +filterForSelfEditing(activatedTree, self) : activatedTree;   
      2357  
      2361 -        fluid.assignContainerId(filteredTree, selfShadow);   
      2362 -        fluid.bindContainer(templateEffects, filteredTree, se
           -lf, view);                                                   
      2363 -        return filteredTree;                                 
      2364 -                                                             
      2358 +            fluid.assignContainerId(filteredTree, selfShadow)
           +;                                                            
      2359 +            fluid.bindContainer(templateEffects, filteredTree
           +, self, view);                                               
      2360 +            togo = filteredTree;                             
      2361 +        }                                                    
      2362 +        return togo;                                         
      2363      };
      2364  
      2365      fluid.containerIdPrefix = "fl-id-";

● I've implemented R10/R2-escape parsing, verbatim content/islands, @if/@else
  blocks, and the selector-based partial compositor. Next I'll wire up the
  remaining R7 pieces (@id joint ids, removing the source-text read of
  relativeContainer) and run the tests.

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 3 lines
      2265                          delete vnode.children;
      2266                          vnode.attrs = fluid.filterObjKeys(vno
            de.attrs, key => !key.startsWith("@"));
      2267                          vnode.isJoint = true;
      2268 +                        // The element bears the id derived f
           +rom the subcomponent's path even when the subcomponent       
      2269 +                        // renders nothing of its own, so tha
           +t it is clear in the markup which member it holds            
      2270 +                        vnode.defaultAttrs = {...vnode.defaul
           +tAttrs, id: fluid.containerIdPrefix + fluid.composeSegment(sh
           +adow.path, idValue)};                                        
      2271  
      2272                          // The template record ensures that t
            he child has a view, rendering into the container supplied
      2273                          // here - if the child is a component
             list, its view renders its members' views in sequence

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 4 lines, removed 13 lines
      866                  // If a <template> block is present, store it 
           in the template registry and add a definition to resolve it
      867                  if (docTemplate) {
      868                      addLayers = ["fluid.sfcTemplateViewCompone
           nt"];
      869 -                    // Template configuration is written onto 
          -the component's view                                          
      870 -                    if (partial) {                            
      871 -                        const relativeContainer = fluid.defFro
          -mMap(ourSNI.text, ourSNI.defMaps, layerName, ["view", "$compon
          -ent", "relativeContainer"]);                                  
      872 -                        if (!relativeContainer) {             
      873 -                            reject(`Error in SFC for ${layerNa
          -me}: Didn't find view.$component.relativeContainer property fo
          -r partial component`);                                        
      874 -                        }                                     
      875 -                        const ptl = {                         
      876 -                            [layerName]: {                    
      877 -                                relativeContainer             
      878 -                            }                                 
      879 -                        };                                    
      880 -                        patchedText = fluid.patchDefMapPath(pa
          -tchedText, ourDef, ["view", "$component", "partialTemplateLaye
          -rs"], ptl, "last");                                           
      881 -                    } else {                                  
      869 +                    // Template configuration is written onto 
          +the component's view. The template of a partial is found      
      870 +                    // in the template store by fluid.partialC
          +ontributions, together with the cutpoint configured in the    
      871 +                    // layer's own definition or overridden by
          + another layer                                                
      872 +                    if (!partial) {                           
      873                          // The template is written as the view
           's template member, referring to the template store, so
      874                          // that a template supplied by any str
           onger layer, e.g. a layer derived from this one, overrides it
      875                          patchedText = fluid.patchDefMapPath(pa
           tchedText, ourDef, ["view", "$component", "template"], {sfcLay
           er: layerName}, "last");

  Read 1 file, ran 1 shell command (ctrl+o to expand)

● Only the expected failures: the conditional-rendering tests now see the @id
  joint id on the empty slot. Updating their expectations.

● Bash(node -e '
      const fs = require("fs");…)
  ⎿  681:    const emptyMarkup = `<div id="${assigneeId}"></div>`;
     682:    assert.equal(container.innerHTML, emptyMarkup, "Initial render
      correct");
     … +9 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+10 -7)
      674      const container = qs(".container");
      675      const that = fluid.tests.assigneeIf({container});
      676      fluid.cell.stabilize();
      677 -    // Unfortunately we can't prevent allocation of the "outer
          - container", even if there is no component                    
      678 -    assert.equal(container.innerHTML, "<div></div>", "Initial 
          -render correct");                                             
      679 -    // The conditional component's container acquires a defaul
          -t id derived from its path whilst it is rendered              
      677 +    // The conditional component's container acquires a defaul
          +t id derived from its path, which it bears even whilst        
      678 +    // the component renders nothing - its element remains, si
          +nce the record of a conditional subcomponent does not         
      679 +    // govern its element in the template, as an element beari
          +ng @if does                                                   
      680      const assigneeId = `fl-id-${that[fluid.metadataSymbol].pat
           h}.assignee`;
      681 +    const emptyMarkup = `<div id="${assigneeId}"></div>`;     
      682 +    assert.equal(container.innerHTML, emptyMarkup, "Initial re
          +nder correct");                                               
      683  
      684      that.enabled = true;
      685      fluid.cell.stabilize();
     ...
      687  
      688      that.enabled = false;
      689      fluid.cell.stabilize();
      688 -    assert.equal(container.innerHTML, "<div></div>", "Restored
          - initial render");                                            
      690 +    assert.equal(container.innerHTML, emptyMarkup, "Restored i
          +nitial render");                                              
      691  
      692      that.enabled = true;
      693      fluid.cell.stabilize();
     ...
      695  
      696      that.enabled = false;
      697      fluid.cell.stabilize();
      696 -    assert.equal(container.innerHTML, "<div></div>", "Restored
          - initial render");                                            
      698 +    assert.equal(container.innerHTML, emptyMarkup, "Restored i
          +nitial render");                                              
      699  });
      700  
      701  fluid.def("fluid.tests.longFormIf", {
     ...
      729      const container = qs(".container");
      730      const that = fluid.tests.longFormIf({container});
      731      fluid.cell.stabilize();
      730 -    assert.equal(container.innerHTML, "<div></div>", "Initial 
          -render correct");                                             
      732      const distanceId = `fl-id-${that[fluid.metadataSymbol].pat
           h}.distanceLine`;
      733 +    const emptyMarkup = `<div id="${distanceId}"></div>`;     
      734 +    assert.equal(container.innerHTML, emptyMarkup, "Initial re
          +nder correct");                                               
      735  
      736      that.distance = 0;
     … 9 more lines (ctrl+o to expand)

● Now new tests for R10, R2, R4 and R7, appended to FluidViewTests.js.

  Read 1 file (ctrl+o to expand)

● Bash(cat >> tests/framework-tests/core/js/FluidViewTests.js <<'EOF'…)
  ⎿  00:17:50.267:   fq:  FAIL: Module "Fluid View Tests" Test name "Condit
     ional rendering" - Message: Restored initial render
     00:17:50.267:   fq:  Expected:  <div id="fl-id-assigneeIf-177.assignee
     … +63 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+277 -0)
      1204      fluid.destroyComponent(rejectedFree);
      1205      container.replaceChildren();
      1206  });
      1207 +                                                             
      1208 +/**                                                          
      1209 + * Summarise the element children of a node as their tag name
           +s, each followed by its classes                              
      1210 + * @param {Element} element - The node whose children are sum
           +marised                                                      
      1211 + * @return {String[]} A summary of each child, e.g. "h2.sub" 
      1212 + */                                                          
      1213 +fluid.tests.childSummary = element => [...element.children].m
           +ap(child =>                                                  
      1214 +    child.localName + [...child.classList].map(clazz => "." +
           + clazz).join(""));                                           
      1215 +                                                             
      1216 +fluid.tests.urlize = text => text.trim().toLowerCase().replac
           +e(/[^a-z0-9]+/g, "-");                                       
      1217 +                                                             
      1218 +fluid.tests.joinWith = (a, separator, b) => a + separator + b
           +;                                                            
      1219 +                                                             
      1220 +fluid.def("fluid.tests.templateCall", {                      
      1221 +    $layers: "fluid.component",                              
      1222 +    tag: "Hello World",                                      
      1223 +    other: "there",                                          
      1224 +    view: {                                                  
      1225 +        $component: {                                        
      1226 +            $layers: "fluid.templateViewComponent",          
      1227 +            template: `<div>                                 
      1228 +                <a href="/tags/@{fluid.tests.urlize({self}.ta
           +g)}/" title="@{fluid.tests.urlize({self}.tag)}">@{tag}</a>   
      1229 +                <span class="joined">@{fluid.tests.joinWith({
           +self}.tag, -, {templateCall}.other)}</span>                  
      1230 +                <span class="literal" title="@@{tag}">count i
           +s @@{count} and @{other}</span>                              
      1231 +            </div>`                                          
      1232 +        }                                                    
      1233 +    }                                                        
      1234 +});                                                          
      1235 +                                                             
      1236 +QUnit.test("Function calls and escaped references in template
           + bindings", function (assert) {                              
      1237 +    const container = qs(".container");                      
      1238 +    const that = fluid.tests.templateCall({container});      
      1239 +    fluid.cell.stabilize();                                  
      1240 +    const link = qs("a", container);                         
      1241 +    assert.equal(link.getAttribute("href"), "/tags/hello-worl
           +d/", "Call interpolated into attribute");                    
      1242 +    assert.equal(link.getAttribute("title"), "hello-world", "
           +Call alone bound as attribute value");                       
      1243 +    assert.equal(qs(".joined", container).textContent, "Hello
           + World-there", "Call with several arguments interpolated into
           + text");                                                     
     … 240 more lines (ctrl+o to expand)
  ⎿  (timeout 5m)

● Found several issues: stale attributes on joint containers, a leftover literal
  @@{, a withdrawal pushed to a nonexistent block, and partial ordering. I'll
  check how $layers order maps to precedence next.

  Ran 1 shell command (ctrl+o to expand)

● The layer ordering was correct after all—my test expectation was wrong. Now
  fixing the actual bugs: attribute ownership on joint elements, literal
  attributes after @@{, and withdrawal of blocks that were never created.

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 20 lines, removed 6 lines
      2400       * @param {Boolean} isRoot - `true` if this rendering is 
            of a container root - if so, this will skip deleting mismatch
            ing attributes
      2401       */
      2402      fluid.patchAttrs = function (vnode, element, isRoot) {
      2403 -        if (!isRoot) {                                       
      2404 -            for (let i = element.attributes.length - 1; i >= 
           -0; i--) {                                                    
      2405 -                const attrName = element.attributes[i].name; 
      2406 -                if (!(attrName in (vnode.attrs ?? {})) && !(a
           -ttrName in (vnode.defaultAttrs ?? {})) && !attrName.startsWit
           -h("data-fl-transient")) {                                    
      2407 -                    fluid.applyAttr(element, attrName, null);
      2408 -                }                                            
      2403 +        // The attributes of a container are written both by 
           +the template in which it appears, e.g. as an element         
      2404 +        // bearing @id, and by the root of the template rende
           +red into it. Each removes only those attributes which it     
      2405 +        // wrote itself and no longer writes, recorded as flJ
           +ointAttrs and flRootAttrs respectively                       
      2406 +        const owned = new Set([...Object.keys(vnode.attrs ?? 
           +{}), ...Object.keys(vnode.defaultAttrs ?? {})]);             
      2407 +        const ownedByOther = isRoot ? element.flJointAttrs : 
           +element.flRootAttrs;                                         
      2408 +        const removable = attrName => !owned.has(attrName) &&
           + !attrName.startsWith("data-fl-transient") && !ownedByOther?.
           +has(attrName) &&                                             
      2409 +            (!isRoot || !!element.flRootAttrs?.has(attrName))
           +;                                                            
      2410 +        for (let i = element.attributes.length - 1; i >= 0; i
           +--) {                                                        
      2411 +            const attrName = element.attributes[i].name;     
      2412 +            if (removable(attrName)) {                       
      2413 +                fluid.applyAttr(element, attrName, null);    
      2414              }
      2415          }
      2416          for (const [key, value] of Object.entries(vnode.attrs
             ?? {})) {
     ...
      2418                  fluid.applyAttr(element, key, value);
      2419              }
      2420          }
      2421 +        // A default attribute is only written, and so only o
           +wned, if the element does not already have it                
      2422 +        const ownedDefaults = Object.keys(vnode.defaultAttrs 
           +?? {}).filter(key =>                                         
      2423 +            !element.hasAttribute(key) || (isRoot ? element.f
           +lRootAttrs : element.flJointAttrs)?.has(key));               
      2424          for (const [key, value] of Object.entries(vnode.defau
            ltAttrs ?? {})) {
      2425              if (!element.hasAttribute(key)) {
      2426                  fluid.applyAttr(element, key, value);
      2427              }
      2428          }
      2429 +        const written = new Set([...Object.keys(vnode.attrs ?
           +? {}), ...ownedDefaults]);                                   
      2430 +        if (isRoot) {                                        
      2431 +            element.flRootAttrs = written;                   
      2432 +        } else {                                             
      2433 +            element.flJointAttrs = written;                  
      2434 +        }                                                    
      2435      };
      2436  
      2437      fluid.vnodeToSegs = function (vnode) {

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 1 line, removed 2 lines
      2492                      }
      2493                      other = fresh;
      2494                  }
      2495 -                // A joint's attributes are also written by t
           -he component rendering into it, and so are not removed       
      2496 -                fluid.patchChildren(vchild, other, vchild.isJ
           -oint);                                                       
      2495 +                fluid.patchChildren(vchild, other);          
      2496              }
      2497              for (let i = element.childNodes.length - 1; i >= 
            vcount; --i) {
      2498                  element.childNodes[i].remove();

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 3 lines
      1715                      // The textarea's value is materialised a
            s its content, which the reconciler must leave alone
      1716                      delete vnode.children;
      1717                  }
      1718 +            } else {                                         
      1719 +                // A literal value, which may differ from the
           + template's if it held an escaped "@@{"                      
      1720 +                vnode.attrs[key] = rendered;                 
      1721              }
      1722          }
      1723      };

● Bash(cd /mnt/outer-source/gits/fluid-infusion-6/src/framework/core/js && grep
      -n "isJoint" FluidView.js && sed -i '/^ *vnode.isJoint = true;$/d'
      FluidView.js && grep…)
  ⎿  2169:            vnode.isJoint = true;
     2198:            vnode.isJoint = true;
     2261:                        vnode.isJoint = true;
     0
  ⎿  Updated src/framework/core/js/FluidView.js (+0 -3)
      2166              };
      2167              delete vnode.children;
      2168              vnode.attrs = {};
      2169 -            vnode.isJoint = true;                            
      2169              vnode.ifSignal = vnode.blockCondition;
      2170              const pushShadow = idValue ? shadow : selfShadow;
      2171              const blockEffect = fluid.cell.effect(function ()
             {
     ...
      2194              };
      2195              vnode.elementSignal ||= fluid.cell(fluid.unavaila
            bleElement, {name: `Element signal for vnode ${vnode._id}`});
      2196              delete vnode.children;
      2198 -            vnode.isJoint = true;                            
      2197              fluid.pushPotentia(selfShadow, memberName, [{
      2198                  mergeRecordType: "template",
      2199                  layer: {
     ...
      2256                          }, {name: `parentTemplate signal for 
            vnode ${vnode._id}`});
      2257                          delete vnode.children;
      2258                          vnode.attrs = fluid.filterObjKeys(vno
            de.attrs, key => !key.startsWith("@"));
      2261 -                        vnode.isJoint = true;                
      2259                          // The element bears the id derived f
            rom the subcomponent's path even when the subcomponent
      2260                          // renders nothing of its own, so tha
            t it is clear in the markup which member it holds
      2261                          vnode.defaultAttrs = {...vnode.defaul
            tAttrs, id: fluid.containerIdPrefix + fluid.composeSegment(sh
            adow.path, idValue)};
● Bash(cd /mnt/outer-source/gits/fluid-infusion-6/src/framework/core/js &&
      python3 - <<'EOF'
      import re…)
  ⎿  00:19:37.866:   Failure during update of $compute at path template of
     component at path failingRender-243.view:  Error: Template could not b
     e computed
     … +12 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView.js (+18 -3)
      2093      };
      2094  
      2095      /**
      2096 +     * Withdraw the template record pushed to a child compone
           +nt by the template of its parent, if the child exists. A     
      2097 +     * child configured by nothing else, e.g. an anonymous `f
           +luid.templateBlock`, is then destroyed.                      
      2098 +     * @param {Shadow} parentShadow - The shadow of the paren
           +t component                                                  
      2099 +     * @param {String} memberName - The member name of the ch
           +ild                                                          
      2100 +     */                                                      
      2101 +    fluid.withdrawTemplateRecord = function (parentShadow, me
           +mberName) {                                                  
      2102 +        if (parentShadow.childComponents[memberName]) {      
      2103 +            fluid.pushPotentia(parentShadow, memberName, [{me
           +rgeRecordType: "template"}]);                                
      2104 +        }                                                    
      2105 +    };                                                       
      2106 +                                                             
      2107 +    /**                                                      
      2108       * Process a vTree to parse text and attribute templates,
             creating effects to bind to markup during the later renderVi
            ew stage.
      2109       *
      2110       * Template references, e.g. to `{self}`, are resolved in
             the context of the view's parent, since a template has no
     ...
      2181              vnode.ifSignal = vnode.blockCondition;
      2182              const pushShadow = idValue ? shadow : selfShadow;
      2183              const blockEffect = fluid.cell.effect(function ()
             {
      2172 -                const present = vnode.ifSignal.get();        
      2173 -                fluid.pushPotentia(pushShadow, memberName, pr
           -esent ? [templateRecord] : [{mergeRecordType: "template"}]); 
      2184 +                if (vnode.ifSignal.get()) {                  
      2185 +                    fluid.pushPotentia(pushShadow, memberName
           +, [templateRecord]);                                         
      2186 +                } else {                                     
      2187 +                    fluid.withdrawTemplateRecord(pushShadow, 
           +memberName);                                                 
      2188 +                }                                            
      2189              }, [], {name: `@${vnode.blockKind} block effect f
            or member ${memberName} at path ${pushShadow.path}`});
      2190              blockEffect.$variety = "templateBlock";
      2191              templateEffects.push(blockEffect);
     ...
      2337              templateEffects.forEach(effect => effect.$site = 
            self);
      2338              // Destroy any conditional element or island allo
            cated by a previous activation which is no longer in the temp
            late
      2339              (viewShadow.templateJointNames || []).filter(name
             => !jointNames.includes(name)).forEach(name =>
      2325 -                fluid.pushPotentia(selfShadow, name, [{mergeR
           -ecordType: "template"}]));                                   
      2340 +                fluid.withdrawTemplateRecord(selfShadow, name
           +));                                                          
      2341              viewShadow.templateJointNames = jointNames;
      2342              return togo;
      2343          };
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+4 -3)
      1375      assert.deepEqual(fluid.tests.childSummary(container), ["h
            1", "hr.rule", "p.nosub", "span.end"], "Initial render restor
            ed");
      1376      assert.equal(qs(".end", container), end, "Unconditional e
            lement undisturbed throughout");
      1377      const childNames = Object.keys(that[fluid.metadataSymbol]
            .childComponents).filter(name => name !== "view" && name !== 
            "meta");
      1378 -    assert.deepEqual(childNames.sort(), ["if-1", "if-3"], "On
           -ly blocks whose conditions hold exist");                     
      1378 +    assert.deepEqual(childNames.sort(), ["else-1", "if-1"], "
           +Only blocks whose conditions hold exist");                   
      1379      that.destroy();
      1380  });
      1381  
     ...
      1469      const path = that[fluid.metadataSymbol].path;
      1470      assert.deepEqual(fluid.tests.childSummary(container), ["b
            .first", "h1.title", "nav", "div.modal", "div.modal2", "div.n
            ew"],
      1471          "Partials composited first, after, by member, replaci
            ng and removing");
      1472 -    assert.deepEqual(fluid.tests.childSummary(qs("h1", contai
           -ner)), ["span.meta", "span.meta2"],                          
      1473 -        "Partials at the same cutpoint follow in order of lay
           -er precedence");                                             
      1472 +    // Of the layers listed as parents of fluid.tests.partial
           +All, those listed earlier are stronger                       
      1473 +    assert.deepEqual(fluid.tests.childSummary(qs("h1", contai
           +ner)), ["span.meta2", "span.meta"],                          
      1474 +        "Partials at the same cutpoint follow in order of lay
           +er precedence, weakest first");                              
      1475      assert.equal(qs("nav", container).id, `fl-id-${path}.navb
            ar`, "Element of subcomponent bears id derived from its path"
            );
      1476      assert.notOk(qs(".first", container).hasAttribute("@relat
            ive"), "Own cutpoint of partial node not rendered");
      1477      that.destroy();
  ⎿  (timeout 5m)

● Found two bugs: block DOM nodes aren't reused on template re-activation since
  new vnodes get fresh element signals, and bindContainer reads self[$m] too
  late, after a block is already destroyed. I'll fix the first by keying block
  nodes by member name.

● Bash(cd /mnt/outer-source/gits/fluid-infusion-6/src/framework/core/js &&
      python3 - <<'EOF'
      p = "FluidView.js"…)
  ⎿  00:20:20.704:   Failure during update of $compute at path template of
     component at path failingRender-243.view:  Error: Template could not b
     e computed
     … +5 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView.js (+10 -10)
      1347       * @param {ComponentComputer} view - The view subcomponen
            t of `self`
      1348       */
      1349      fluid.bindContainer = function (templateEffects, vnode, s
            elf, view) {
      1350 +        const shadow = self[$m];                             
      1351          const bindEffect = fluid.allocateVNodeEffect(vnode, v
            node => {
      1352              const togo = fluid.cell.effect(function (element)
             {
      1352 -                fluid.noteViewContainerRegistry(element, self
           -[$m]);                                                       
      1353 +                fluid.noteViewContainerRegistry(element, shad
           +ow);                                                         
      1354              }, [vnode.elementSignal], {name: "fluid.bindConta
            iner effect"});
      1355              togo.$variety = "bindContainer";
      1356              togo.$vnode = vnode;
     ...
      2180              delete vnode.children;
      2181              vnode.attrs = {};
      2182              vnode.ifSignal = vnode.blockCondition;
      2183 +            vnode.blockKey = memberName;                     
      2184              const pushShadow = idValue ? shadow : selfShadow;
      2185              const blockEffect = fluid.cell.effect(function ()
             {
      2186                  if (vnode.ifSignal.get()) {
     ...
      2482  
      2483          // It may be undefined because this is a joint to a s
            ubcomponent as applied in fluid.processAttributeDirective
      2484          if (vnode.children !== undefined) {
      2483 -            // An element bearing @if is omitted whilst its c
           -ondition is false - its node, if any, is first removed so    
      2484 -            // that the remaining nodes are matched up with t
           -heir vnodes                                                  
      2485 +            // An element bearing @if is omitted whilst its c
           +ondition is false. Its node is marked with the key of its    
      2486 +            // block, so that it is removed whilst absent, an
           +d so that a node is reused only by its own block, even       
      2487 +            // across activations of the template - other nod
           +es are then matched up with their vnodes by position         
      2488              const isAbsent = vchild => vchild.ifSignal !== un
            defined && !vchild.ifSignal.get();
      2486 -            vnode.children.filter(isAbsent).forEach(vchild =>
           - {                                                           
      2487 -                const absentNode = vchild.elementSignal?._val
           -ue;                                                          
      2488 -                if (absentNode?.parentNode === element) {    
      2489 -                    absentNode.remove();                     
      2490 -                }                                            
      2491 -            });                                              
      2489 +            const absentKeys = new Set(vnode.children.filter(
           +isAbsent).map(vchild => vchild.blockKey));                   
      2490 +            [...element.childNodes].filter(node => absentKeys
           +.has(node.flBlockKey)).forEach(node => node.remove());       
      2491              const vchildren = vnode.children.filter(vchild =>
             !isAbsent(vchild));
      2492              const vcount = vchildren.length;
      2493              for (let i = 0; i < vcount; ++i) {
      2494                  const vchild = vchildren[i];
      2495                  let other = element.childNodes[i];
     … 9 more lines (ctrl+o to expand)
  ⎿  (timeout 5m)

● View tests all pass (307/307). Running the full suite to check for
  regressions.

  Ran 1 shell command (ctrl+o to expand)

● Full suite: 1772/1772. Next, R8 ($for ordering keyed records by priority) and
  R5 (layer-existence utilities).

  Searched for 1 pattern (ctrl+o to expand)

● Implementing R8 in expandComponentRecord and R5 alongside fluid.readLayer.

● Update(src/framework/core/js/FluidIL.js)
  ⎿  Added 1 line, removed 1 line
      2076                      if (Array.isArray(source)) {
      2077                          togo = source.map(pushSubcomponentPot
            entia);
      2078                      } else if (fluid.isPlainObject(source)) {
      2079 -                        togo = Object.entries(source).map(([k
           -ey, value]) => pushSubcomponentPotentia(value, key));        
      2079 +                        togo = fluid.orderKeyedRecords(source
           +).map(([key, value]) => pushSubcomponentPotentia(value, key))
           +;                                                            
      2080                      } else if (fluid.isUnavailable(source)) {
      2081                          return source;
      2082                      } else {

● Update(src/framework/core/js/FluidIL.js)
  ⎿  Added 21 lines
      2028      };
      2029  
      2030      /**
      2031 +     * Order the entries of a keyed collection over which a `
           +$for` iterates. Collections are keyed so that layers may     
      2032 +     * contribute, override and remove entries by the ordinar
           +y rules of merging - an entry whose value is `null` or       
      2033 +     * `undefined`, e.g. one removed by a stronger layer, is 
           +skipped. Entries are ordered by their member `priority`,     
      2034 +     * if any, as for the priorities of Infusion's listeners:
           + either a Number, higher numbers sorting first, or a         
      2035 +     * constraint relative to the key of another entry, e.g. 
           +"before:katex" or "after:katex", or "first" or "last".       
      2036 +     * Entries of equal priority, including all those without
           + one, keep the order of their keys.                          
      2037 +     * @param {Object} records - The collection              
      2038 +     * @return {Array<Array>} The entries of the collection a
           +s `[key, value]` pairs, in order                             
      2039 +     */                                                      
      2040 +    fluid.orderKeyedRecords = function (records) {           
      2041 +        const prioritised = Object.entries(records).filter(([
           +, value]) => value !== null && value !== undefined)          
      2042 +            .map(([key, value]) => ({                        
      2043 +                namespace: key,                              
      2044 +                value,                                       
      2045 +                priority: fluid.parsePriority(fluid.isPlainOb
           +ject(value, true) ? value.priority : undefined, 0, false, "$f
           +or")                                                         
      2046 +            }));                                             
      2047 +        fluid.sortByPriority(prioritised);                   
      2048 +        return prioritised.map(({namespace, value}) => [names
           +pace, value]);                                               
      2049 +    };                                                       
      2050 +                                                             
      2051 +    /**                                                      
      2052       * Expands a subcomponent-style function record into a co
            mponent instantiation.
      2053       * Produces a `subcomponent`-type layer record and pushes
             it into the component tree at the given `key` under the `sha
            dow`.
      2054       *

● Update(src/framework/core/js/Fluid.js)
  ⎿  Added 33 lines
      1867          }
      1868      };
      1869  
      1870 +    /**                                                      
      1871 +     * Determine whether a layer is defined, or will be once 
           +loaded since it is listed in `fluid.importMap`. Unlike       
      1872 +     * naming the layer amongst a component's layers, this ne
           +ver makes anything unavailable. When called within a         
      1873 +     * reactive computation, e.g. a `$compute`, the computati
           +on is reevaluated when the layer's definition changes.       
      1874 +     * @param {String} layerName - The name of the layer     
      1875 +     * @return {Boolean} `true` if the layer is defined or is
           + to be loaded                                                
      1876 +     */                                                      
      1877 +    fluid.isLayerDefined = function (layerName) {            
      1878 +        const layerRec = fluid.readLayer(layerName).get();   
      1879 +        return fluid.layerRecToUnavailable(layerRec) === null
           + || !!fluid.importMap[layerName];                            
      1880 +    };                                                       
      1881 +                                                             
      1882 +    /**                                                      
      1883 +     * Filter a list of candidate layer names to those which 
           +are defined - see `fluid.isLayerDefined`. Suitable as the    
      1884 +     * function of a `$compute` producing dynamic layers, e.g
           +. `$layers: ["fluid.component", "{self}.kindLayers"]`        
      1885 +     * with `kindLayers: "$compute:fluid.definedLayers({self}
           +.candidates)"`.                                              
      1886 +     * @param {...(String|String[])} candidates - The candida
           +te layer names, as Strings or arrays of them                 
      1887 +     * @return {String[]} Those candidates which are defined,
           + in order                                                    
      1888 +     */                                                      
      1889 +    fluid.definedLayers = function (...candidates) {         
      1890 +        return candidates.flat().filter(candidate => typeof(c
           +andidate) === "string" && fluid.isLayerDefined(candidate));  
      1891 +    };                                                       
      1892 +                                                             
      1893 +    /**                                                      
      1894 +     * Select the first of a list of candidate layer names wh
           +ich is defined, as for a lookup trying several layers in     
      1895 +     * turn - e.g. one for a page's type, then one for its ki
           +nd                                                           
      1896 +     * @param {...(String|String[])} candidates - The candida
           +te layer names, as Strings or arrays of them, in order of pre
           +ference                                                      
      1897 +     * @return {String[]} An array holding the first candidat
           +e which is defined, or an empty array if none is             
      1898 +     */                                                      
      1899 +    fluid.firstDefinedLayer = function (...candidates) {     
      1900 +        return fluid.definedLayers(...candidates).slice(0, 1)
           +;                                                            
      1901 +    };                                                       
      1902 +                                                             
      1903      // Layer definitions which have arrived while their layer
             was gated on a pending signal, keyed by layer name
      1904      fluid.gatedLayers = new Map();
      1905  

● Adding IL tests for R5 and R8.

● Bash(cat >> tests/framework-tests/core/js/FluidILTests.js <<'EOF'…)
  ⎿  00:21:55.768:   Failure during update of flatMergedComputer for path r
     eactiveBase-48:  Error {
     00:21:55.769:   Failure during update of computeInstance for path reac
     … +29 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidILTests.js (+85 -0)
      2068      assert.equal(doubledCauses[0].hint, fluid.parentMemberHin
            tText, "Hint explains the meaning of {self}");
      2069      that.destroy();
      2070  });
      2071 +                                                             
      2072 +fluid.def("fluid.tests.keyedFor", {                          
      2073 +    $layers: "fluid.component",                              
      2074 +    assets: {                                                
      2075 +        bootstrap: {href: "b.css"},                          
      2076 +        main: {href: "m.css"},                               
      2077 +        katex: {priority: 10, href: "k.css"},                
      2078 +        late: {priority: "last", href: "l.css"},             
      2079 +        print: {priority: "after:main", href: "p.css"}       
      2080 +    },                                                       
      2081 +    tags: {                                                  
      2082 +        $component: {                                        
      2083 +            $layers: "fluid.component",                      
      2084 +            $for: {                                          
      2085 +                source: "{keyedFor}.assets",                 
      2086 +                valueAs: "asset",                            
      2087 +                keyAs: "key"                                 
      2088 +            }                                                
      2089 +        }                                                    
      2090 +    }                                                        
      2091 +});                                                          
      2092 +                                                             
      2093 +fluid.def("fluid.tests.keyedForAdapted", {                   
      2094 +    $layers: "fluid.tests.keyedFor",                         
      2095 +    assets: {                                                
      2096 +        early: {priority: "before:bootstrap", href: "e.css"},
      2097 +        main: null                                           
      2098 +    }                                                        
      2099 +});                                                          
      2100 +                                                             
      2101 +QUnit.test("$for over a keyed collection honours priorities a
           +nd skips removed entries", function (assert) {               
      2102 +    const that = fluid.tests.keyedFor();                     
      2103 +    fluid.cell.stabilize();                                  
      2104 +    assert.deepEqual(that.tags.list.map(member => member.key)
           +, ["katex", "bootstrap", "main", "print", "late"],           
      2105 +        "Entries ordered by numeric, relative and extremal pr
           +iorities, otherwise by key order");                          
      2106 +    assert.deepEqual(that.tags.list.map(member => member.asse
           +t.href), ["k.css", "b.css", "m.css", "p.css", "l.css"],      
      2107 +        "Iteration variables follow their entries");         
     … 48 more lines (ctrl+o to expand)
  ⎿  (timeout 5m)

  Ran 3 shell commands (ctrl+o to expand)

● I found that dynamic layer references only resolve inside a $component's
  $layers, not within a layer's own definition as ponder.document
  requires—making the component unavailable. I'll fix the hierarchy resolver to
  address this.

● Update(src/framework/core/js/Fluid.js)
  ⎿  Added 2 lines
      2595              // A local store, so that we can use C3_precedenc
            e with direct lookups
      2596              this.flatDefs = Object.create(null);
      2597              this.unavailableLayers = Object.create(null);
      2598 +            // References to dynamic layers, e.g. "{self}.typ
           +eLayers", found amongst the parents of stored layers         
      2599 +            this.dynamicLayerNames = [];                     
      2600          }
      2601  
      2602          /**

● Update(src/framework/core/js/Fluid.js)
  ⎿  Added 6 lines, removed 2 lines
      2650                      layerDef = {$layers: []};
      2651                  } else {
      2652                      const readerExpanded = fluid.readerExpand
            Layer(fluid.deSignal(layer.raw));
      2653 -                    this.storeParents(readerExpanded, rootLay
           -er || layerName);                                            
      2654 -                    layerDef = readerExpanded;               
      2653 +                    // A reference amongst a layer's parents 
           +names dynamic layers, resolved against the component         
      2654 +                    // being merged once it is available - it
           + takes no part in the layer's static hierarchy               
      2655 +                    const [dynamicParents, staticParents] = f
           +luid.partition(readerExpanded.$layers, fluid.isILReference); 
      2656 +                    this.dynamicLayerNames.push(...dynamicPar
           +ents);                                                       
      2657 +                    layerDef = dynamicParents.length === 0 ? 
           +readerExpanded : fluid.staticParentsLayer(readerExpanded, sta
           +ticParents);                                                 
      2658 +                    this.storeParents(layerDef, rootLayer || 
           +layerName);                                                  
      2659                  }
      2660              }
      2661              this.flatDefs[layerName] = layerDef;

● Update(src/framework/core/js/Fluid.js)
  ⎿  Added 20 lines
      2579          return null;
      2580      };
      2581  
      2582 +    // Cache of layers stripped of their dynamic parents by f
           +luid.staticParentsLayer, so that an unchanged layer always   
      2583 +    // yields the same object, as for fluid.readerExpandLayer
      2584 +    fluid.staticParentsCache = new WeakMap();                
      2585 +                                                             
      2586      /**
      2587 +     * Produce a version of a reader-expanded layer whose `$l
           +ayers` holds only its static parents, i.e. excluding any     
      2588 +     * references to dynamic layers                          
      2589 +     * @param {LayerDef} readerExpanded - The layer, as expan
           +ded by `fluid.readerExpandLayer`                             
      2590 +     * @param {String[]} staticParents - The names of its sta
           +tic parents                                                  
      2591 +     * @return {LayerDef} The layer with only its static pare
           +nts                                                          
      2592 +     */                                                      
      2593 +    fluid.staticParentsLayer = function (readerExpanded, stat
           +icParents) {                                                 
      2594 +        let togo = fluid.staticParentsCache.get(readerExpande
           +d);                                                          
      2595 +        if (!togo) {                                         
      2596 +            togo = {...readerExpanded, $layers: staticParents
           +};                                                           
      2597 +            fluid.staticParentsCache.set(readerExpanded, togo
           +);                                                           
      2598 +        }                                                    
      2599 +        return togo;                                         
      2600 +    };                                                       
      2601 +                                                             
      2602 +    /**                                                      
      2603       * A resolver for computing and caching layered component
             definitions and their hierarchies.
      2604       * It evaluates layer definitions via signals, computes p
            arent relationships, and produces fully
      2605       * merged definitions along with layer metadata.

● Now flatMergedComputer needs to pick up the dynamic names that the resolver
  found.

● Update(src/framework/core/js/FluidIL.js)
  ⎿  Added 6 lines, removed 4 lines
      2469              const allLayerNames = [...layerNames, ...mergeRec
            ordLayerNames].reverse();
      2470  
      2471              const [dynamicNames, staticNames] = fluid.partiti
            on(allLayerNames, fluid.isILReference);
      2472 -            const uniqueDynamicNames = [...new Set(dynamicNam
           -es)];                                                        
      2473 -            if (!fluid.arrayEqual(uniqueDynamicNames, shadow.
           -dynamicLayerNames._value)) {                                 
      2474 -                shadow.dynamicLayerNames.set(uniqueDynamicNam
           -es);                                                         
      2475 -            }                                                
      2472  
      2473              // TODO: We notice layerNames now routinely dupli
            cates mergedRecordLayerNames - C3 doesn't in fact make a prob
            lem of this
      2474              // but we need to move to a "forgiving C3" in tim
            e - see notes from 31/5/25
     ...
      2478                  fluid.ensureImportsLoaded(shadow, layerName);
      2479              });
      2480              const resolved = fluid.flatMergedRound(shadow, hi
            erarchyResolver, uniqueStaticNames); // <= WILL READ LAYER RE
            GISTRY
      2481 +                                                             
      2482 +            // Dynamic layers may be named by our merge recor
           +ds, or amongst the parents of any of our layers              
      2483 +            const uniqueDynamicNames = [...new Set([...dynami
           +cNames, ...hierarchyResolver.dynamicLayerNames])];           
      2484 +            if (!fluid.arrayEqual(uniqueDynamicNames, shadow.
           +dynamicLayerNames._value)) {                                 
      2485 +                shadow.dynamicLayerNames.set(uniqueDynamicNam
           +es);                                                         
      2486 +            }                                                
      2487              // Copy in any layers the resolver marked unavail
            able, either through circularity or defs being unavailable
      2488              fluid.each(hierarchyResolver.unavailableLayers, (
            value, layerName) => unavailableLayerMap[layerName] = value);
      2489  

  Ran 1 shell command (ctrl+o to expand)

● Update(src/framework/core/js/Fluid.js)
  ⎿  Added 2 lines
      1875       * @return {Boolean} `true` if the layer is defined or is
             to be loaded
      1876       */
      1877      fluid.isLayerDefined = function (layerName) {
      1878 +        // Read the store itself so as to be notified if the 
           +layer is deleted, which removes its signal from the store    
      1879 +        fluid.layerStore.get();                              
      1880          const layerRec = fluid.readLayer(layerName).get();
      1881          return fluid.layerRecToUnavailable(layerRec) === null
             || !!fluid.importMap[layerName];
      1882      };

  Ran 1 shell command (ctrl+o to expand)

● R5 and R8 pass. Moving to R6: $if on linkage records, ancestor-selector
  linkages, and scoped linkages. Reading the existing IL selector matcher first.

  Read 1 file (ctrl+o to expand)

● The existing matcher relies on scope records that aren't yet available during
  component merging, so I'll build a dedicated ancestor matcher for linkages
  instead. Next, I'll check other usages of HierarchyResolver.

  Searched for 1 pattern (ctrl+o to expand)

● Writing the linkage registry changes in Fluid.js.

  Ran 1 shell command (ctrl+o to expand)
● Bash(cat > /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-9
      7d2-445d-8bfc-4f99019ddb5a/scratchpad/linkage.js <<'EOF'
          /**…)
  ⎿  OK
  ⎿  Updated src/framework/core/js/Fluid.js (+102 -14)
      2405  
      2406      /**
      2407       * @typedef {Object} LayerLinkageRecord
      2408 -     * @property {String[]} inputLayers - An array of layer n
           -ames that must be present together to trigger the linkage.   
      2409 -     * @property {String[]} outputLayers - An array of layer 
           -names that should be applied when the inputLayers co-occur.  
      2408 +     * @property {String[]} [inputLayers] - An array of layer
           + names that must be present together to trigger the linkage. 
      2409 +     * @property {String} [selector] - Alternatively, an IL s
           +elector matching the components to which the linkage         
      2410 +     * applies, whose last compound names layers of the compo
           +nent itself and whose earlier compounds name layers of its   
      2411 +     * ancestors, e.g. "ponder.type.post ponder.header" for a
           + header within a component bearing ponder.type.post, or      
      2412 +     * "ponder.type.post > ponder.header" for one which is it
           +s direct child. A compound may also name a component's       
      2413 +     * member name, or its layer's nickname.                 
      2414 +     * @property {String|String[]} outputLayers - Layer names
           + that should be applied when the linkage applies.            
      2415 +     * @property {String|null} [scopePath] - If set, the path
           + of the component to whose subtree the linkage is confined,  
      2416 +     * as resolved from the `scope` of the record held in a c
           +omponent's `$linkage`                                        
      2417       */
      2418  
      2419      // Lightweight version of
     ...
      2422      /** @type {Object.<String, LayerLinkageRecord>} A hash of
             co-occurrence names to rules rules describing how input laye
            r names should give rise to output layer names */
      2423      fluid.coOccurrenceRegistry = {};
      2424  
      2425 +    // Cache of selectors of linkage records parsed by fluid.
           +parseLinkageSelector                                         
      2426 +    fluid.linkageSelectorCache = Object.create(null);        
      2427 +                                                             
      2428      /**
      2429 +     * Parse the selector of a linkage record, caching the re
           +sult                                                         
      2430 +     * @param {String} selector - The selector, e.g. "ponder.
           +type.post ponder.header"                                     
      2431 +     * @return {ParsedSelector[]} The parsed selector        
      2432 +     */                                                      
      2433 +    fluid.parseLinkageSelector = function (selector) {       
      2434 +        return fluid.linkageSelectorCache[selector] ||= fluid
           +.parseSelector(selector, fluid.ILSSMatcher);                 
      2435 +    };                                                       
      2436 +                                                             
      2437 +    /**                                                      
      2438 +     * Determine the layers of which a change in co-occurrenc
           +e is to be signalled when a linkage record is registered     
      2439 +     * or deregistered - its input layers, or the layers name
           +d by the last compound of its selector, which matches the    
      2440 +     * components to which it applies                        
      2441 +     * @param {LayerLinkageRecord} record - The linkage recor
           +d                                                            
      2442 +     * @return {String[]} The names of the layers to be inval
           +idated                                                       
      2443 +     */                                                      
      2444 +    fluid.linkageTargetLayers = function (record) {          
     … 127 more lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidIL.js (+1 -1)
      2476  
      2477              const hierarchyResolver = new fluid.HierarchyReso
            lver(layerName => {
      2478                  fluid.ensureImportsLoaded(shadow, layerName);
      2479 -            });                                              
      2479 +            }, shadow);                                      
      2480              const resolved = fluid.flatMergedRound(shadow, hi
            erarchyResolver, uniqueStaticNames); // <= WILL READ LAYER RE
            GISTRY
      2481  
      2482              // Dynamic layers may be named by our merge recor
            ds, or amongst the parents of any of our layers

● Now expandLinkageRecord, to support $if and scope on each linkage entry.

● Bash(python3 - <<'EOF'
      p = "FluidIL.js"…)
  ⎿  OK
     1771:    fromLinkage: true
     1776:    linkage: {
     … +10 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidIL.js (+39 -13)
      1716      /**
      1717       * Expands a linkage record into an effect which register
            s its co-occurrence as an effect whose lifetime coincides
      1718       * with the instantiation of the record in the component 
            surface.
      1719 -     * The function and its arguments are resolved from the r
           -ecord, and an effect is created that runs in response to chan
           -ges.                                                         
      1719 +     * Each entry of the record may bear `$if`, as for a subc
           +omponent record, in which case it is registered only whilst  
      1720 +     * its condition holds, and `scope`, a reference to a com
           +ponent to whose subtree its effect is confined - e.g.        
      1721 +     * `scope: "{site}"` - in which case it is registered onl
           +y whilst that component exists. Otherwise its effect is      
      1722 +     * global.                                               
      1723       *
      1721 -     * @param {LayerLinkageRecord} record - A linkage record 
           -holding one or more entries including inputLayers/outputLayer
           -s                                                            
      1724 +     * @param {LayerLinkageRecord|LayerLinkageRecord[]} recor
           +d - A linkage record holding one or more entries including   
      1725 +     * inputLayers or selector, and outputLayers             
      1726       * @param {Shadow} shadow - The current component's shado
            w record used for resolving context references within the arg
            uments.
      1727       * @param {String[]} segs - The path where this effect re
            cord appears in its component
      1728       * @return {Function} A disposer function for the created
             effect. The function object includes a `$variety` property s
            et to `"$effect"`.
     ...
      1731          const site = {shadow, segs};
      1732          const siteString = fluid.renderSite(site);
      1733          const array = Array.isArray(record);
      1730 -        const togo = fluid.cell.effect( () => {              
      1731 -            if (array) {                                     
      1732 -                record.forEach( (linkage, i) => fluid.registe
           -rCoOccurrence(`${siteString}-${i}`, linkage));               
      1733 -            } else {                                         
      1734 -                fluid.registerCoOccurrence(siteString, record
           -);                                                           
      1734 +        const entries = (array ? record : [record]).map((link
           +age, i) => {                                                 
      1735 +            const entrySegs = array ? [...segs, "$linkage", i
           +] : [...segs, "$linkage"];                                   
      1736 +            const {$if, scope, ...rest} = linkage;           
      1737 +            return {                                         
      1738 +                coOcName: array ? `${siteString}-${i}` : site
           +String,                                                      
      1739 +                linkage: rest,                               
      1740 +                condition: $if === undefined ? null : fluid.e
           +xpandIfRecord($if, shadow, entrySegs),                       
      1741 +                scope: scope === undefined ? null : fluid.fet
           +chContextReference(scope, shadow, entrySegs),                
      1742 +                registered: null                             
      1743 +            };                                               
      1744 +        });                                                  
      1745 +        const deregister = function (entry) {                
      1746 +            if (entry.registered) {                          
      1747 +                fluid.deregisterCoOccurrence(entry.coOcName);
      1748 +                entry.registered = null;                     
      1749              }
      1736 -        }, null, {                                           
     … 28 more lines (ctrl+o to expand)

● Adding IL tests for R6.

● Bash(cd /mnt/outer-source/gits/fluid-infusion-6 && cat >>
      tests/framework-tests/core/js/FluidILTests.js <<'EOF'…)
  ⎿  00:25:58.917:   fq:  All tests concluded: 293/293 total passed in 1244
     ms - PASS
  ⎿  Updated tests/framework-tests/core/js/FluidILTests.js (+120 -0)
      2153      assert.equal(that.label, "default", "Fallback layer appli
            ed once preferred layer is deleted");
      2154      that.destroy();
      2155  });
      2156 +                                                             
      2157 +fluid.def("fluid.tests.linkTarget", {                        
      2158 +    $layers: "fluid.component",                              
      2159 +    adapted: false                                           
      2160 +});                                                          
      2161 +                                                             
      2162 +fluid.def("fluid.tests.linkTarget.adapted", {                
      2163 +    adapted: true                                            
      2164 +});                                                          
      2165 +                                                             
      2166 +fluid.def("fluid.tests.conditionalLinkageHost", {            
      2167 +    $layers: "fluid.component",                              
      2168 +    enabled: false,                                          
      2169 +    holderLinkage: {                                         
      2170 +        $linkage: [{                                         
      2171 +            $if: "{self}.enabled",                           
      2172 +            inputLayers: "fluid.tests.linkTarget",           
      2173 +            outputLayers: "fluid.tests.linkTarget.adapted"   
      2174 +        }]                                                   
      2175 +    }                                                        
      2176 +});                                                          
      2177 +                                                             
      2178 +QUnit.test("$if on an entry of a $linkage record", function (
           +assert) {                                                    
      2179 +    const host = fluid.tests.conditionalLinkageHost();       
      2180 +    const target = fluid.tests.linkTarget();                 
      2181 +    fluid.cell.stabilize();                                  
      2182 +    assert.equal(target.adapted, false, "Linkage whose condit
           +ion is false is not applied");                               
      2183 +    host.enabled = true;                                     
      2184 +    fluid.cell.stabilize();                                  
      2185 +    assert.equal(target.adapted, true, "Linkage applied once 
           +its condition holds");                                       
      2186 +    host.enabled = false;                                    
      2187 +    fluid.cell.stabilize();                                  
      2188 +    assert.equal(target.adapted, false, "Linkage withdrawn on
           +ce its condition fails");                                    
      2189 +    host.enabled = true;                                     
      2190 +    fluid.cell.stabilize();                                  
      2191 +    host.destroy();                                          
      2192 +    fluid.cell.stabilize();                                  
     … 83 more lines (ctrl+o to expand)
  ⎿  (timeout 5m)

● R6 tests pass. Now the experiment for R6's turnover question: which components
  re-instantiate when a linkage is toggled?

  Ran 1 shell command (ctrl+o to expand)

● The target's instance object itself turns over while children, siblings,
  parent, reactive state, and the unchanged $compute remain untouched. Now I'll
  check whether its rendered DOM survives.

  Ran 1 shell command (ctrl+o to expand)

● R2, R4, R5, R6, R7, R8, and R10 are implemented and tested. Now starting R1
  (multi-document rendering) — checking how module paths resolve against a
  document's location.

  Searched for 1 pattern (ctrl+o to expand)

● Writing R1's core in FluidView.js: the output document registry,
  fluid.outputDocumentView, inert per-document injection, and routing imports
  away from output documents.

● Bash(cat > /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-9
      7d2-445d-8bfc-4f99019ddb5a/scratchpad/outdocs.js <<'EOF'
          /**…)
  ⎿  347:                const resolved = fluid.module.resolveRelativePath(
     dokkument.location, injRec.url);
     521:            const src = abs ? origSrc : fluid.deSlash(new URL(orig
     … +10 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView.js (+157 -4)
      370          },
      371          link: {
      372              apply: ({dokkument, injRec}, existing) => {
      373 -                const resolved = fluid.module.resolveRelativeP
          -ath(dokkument.location, injRec.url);                          
      373 +                const resolved = fluid.module.resolveRelativeP
          +ath(fluid.documentLocation(dokkument), injRec.url);           
      374                  if (existing?.localName === "link") {
      375                      if (existing.href === resolved && existing
           .sheet) {
      376                          return true; // Unchanged and already 
           loaded - no load event would fire
     ...
      438       * @param {String} url - The URL to resolve.
      439       * @return {String} The absolute URL.
      440       */
      441 -    fluid.toAbsoluteUrl = (dokkument, url) => /^\w+:\/\//.test
          -(url) ? url : new URL(url, dokkument.location.href).href;     
      441 +    fluid.toAbsoluteUrl = (dokkument, url) => /^\w+:\/\//.test
          +(url) ? url : new URL(url, fluid.documentLocation(dokkument).h
          +ref).href;                                                    
      442  
      443      /**
      444       * @typedef {Object} DocInjectionRecord
     ...
      1127              const newDocEffect = fluid.cell.effect(async func
            tion docInjectEffect(injRecs) {
      1128                  try {
      1129                      /** @type {DocInjectionRecord[]} */
      1130 +                    const scriptStyles = fluid.isOutputDocume
           +nt(dokkument) ? fluid.outputScriptInjectionStyles : fluid.scr
           +iptInjectionStyles;                                          
      1131                      const docInjRecs = Object.values(injRecs)
            .map(injRec =>
      1132                          fluid.decodeInjectSFCElement(dokkumen
            t, injRec, rec.url, oldInjRecs,
      1132 -                            injRec.variety === "script" ? flu
           -id.scriptInjectionStyles : fluid.cssInjectionStyles)         
      1133 +                            injRec.variety === "script" ? scr
           +iptStyles : fluid.cssInjectionStyles)                        
      1134                      ).filter(injRec => injRec);
      1135                      // Load phase - acquire all material, exe
            cuting nothing
      1136                      const prepared = await Promise.all(docInj
            Recs.map(fluid.prepareSFCElement));
     ...
      1180          }
      1181      };
      1182  
      1183 +    /**                                                      
      1184 +     * @typedef {Object} OutputDocumentRecord                
      1185 +     * @property {Document} dokkument - A document created by
           + `fluid.createOutputDocument`                                
      1186 +     * @property {String} location - The location at which th
           +e document is to be written, as supplied on creation         
      1187 +     * @property {URL} url - The location resolved to an abso
           +lute URL, against which the document's relative URLs resolve 
      1188 +     */                                                      
      1189 +                                                             
      1190 +    // Documents created by fluid.createOutputDocument, which
           + views render into without executing any script in them -    
      1191 +    // e.g. the pages of a site rendered as one component tre
           +e. Held as a cell so that a writer may enumerate them, in    
      1192 +    // order of creation                                     
     … 159 more lines (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "FluidView.js"…)
  ⎿  OK
  ⎿  Updated src/framework/core/js/FluidView.js (+21 -3)
      1024          } else {
      1025              /** @type {DocLayerInjectionRec} **/
      1026              const rec = {
      1027 -                injRecsSignal: fluid.cell([injDone], {name: `
           -Document injections for ${injDone.dokkument.location}`})     
      1027 +                injRecsSignal: fluid.cell([injDone], {name: `
           +Document injections for ${fluid.documentLocation(injDone.dokk
           +ument)}`})                                                   
      1028              };
      1029 -            rec.injectionsComplete = fluid.cell(undefined, {n
           -ame: `Injections complete for ${injDone.dokkument.location}`}
           -)                                                            
      1029 +            rec.injectionsComplete = fluid.cell(undefined, {n
           +ame: `Injections complete for ${fluid.documentLocation(injDon
           +e.dokkument)}`})                                             
      1030                  // Read each layer's injDone signal here, rat
            her than returning a signal for them, which would itself be
      1031                  // an available value
      1032                  .computed( injRecs => fluid.processSignalArgs
            (injRecs).unavailable || true, [rec.injRecsSignal]);
     ...
      1216       * @return {URL} The location as an absolute URL
      1217       */
      1218      fluid.resolveOutputLocation = function (location) {
      1219 -        return new URL(location, document.baseURI);          
      1219 +        return new URL(location, document.baseURI || document
           +.location.href);                                             
      1220      };
      1221  
      1222      /**
     ...
      2725          $variety: "framework"
      2726      });
      2727  
      2728 +    // A view which renders into the whole of a fresh output 
           +document - see fluid.createOutputDocument - as the root      
      2729 +    // element of its template, e.g. <html>. The document is 
           +created whilst `documentLocation` is available, and released 
      2730 +    // once it is not, or once the view is destroyed - a chan
           +ged location creates a fresh document. Mixed into the        
      2731 +    // layers of a view alongside those supplying its templat
           +e, e.g.                                                      
      2732 +    // view: {$component: {$layers: ["fluid.sfcTemplateViewCo
           +mponent", "fluid.outputDocumentView"], documentLocation: "{pa
           +ge}.path"}}                                                  
      2733 +    fluid.def("fluid.outputDocumentView", {                  
      2734 +        $layers: "fluid.viewComponent",                      
      2735 +        documentLocation: fluid.unavailable({cause: "Location
           + of output document not configured", variety: "config"}),    
      2736 +        outputDocument: {                                    
      2737 +            $bindable: {                                     
      2738 +                bind: "fluid.createOutputDocument({self}.docu
           +mentLocation)",                                              
      2739 +                unbind: "fluid.releaseOutputDocument({boundVa
           +lue})"                                                       
      2740 +            }                                                
      2741 +        },                                                   
      2742 +        container: "$compute:fluid.documentElementOf({self}.o
           +utputDocument)",                                             
      2743 +        $variety: "framework"                                
      2744 +    });                                                      
      2745 +                                                             
     … 3 more lines (ctrl+o to expand)

● Now the server side of R1: linkedom overrides, per-document readiness, and a
  multi-document writer that skips unchanged files. First, the SFC fixture
  available for a test.

  Ran 1 shell command (ctrl+o to expand)

● Now writing the server-side additions and slimming hydrate.js down to its CLI.

● Bash(cd /mnt/outer-source/gits/fluid-infusion-6/src/framework/server &&
      python3 - <<'EOF'
      p = "server-support.js"…)
  ⎿  /* eslint-env node */
     "use strict";
     … +30 lines (ctrl+o to expand)
  ⎿  Updated src/framework/server/server-support.js (+160 -2)
       1  /* eslint-env node */
       2  "use strict";
       3  
       4 -const fs = require("fs");                                      
       4 +const fs = require("fs"),                                      
       5 +    path = require("path");                                    
       6  
       7  const linkedom = require("linkedom"),
       8      vm = require("vm"),
       9      he = require("he"),
       9 -    {fileURLToPath} = require("url");                          
      10 +    {fileURLToPath, pathToFileURL} = require("url");           
      11  
      12  const fluid = global.fluid;
      13  
     ...
      43      return linkedom.parseHTML(text).document;
      44  };
      45  
      46 +/**                                                            
      47 + * Server version of `fluid.parseOutputDocument` from FluidView
         +.js - linkedom executes no script in any document              
      48 + * @param {String} markup - The markup of the document         
      49 + * @return {Document} The parsed document                      
      50 + */                                                            
      51 +fluid.parseOutputDocument = fluid.serverDocumentParser;        
      52 +                                                               
      53 +/**                                                            
      54 + * Server version of `fluid.resolveOutputLocation` from FluidVi
         +ew.js. A location which is not a URL is a file path,           
      55 + * resolved against the current directory.                     
      56 + * @param {String} location - The location                     
      57 + * @return {URL} The location as an absolute URL               
      58 + */                                                            
      59 +fluid.resolveOutputLocation = function (location) {            
      60 +    return /^[a-z][a-z0-9+.-]*:\/\//i.test(location) ? new URL(
         +location) : pathToFileURL(path.resolve(location));             
      61 +};                                                             
      62 +                                                               
      63  // Currently don't actually support script nodes contextualised
           by a document
      64  fluid.loadScriptNodeInDocument = function (node /*, dokkument *
          /) {
      65      const src = node.getAttribute("src");
     ...
      155  
      156  fluid.cssInjectionStyles.link.apply = fluid.applyServerLinkInj
           ection;
     … 144 more lines (ctrl+o to expand)
  ⎿  Updated src/framework/server/hydrate.js (+1 -44)
       9  
      10  const parsedArgs = minimist(process.argv.slice(2));
      11  
      12 -fluid.writeFile = function (filename, data) {                  
      13 -    fs.writeFileSync(filename, data, "utf8");                  
      14 -    const stats = fs.statSync(filename);                       
      15 -    console.log("Written " + stats.size + " bytes to " + filena
         -me);                                                           
      16 -};                                                             
      17 -                                                               
      12  fluid.hydratedFilename = function (inputFile) {
      13      const lastdotpos = inputFile.lastIndexOf(".");
      14      return inputFile.substring(0, lastdotpos) + "-hydrated" + i
          nputFile.substring(lastdotpos);
      15  };
      16  
      23 -fluid.writeDocument = function (filename, dokkument) {         
      24 -    const outMarkup = "<!DOCTYPE html>" + dokkument.documentEle
         -ment.outerHTML;                                                
      25 -    fluid.writeFile(filename, outMarkup);                      
      26 -};                                                             
      17 +// fluid.writeDocumentWhenSettled and the functions it uses are
         + defined in server-support.js                                  
      18  
      28 -/**                                                            
      29 - * Construct a signal which is available once a booted document
         - is ready to be written - when all of its injections           
      30 - * are complete, no script is loading and no component is unava
         -ilable.                                                        
      31 - * @param {Document} dokkument - The document which has been bo
         -oted                                                           
      32 - * @return {Cell<Boolean>} A signal which holds `true` once the
         - document is ready, and is otherwise unavailable               
      33 - */                                                            
      34 -fluid.documentReady = function (dokkument) {                   
      35 -    const sources = [fluid.documentInjections.get(dokkument).in
         -jectionsComplete, fluid.scriptLoadingIdle, fluid.unavailableCom
         -ponents];                                                      
      36 -    return fluid.cell(undefined, {name: "Document ready for wri
         -ting"}).computed(() => true, sources);                         
      37 -};                                                             
      38 -                                                               
      39 -/**                                                            
      40 - * Write a booted document once the reactive graph has settled,
         - so that all the injections and rendering it triggers          
      41 - * are complete. A free effect watching the document's readines
         -s is pending whilst it is, e.g. whilst any injection is        
      42 - * in progress, and so holds its fit open until then. Once sett
         -led, nothing further can happen without some external          
      43 - * event, so a document which is not then ready never will be. 
      44 - * @param {Document} dokkument - The document which has been bo
         -oted                                                           
      45 - * @param {String} outFilename - The file to write the hydrated
         - document to                                                   
      46 - * @return {Promise} A promise which resolves once the document
         - has been written, and rejects with the reason the             
      47 - * document is not ready if the graph settles without it becomi
         -ng so                                                          
     … 17 more lines (ctrl+o to expand)
  ⎿  (timeout 3m)

  Ran 1 shell command (ctrl+o to expand)

● My readiness watcher returns an array, which is always available, so it never
  holds the settle open. It needs to return the pending value itself.

● Bash(python3 - <<'EOF'
      p = "src/framework/server/server-support.js"…)
  ⎿  hydrate-test PASS: 3 todo items rendered in hydrated demo/todo-list-sf
     c/index.html
  ⎿  Updated src/framework/server/server-support.js (+2 -1)
      246  fluid.writeDocumentsWhenSettled = async function (records) {
      247      const readies = records.map(record => fluid.documentReady(
           record.dokkument));
      248      // A free effect watching readiness is pending whilst any 
           document is, and so holds the fit open until then
      249 -    const readyWatcher = fluid.cell.effect((...readiness) => r
          -eadiness, readies, {isFree: true, name: "Watch documents ready
          - for writing"});                                              
      249 +    const readyWatcher = fluid.cell.effect((...readiness) => r
          +eadiness.find(fluid.isUnavailable) ?? true, readies,          
      250 +        {isFree: true, name: "Watch documents ready for writin
          +g"});                                                         
      251      readyWatcher.get();
      252      await fluid.cell.settle();
      253      readyWatcher.dispose();
  ⎿  (timeout 3m)

● hydrate-test passes again. Adding an R1 view test: one component tree
  rendering a $for of pages, each into its own output document.

● Bash(cat >> tests/framework-tests/core/js/FluidViewTests.js <<'EOF'…)
  ⎿  00:30:29.459:   Failure during update of $compute at path template of
     component at path failingRender-243.view:  Error: Template could not b
     e computed
     … +9 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+56 -0)
      1482          "Cutpoint of a partial overridden by another layer");
      1483      redirected.destroy();
      1484  });
      1485 +                                                             
      1486 +fluid.def("fluid.tests.outputPage", {                        
      1487 +    $layers: "fluid.component",                              
      1488 +    view: {                                                  
      1489 +        $component: {                                        
      1490 +            $layers: ["fluid.templateViewComponent", "fluid.o
           +utputDocumentView"],                                         
      1491 +            documentLocation: "{outputPage}.page.path",      
      1492 +            template: `<html lang="en"><head><title>@{page.ti
           +tle}</title></head><body class="@{page.kind}"><h1>@{page.titl
           +e}</h1></body></html>`                                       
      1493 +        }                                                    
      1494 +    }                                                        
      1495 +});                                                          
      1496 +                                                             
      1497 +fluid.def("fluid.tests.outputSite", {                        
      1498 +    $layers: "fluid.component",                              
      1499 +    pages: {                                                 
      1500 +        $reactiveRoot: [{path: "a/index.html", title: "A", ki
           +nd: "post"}, {path: "b/index.html", title: "B", kind: "page"}
           +]                                                            
      1501 +    },                                                       
      1502 +    documents: {                                             
      1503 +        $component: {                                        
      1504 +            $layers: "fluid.tests.outputPage",               
      1505 +            $for: {                                          
      1506 +                source: "{outputSite}.pages",                
      1507 +                valueAs: "page"                              
      1508 +            }                                                
      1509 +        }                                                    
      1510 +    }                                                        
      1511 +});                                                          
      1512 +                                                             
      1513 +QUnit.test("One component tree rendering many output document
           +s", function (assert) {                                      
      1514 +    const site = fluid.tests.outputSite();                   
      1515 +    fluid.cell.stabilize();                                  
      1516 +    const records = fluid.outputDocuments.get();             
      1517 +    assert.deepEqual(records.map(record => record.location), 
           +["a/index.html", "b/index.html"], "An output document created
           + for each page");                                            
      1518 +    const [docA, docB] = records.map(record => record.dokkume
           +nt);                                                         
      1519 +    assert.ok(fluid.isOutputDocument(docA) && docA !== docume
           +nt, "Pages render into output documents of their own");      
      1520 +    assert.equal(docA.documentElement.getAttribute("lang"), "
           +en", "Root of template rendered onto document element");     
      1521 +    assert.equal(docA.querySelector("title").textContent, "A"
           +, "Head rendered");                                          
     … 19 more lines (ctrl+o to expand)
  ⎿  (timeout 5m)

● Nearly all of it works. The one failure exposes a separate gap: class="@{...}"
  is never interpolated, because class is skipped unless @class is present, and
  the port relies on it. Fixing that.

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "FluidView.js"…)
  ⎿  00:31:05.035:   fq:  All tests concluded: 319/319 total passed in 2701
     ms - PASS
  ⎿  Updated src/framework/core/js/FluidView.js (+14 -5)
      1851                  vnode["class"] = clazz;
      1852              }
      1853              delete vnode.attrs[key];
      1854 -        } else if (key !== "class") {                        
      1854 +        } else {                                             
      1855              const tokens = fluid.parseAtStringTemplate(value)
            ;
      1856              const rendered = fluid.renderComputedStringTempla
            te(tokens, shadow);
      1857 -            if (fluid.isSignal(rendered)) {                  
      1857 +            // A class attribute alongside @class is rendered
           + together with it, by the allClass computer allocated in     
      1858 +            // fluid.activateTemplate                        
      1859 +            const withClassDirective = key === "class" && (vn
           +ode["class"] !== undefined || "@class" in vnode.attrs);      
      1860 +            if (fluid.isSignal(rendered) && withClassDirectiv
           +e) {                                                         
      1861                  rendered.$source = value;
      1862 +                vnode.attrs[key] = rendered;                 
      1863 +            } else if (fluid.isSignal(rendered)) {           
      1864 +                rendered.$source = value;                    
      1865                  // A template consisting of a single referenc
            e binds its raw value so that booleans survive
      1866                  const token = tokens.length === 1 ? rendered.
            $tokens[0] : null;
      1867                  const bound = token ? fluid.cell(undefined, {
            name: `raw attribute value for ${key} of vnode ${vnode._id}`}
            )
     ...
      2463                  });
      2464                  // Special marker put on the VNode by fluid.p
            rocessVNodeAttribute for @class
      2465                  if (vnode["class"]) {
      2460 -                    // Grab a reference to any static source 
           -of classes before this node was signalised                   
      2461 -                    const clazzSource = fluid.getSignalSource
           -(vnode.attrs["class"]) || "";                                
      2466 +                    // Grab a reference to any source of clas
           +ses before this node was signalised - a static class         
      2467 +                    // attribute, or one interpolating refere
           +nces, which is rendered here                                 
      2468 +                    const clazzAttr = vnode.attrs["class"];  
      2469 +                    const clazzSource = fluid.getSignalSource
           +(clazzAttr) || "";                                           
      2470                      const allClass = fluid.cell(undefined, {n
            ame: `allClass computer for vnode ${vnode._id}`})
      2471                          .computed( () => {
      2472                              const classes = Object.entries(vn
            ode["class"]).map( ([key, value]) => [key, fluid.deSignal(val
            ue)])
      2473                                  .filter(([, value]) => value 
            && !fluid.isUnavailable(value))
      2474                                  .map(([key]) => key);
      2467 -                            return [clazzSource, ...classes].
           -filter(clazz => clazz).join(" ");                            
      2475 +                            const renderedSource = fluid.isSi
           +gnal(clazzAttr) ? fluid.deSignal(clazzAttr) : clazzSource;   
      2476 +                            return [fluid.isUnavailable(rende
           +redSource) ? "" : renderedSource, ...classes].filter(clazz =>
           + clazz).join(" ");                                           
      2477                          });
      2478                      allClass.$variety = "$allClass";
      2479                      allClass.$source = clazzSource;
  ⎿  (timeout 5m)

● Adding a server-side test: an SFC loaded once through a host document, two
  pages written to disk, and unchanged pages skipped on rewrite.

● Bash(cat > tests/framework-tests/server/output-documents-test.js <<'EOF'
      /* eslint-env node */…)
  ⎿  Written 1042 bytes to /tmp/fluid-output-documents-test-f21vZD/one/inde
     x.html
     Written 1042 bytes to /tmp/fluid-output-documents-test-f21vZD/two/inde
     … +18 lines (ctrl+o to expand)
  ⎿  Created tests/framework-tests/server/output-documents-test.js (+108 
     -0)
        1 +/* eslint-env node */                                         
        2 +"use strict";                                                 
        3 +                                                              
        4 +// Test of multi-document rendering on the server: one compone
          +nt tree renders a page per record into an output              
        5 +// document of its own, into which the Single File Components 
          +of its layers are injected - their styles, and their          
        6 +// scripts as inert records - and all the documents are writte
          +n once the reactive graph has settled, skipping those         
        7 +// whose files are already up to date.                        
        8 +                                                              
        9 +const fs = require("fs"),                                     
       10 +    os = require("os"),                                       
       11 +    path = require("path"),                                   
       12 +    {pathToFileURL} = require("url");                         
       13 +                                                              
       14 +const fluid = require("../../..");                            
       15 +                                                              
       16 +const moduleBaseDir = path.resolve(__dirname, "../../..");    
       17 +const testDataDir = path.join(moduleBaseDir, "tests/framework-
          +tests/core/testData");                                        
       18 +const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "fluid-ou
          +tput-documents-test-"));                                      
       19 +                                                              
       20 +const failures = [];                                          
       21 +const expect = function (condition, message) {                
       22 +    if (!condition) {                                         
       23 +        failures.push(message);                               
       24 +    }                                                         
       25 +};                                                            
       26 +                                                              
       27 +fluid.setGlobalValue("fluid.tests.sfc.executions", 0);        
       28 +fluid.setGlobalValue("fluid.tests.outPath", name => path.join(
          +outDir, name, "index.html"));                                 
       29 +                                                              
       30 +fluid.def("fluid.tests.outPage", {                            
       31 +    $layers: "fluid.component",                               
       32 +    view: {                                                   
       33 +        $component: {                                         
       34 +            $layers: ["fluid.templateViewComponent", "fluid.ou
          +tputDocumentView"],                                           
       35 +            documentLocation: "$compute:fluid.tests.outPath({o
          +utPage}.page.name)",                                          
       36 +            template: `<html><head><title>@{page.title}</title
          +></head><body><div @id="widget"></div></body></html>`         
       37 +        }                                                     
       38 +    },                                                        
       39 +    widget: {                                                 
       40 +        $component: {                                         
     … 68 more lines (ctrl+o to expand)

● Two problems: the inert script record isn't where I expected it, and the edit
  rewrote both documents in a much smaller form. Inspecting the actual output.

● Bash(sed -i 's|^    site.destroy();$|    process.stdout.write("\\nONE:" +
      read("one") + "\\nTWO:" + read("two") + "\\nOUT2:" + JSON.stringify({w:
      outcome2.written.ma…)  ⎿  FIRST:<!DOCTYPE html><html id="fl-id-outSite-11.documents.0"><head><ti
     tle>One</title><script id="fl-script-fluid.tests.sfc.component-0" type
     ="text/x-fluid-layer">
     … +12 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/server/output-documents-test.js (+2 -0)
      83      });
      84      expect(fluid.tests.sfc.executions === 1, "SFC's script exec
          uted once only, in the host document: " + fluid.tests.sfc.execu
          tions);
      85  
      86 +    process.stdout.write("\nFIRST:" + read("one") + "\n");     
      87      const outcome2 = await fluid.writeOutputDocumentsWhenSettle
          d();
      88      expect(outcome2.written.length === 0 && outcome2.unchanged.
          length === 2, "Rebuild without changes writes nothing");
      89  
     ...
      92      expect(outcome3.written.length === 1 && outcome3.written[0]
          .location === fluid.tests.outPath("two"),
      93          "Rebuild after an edit writes only the document which c
          hanged");
      94      expect(read("two").includes("<title>Two revised</title>"), 
          "Changed document rewritten");
      95 +    process.stdout.write("\nONE:" + read("one") + "\nTWO:" + re
         +ad("two") + "\nOUT2:" + JSON.stringify({w: outcome2.written.map
         +(r => r.location), u: outcome2.unchanged.length}) + " OUT3:" + 
         +JSON.stringify({w: outcome3.written.map(r => r.location), u: ou
         +tcome3.unchanged.map(r => r.location)}) + " DOCS:" + fluid.outp
         +utDocuments.get().map(r => r.location).join() + "\n");         
      96      site.destroy();
      97  };
      98  

● I found the bug: when the page re-renders its <head>, the reconciler wipes out
  the injected SFC style/script nodes since it treats them as its own
  children—this would affect any component touching the host document's head.
  I'll make injected nodes invisible to reconciliation to fix it.

● Bash(cd /mnt/outer-source/gits/fluid-infusion-6/src/framework/core/js &&
      python3 - <<'EOF'
      p = "FluidView.js"…)
  ⎿  Written 1042 bytes to /tmp/fluid-output-documents-test-hUVFo2/one/inde
     x.html
     Written 1042 bytes to /tmp/fluid-output-documents-test-hUVFo2/two/inde
     … +17 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView.js (+20 -4)
      270       * @param {Element} fresh - The fresh node, which must alr
           eady carry the injection's id.
      271       */
      272      fluid.swapInjectedNode = function (dokkument, existing, fr
           esh) {
      273 +        fresh.flInjected = true;                              
      274          if (existing) {
      275              existing.replaceWith(fresh);
      276          } else {
     ...
      427       * @property {Boolean} [ownLayer] - For a "script", `true`
            if it holds the definition of the SFC's own layer
      428       */
      429  
      430 +    /**                                                       
      431 +     * Determine whether a DOM node was injected into its docu
          +ment for a Single File Component, e.g. its style. Such        
      432 +     * nodes are ignored when reconciling an element's childre
          +n with a template, e.g. when a component renders the          
      433 +     * document's head - see `fluid.patchChildren`. A node hel
          +d in a document loaded from markup, e.g. one written by       
      434 +     * an earlier rendering, is recognised by its id.         
      435 +     * @param {Node} node - The node to be tested             
      436 +     * @return {Boolean} `true` if the node was injected      
      437 +     */                                                       
      438 +    fluid.isInjectedNode = function (node) {                  
      439 +        return !!node.flInjected || node.nodeType === 1 /* Nod
          +e.ELEMENT_NODE */ && /^fl-(script|style)-/.test(node.id);     
      440 +    };                                                        
      441 +                                                              
      442      fluid.clearInjRec = function (dokkument, nodeId) {
      443          dokkument.getElementById(nodeId)?.remove();
      444      };
     ...
      2662              const isAbsent = vchild => vchild.ifSignal !== un
            defined && !vchild.ifSignal.get();
      2663              const absentKeys = new Set(vnode.children.filter(
            isAbsent).map(vchild => vchild.blockKey));
      2664              [...element.childNodes].filter(node => absentKeys
            .has(node.flBlockKey)).forEach(node => node.remove());
      2665 +            // Nodes injected for Single File Components, e.g
           +. into the head, are not ours to reconcile                   
      2666 +            const nodes = [...element.childNodes].filter(node
           + => !fluid.isInjectedNode(node));                            
      2667              const vchildren = vnode.children.filter(vchild =>
             !isAbsent(vchild));
      2668              const vcount = vchildren.length;
      2669              for (let i = 0; i < vcount; ++i) {
      2670                  const vchild = vchildren[i];
      2656 -                let other = element.childNodes[i];           
      2671 +                let other = nodes[i];                        
      2672                  // An element which has just become present i
            s inserted rather than taking over its successor's node
      2673                  const freshlyPresent = vchild.blockKey !== un
            defined && other && other.flBlockKey !== vchild.blockKey;
      2674                  if (!other || freshlyPresent || !fluid.matchN
            odeToVNode(other, vchild)) {
     ...
      2676                      fresh.flBlockKey = vchild.blockKey;
     … 21 more lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/server/output-documents-test.js (+12 -9)
      74      expect(outcome.written.length === 2 && outcome.unready.leng
          th === 0, "Both documents written on first build: " +
      75          JSON.stringify({written: outcome.written.length, unread
          y: outcome.unready.map(record => record.readiness)}));
      76      const read = name => fs.readFileSync(path.join(outDir, name
          , "index.html"), "utf8");
      77 -    ["one", "two"].forEach(name => {                           
      78 -        const text = read(name);                               
      79 -        expect(text.includes(`<span class="sfc-text">${name}</s
         -pan>`), `Page ${name} renders its SFC widget`);                
      80 -        expect(text.includes("<style id=\"fl-style-fluid.tests.
         -sfc.component-0\">"), `Page ${name} holds the SFC's style`);   
      81 -        expect(text.includes(`<script type="${fluid.inertScript
         -Type}" id="fl-script-fluid.tests.sfc.component-0">`),          
      77 +    const checkPage = function (name, title) {                 
      78 +        const dokkument = fluid.serverDocumentParser(read(name)
         +);                                                             
      79 +        expect(dokkument.querySelector("title")?.textContent ==
         += title, `Page ${name} renders its title`);                    
      80 +        expect(dokkument.querySelector(".sfc-text")?.textConten
         +t === name, `Page ${name} renders its SFC widget`);            
      81 +        expect(dokkument.head.querySelector("style[id=\"fl-styl
         +e-fluid.tests.sfc.component-0\"]"), `Page ${name} holds the SFC
         +'s style`);                                                    
      82 +        const script = dokkument.head.querySelector("script[id=
         +\"fl-script-fluid.tests.sfc.component-0\"]");                  
      83 +        expect(script?.getAttribute("type") === fluid.inertScri
         +ptType && script.textContent.includes("fluid.def(\"fluid.tests.
         +sfc.component\""),                                             
      84              `Page ${name} holds an inert record of the SFC's sc
          ript`);
      83 -    });                                                        
      85 +    };                                                         
      86 +    checkPage("one", "One");                                   
      87 +    checkPage("two", "Two");                                   
      88      expect(fluid.tests.sfc.executions === 1, "SFC's script exec
          uted once only, in the host document: " + fluid.tests.sfc.execu
          tions);
      89  
      86 -    process.stdout.write("\nFIRST:" + read("one") + "\n");     
      90      const outcome2 = await fluid.writeOutputDocumentsWhenSettle
          d();
      91      expect(outcome2.written.length === 0 && outcome2.unchanged.
          length === 2, "Rebuild without changes writes nothing");
      92  
     ...
       94      const outcome3 = await fluid.writeOutputDocumentsWhenSettl
           ed();
       95      expect(outcome3.written.length === 1 && outcome3.written[0
           ].location === fluid.tests.outPath("two"),
       96          "Rebuild after an edit writes only the document which 
           changed");
       94 -    expect(read("two").includes("<title>Two revised</title>"),
          - "Changed document rewritten");                               
       95 -    process.stdout.write("\nONE:" + read("one") + "\nTWO:" + r
          -ead("two") + "\nOUT2:" + JSON.stringify({w: outcome2.written.m
          -ap(r => r.location), u: outcome2.unchanged.length}) + " OUT3:"
          - + JSON.stringify({w: outcome3.written.map(r => r.location), u
          -: outcome3.unchanged.map(r => r.location)}) + " DOCS:" + fluid
          -.outputDocuments.get().map(r => r.location).join() + "\n");   
       97 +    checkPage("two", "Two revised");                          
       98 +    checkPage("one", "One");                                  
       99      site.destroy();
      100  };
      101  
  ⎿  (timeout 3m)

● Server test passes: two pages written, the rebuild writes nothing, and after
  the edit only page "two" is rewritten. Registering it as an npm script, then
  running everything.

● Bash(python3 - <<'EOF'
      p = "package.json"…)
  ⎿  00:33:04.958:   fq:  All tests concluded: 1804/1804 total passed in 15
     553ms - PASS
     hydrate-test PASS: 3 todo items rendered in hydrated demo/todo-list-sf
     … +2 lines (ctrl+o to expand)
  ⎿  Updated package.json (+2 -1)
      41          "start": "serve",
      42          "test": "node tests/test-core/qunit/js/fqunit-cli.js",
      43          "test:browser": "node tests/test-core/browser/js/demo-r
          unner.js",
      44 -        "hydrate-test": "node tests/framework-tests/server/hydr
         -ate-test.js"                                                   
      44 +        "hydrate-test": "node tests/framework-tests/server/hydr
         +ate-test.js",                                                  
      45 +        "output-documents-test": "node tests/framework-tests/se
         +rver/output-documents-test.js"                                 
      46      },
      47      "engines": {
      48          "node": ">=16"
  ⎿  (timeout 10m)

● All 1804 tests plus the server tests pass. Next I'll tackle R11: adding a
  fluid-client marker that server-side script loading skips, plus a classifier
  to distinguish framework, injected, client-payload, and other page scripts.

● Bash(python3 - <<'EOF'
      p = "src/framework/core/js/FluidView.js"…)
  ⎿  fluid.loadScriptNodeInDocument = function (node /*, dokkument */) {
         const src = node.getAttribute("src");
         if (!fluid.isServerEvaluableScript(node)) {
     … +16 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView.js (+16 -0)
      439          return !!node.flInjected || node.nodeType === 1 /* Nod
           e.ELEMENT_NODE */ && /^fl-(script|style)-/.test(node.id);
      440      };
      441  
      442 +    /**                                                       
      443 +     * Classify a script element of a document by its role, e.
          +g. so that a writer may decide which to keep:                 
      444 +     * - "framework" - a script booting Infusion itself, beari
          +ng `fluid-hydrated`, e.g. `fluid-hydrated="%infusion-6"`      
      445 +     * - "injection" - a script injected for a Single File Com
          +ponent, or an inert record of one in an output document       
      446 +     * - "client" - a script which is payload for the browser,
          + bearing `fluid-client`, e.g. one loading a widget library.   
      447 +     *   Such a script is never evaluated by the server, wheth
          +er it is in a booted document or one rendered by a template   
      448 +     * - "page" - any other script                            
      449 +     * @param {Element} node - The script element             
      450 +     * @return {String} The role of the script                
      451 +     */                                                       
      452 +    fluid.classifyScriptNode = function (node) {              
      453 +        return node.hasAttribute("fluid-hydrated") ? "framewor
          +k" :                                                          
      454 +            fluid.isInjectedNode(node) || node.getAttribute("t
          +ype") === fluid.inertScriptType ? "injection" :               
      455 +                node.hasAttribute("fluid-client") ? "client" :
          + "page";                                                      
      456 +    };                                                        
      457 +                                                              
      458      fluid.clearInjRec = function (dokkument, nodeId) {
      459          dokkument.getElementById(nodeId)?.remove();
      460      };
  ⎿  Updated src/framework/server/server-support.js (+18 -6)
      60      return /^[a-z][a-z0-9+.-]*:\/\//i.test(location) ? new URL(
          location) : pathToFileURL(path.resolve(location));
      61  };
      62  
      63 +/**                                                            
      64 + * Determine whether the server should evaluate a script elemen
         +t found in a booted document. Infusion's own scripts,          
      65 + * which the server already has its own incarnation of, client 
         +payload marked with `fluid-client`, inert records of           
      66 + * injections and scripts of any type other than JavaScript are
         + not evaluated - see `fluid.classifyScriptNode`.               
      67 + * @param {Element} node - The script element                  
      68 + * @return {Boolean} `true` if the script should be evaluated  
      69 + */                                                            
      70 +fluid.isServerEvaluableScript = function (node) {              
      71 +    const type = node.getAttribute("type");                    
      72 +    const isJavaScript = !type || /^(text|application)\/(javasc
         +ript|ecmascript)$/i.test(type);                                
      73 +    return isJavaScript && node.getAttribute("fluid-hydrated") 
         +!== "%infusion-6" && fluid.classifyScriptNode(node) !== "client
         +" &&                                                           
      74 +        fluid.classifyScriptNode(node) !== "injection";        
      75 +};                                                             
      76 +                                                               
      77  // Currently don't actually support script nodes contextualised
           by a document
      78  fluid.loadScriptNodeInDocument = function (node /*, dokkument *
          /) {
      79      const src = node.getAttribute("src");
      66 -    if (src) {                                                 
      67 -        const hydratedFrom = node.getAttribute("fluid-hydrated"
         -);                                                             
      68 -        // Don't reload Infusion which the server already has i
         -ts own incarnation of                                          
      69 -        if (hydratedFrom !== "%infusion-6") {                  
      70 -            fluid.loadInContext(src); // TODO: Convert file URL
         -s, setc.                                                       
      71 -        }                                                      
      80 +    if (!fluid.isServerEvaluableScript(node)) {                
      81 +        fluid.log("Not evaluating script on server: ", src || n
         +ode.id);                                                       
      82 +    } else if (src) {                                          
      83 +        fluid.loadInContext(src); // TODO: Convert file URLs, s
         +etc.                                                           
      84      } else {
      85          const text = node.textContent;
      86          const match = text.match(/\/\/#\s*sourceURL=(.+)$/m);

● Adding tests for the classifier (view tests) and for server-side skipping
  (server test).

● Bash(cat >> tests/framework-tests/core/js/FluidViewTests.js <<'EOF'…)
  ⎿  00:33:56.126:   fq:  All tests concluded: 320/320 total passed in 2578
     ms - PASS
     Allocated instanceId 2 at site outSite-11
     … +3 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+11 -0)
      1538      fluid.cell.stabilize();
      1539      assert.equal(fluid.outputDocuments.get().length, 0, "All 
            documents released on destruction of the tree");
      1540  });
      1541 +                                                             
      1542 +QUnit.test("Scripts classified by their role", function (asse
           +rt) {                                                        
      1543 +    const holder = document.createElement("div");            
      1544 +    holder.innerHTML = `<script src="FluidCore.js" fluid-hydr
           +ated="%infusion-6"></script>                                 
      1545 +        <script id="fl-script-some.layer-0">fluid.def("some.l
           +ayer", {});</script>                                         
      1546 +        <script type="${fluid.inertScriptType}">fluid.def("ot
           +her.layer", {});</script>                                    
      1547 +        <script src="katex.js" fluid-client defer></script>  
      1548 +        <script>console.log("page");</script>`;              
      1549 +    assert.deepEqual([...holder.querySelectorAll("script")].m
           +ap(fluid.classifyScriptNode),                                
      1550 +        ["framework", "injection", "injection", "client", "pa
           +ge"], "Each script classified");                             
      1551 +});                                                          
  ⎿  Updated tests/framework-tests/server/output-documents-test.js (+9 -0)
       97      checkPage("two", "Two revised");
       98      checkPage("one", "One");
       99      site.destroy();
      100 +                                                              
      101 +    const scripts = fluid.serverDocumentParser(`<html><head>  
      102 +        <script fluid-client>fluid.tests.clientRan = true;</sc
          +ript>                                                         
      103 +        <script type="${fluid.inertScriptType}">fluid.tests.in
          +ertRan = true;</script>                                       
      104 +        <script>fluid.tests.pageRan = true;</script>          
      105 +    </head></html>`);                                         
      106 +    scripts.querySelectorAll("script").forEach(node => fluid.l
          +oadScriptNodeInDocument(node, scripts));                      
      107 +    expect(!fluid.tests.clientRan && !fluid.tests.inertRan && 
          +fluid.tests.pageRan,                                          
      108 +        "Client payload and inert records not evaluated on the
          + server, unlike other page scripts");                         
      109  };
      110  
      111  run().then(() => {
  ⎿  (timeout 5m)

● All implementations are done and tested. Running the linter over the changed
  files.

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "src/framework/server/hydrate.js"…)
  ⎿  hydrate-test PASS: 3 todo items rendered in hydrated demo/todo-list-sf
     c/index.html
  ⎿  Updated src/framework/server/hydrate.js (+1 -2)
       3  
       4  const fluid = require("../../..");
       5  
       6 -const fs = require("fs"),                                      
       7 -    path = require("path");                                    
       6 +const path = require("path");                                  
       7  const minimist = require("minimist");
       8  
       9  const parsedArgs = minimist(process.argv.slice(2));
  ⎿  (timeout 3m)

● Lint is clean. One AGENTS.md style violation to fix: loadScriptNodeInDocument
  opens with a negated condition.

● Bash(python3 - <<'EOF'
      p = "src/framework/server/server-support.js"…)
  ⎿  output-documents-test PASS
  ⎿  Updated src/framework/server/server-support.js (+5 -4)
      77  // Currently don't actually support script nodes contextualised
           by a document
      78  fluid.loadScriptNodeInDocument = function (node /*, dokkument *
          /) {
      79      const src = node.getAttribute("src");
      80 -    if (!fluid.isServerEvaluableScript(node)) {                
      81 -        fluid.log("Not evaluating script on server: ", src || n
         -ode.id);                                                       
      82 -    } else if (src) {                                          
      80 +    const evaluable = fluid.isServerEvaluableScript(node);     
      81 +    if (evaluable && src) {                                    
      82          fluid.loadInContext(src); // TODO: Convert file URLs, s
          etc.
      84 -    } else {                                                   
      83 +    } else if (evaluable) {                                    
      84          const text = node.textContent;
      85          const match = text.match(/\/\/#\s*sourceURL=(.+)$/m);
      86          const sourceURL = match?.[1];
      87          vm.runInContext(text, fluid.V8Context, sourceURL);
      88 +    } else {                                                   
      89 +        fluid.log("Not evaluating script on server: ", src || n
         +ode.id);                                                       
      90      }
      91  };
      92  
  ⎿  (timeout 3m)

● Implementation is complete. Now the investigations for the report-only items.
  First R9: does a stronger layer's $component record now merge member by member
  (from #19), and what does null do?

  Ran 1 shell command (ctrl+o to expand)

● R9's second bullet checks out as working since #19 — stronger $component
  records merge member-by-member, $layers accumulate, and weaker $if still
  applies, while null fails and takes down the parent. Next I'll verify whether
  a stronger layer can cancel a weaker $if.

  Ran 1 shell command (ctrl+o to expand)

● I'll note for the R9 report that a stronger $if: true doesn't cleanly cancel a
  weaker $if. Next, I'll investigate R3: how elideParent: false behaves for
  multi-root templates, plain @id children, and $for list members.

  Ran 1 shell command (ctrl+o to expand)

● Found that elideParent: false renders multi-root @id children correctly, but
  $for members with multi-root templates drop all but the first root and get
  wrapped in literal <fragment> elements. I'll document these findings in
  REQUIREMENTS.md rather than fix them, since R3 calls for elaboration.

  Ran 2 shell commands (ctrl+o to expand)

● Before inserting the responses, checking one claim: what sourceURL do the
  wrapped SFC scripts in a hydrated host document carry?

  Ran 1 shell command (ctrl+o to expand)

● Confirmed: absolute file: URLs leak through sourceURL. The SFC styles I'm
  injecting into output documents carry the same /*# sourceURL= comment, so I'll
  drop it there as part of R1.

● Bash(python3 - <<'EOF'
      p = "src/framework/core/js/FluidView.js"…)
  ⎿  Traceback (most recent call last):
       File "<stdin>", line 22, in <module>
     AssertionError
     output-documents-test PASS
  ⎿  Updated src/framework/core/js/FluidView.js (+2 -1)
      357      fluid.cssInjectionStyles = {
      358          literal: {
      359              apply: ({dokkument, injRec, url}, existing) => {
      360 -                const text = injRec.text + `\n/*# sourceURL=${
          -url}*/`;                                                      
      360 +                // An output document is to be published, and 
          +so does not reveal the location of the SFC's source           
      361 +                const text = injRec.text + (fluid.isOutputDocu
          +ment(dokkument) ? "" : `\n/*# sourceURL=${url}*/`);           
      362                  if (existing?.localName === "style") {
      363                      existing.textContent = text;
      364                  } else {
  ⎿  (timeout 3m)

  Ran 2 shell commands (ctrl+o to expand)

● Inserting the blocks into REQUIREMENTS.md, each just before the next section's
  heading.

  Ran 1 shell command (ctrl+o to expand)

● Responses are in. Final full verification run: whole suite, both server tests,
  and lint.

  Ran 1 shell command (ctrl+o to expand)

● All 1805 tests and both server tests pass; the one lint error is in an
  untouched file picked up incidentally by my glob. The diff is mostly file-mode
  changes from the shared folder, so I'll list only the files with real content
  changes.

  Ran 1 shell command (ctrl+o to expand)
● I've implemented R1, R2, R4, R5, R7, R8, R10, the first three R6 bullets and
  R11's client-only scripts. Where a comment asked for elaboration (R3, the
  fourth R6 bullet, R9, and the R11 soft-strip and post-pass questions), I wrote
  the answers inline in ponder-infusion/infusion/REQUIREMENTS.md, each under a
  Response heading. Every implemented requirement has an Implemented in this 
  pass note there with details. All tests pass: 1805/1805 in npm test (from
  1739), hydrate-test, and a new npm run output-documents-test.

  Implemented
  - R1, multi-document rendering: one component tree can now render many pages,
    each into its own document, via the new fluid.outputDocumentView layer. Each
    page document gets its SFCs' styles, and their scripts as non-running
    records. Readiness is checked per document. The new writer,
    fluid.writeOutputDocumentsWhenSettled, skips files whose contents haven't
    changed.
  - R2: a verbatim: true view mode that renders content HTML without scanning it
    for @{. fluid-layers elements inside it become child components, with their
    data- attributes available as dataset. @@{ gives a literal @{ anywhere.
  - R4: @if / @else on elements. The element is left out entirely while false,
    and references inside it still resolve against the surrounding component.
  - R5: fluid.definedLayers, fluid.firstDefinedLayer and fluid.isLayerDefined,
    usable directly in a $compute.
  - R6: $if, selector (matching ancestors) and scope on $linkage entries.
  - R7:
    - New dispositions: first:, last:, replace: and remove:.
    - Selectors can target @member, combined with tag, .class, #id and >.
    - Each partial node can carry its own cutpoint with @relative.
    - Partials are ordered by layer precedence.
    - Partials can be plain JavaScript layers; relativeContainer is no longer
      read from SFC source text.
    - Every @id element now carries its fl-id- id, even when its subcomponent
      renders nothing.
  - R8: $for over a keyed collection honours priority and skips null entries.
    Infusion's convention is higher-first, so the port's ascending priorities
    need flipping.
  - R10: function calls in bindings, e.g. @{ponder.urlize({self}.tag)}. I didn't
    do pipelines (@{tag | urlize}), since they need a decision on argument
    order.
  - R11: <script fluid-client> is never run on the server, and
    fluid.classifyScriptNode lets a writer tell framework, injected, client and
    page scripts apart.

  Bugs fixed along the way
  - Dynamic layer references like "{self}.pageLayers" only worked inside a
    $component record. In a layer's own $layers, which is how ponder.document
    uses them, the component became unavailable.
  - class="@{...}" was never interpolated unless @class was also present.
  - When a component re-rendered <head>, it deleted the SFC styles and scripts
    injected there.
  - When a parent re-rendered, it stripped the attributes a child had set on its
    own container.

  Findings from the investigations
  - R3: with elideParent: false, each $for member is wrapped in a literal
    <fragment> element. The port's ponder-tags.vue would emit those today. I
    described a fix rather than making it, since R3 asked for elaboration.
  - R6: a linkage toggle only replaces the target's instance object. Its state,
    unchanged computed values, child components and DOM nodes all survive.
  - R9: your second bullet already works since #19. What's still missing is a
    way to replace $layers or cancel a weaker $if, and null currently makes the
    whole parent unavailable. The R9 response sets out what accepting null would
    take.
  - R11: two non-efficiency reasons the traces can't just stay:
    - A <fluid-module> early in <head> makes browsers move the following
      <title>, <meta> and <link> into <body>.
    - Hydrated output leaks absolute file: paths through sourceURL. I removed
      them from styles in the new page documents.

  Things to know before reviewing
  - I read R6's single comment as applying only to its last bullet, so I
    implemented the first three. Say if you meant all of R6 to be a response.
  - Two existing conditional-rendering tests now expect the fl-id- id on an
    empty slot element; that follows from the R7 id change.
  - I didn't update the ponder SFCs to use the new features; their PROPOSED
    markers are still there.
  - src/lib/codemirror/js/csslint.js and the node-fetch-wrapper.js lint error
    were already like that when I started; I didn't touch either.

  Infusion files changed: Fluid.js, FluidIL.js, FluidView.js, server-support.js,
  hydrate.js (its write helpers moved into server-support.js), package.json,
  FluidViewTests.js and FluidILTests.js, plus the new
  tests/framework-tests/server/output-documents-test.js. Nothing is committed.

✻ Cooked for 41m 24s · done 0:41

❯ Do as much as you can with these new features to make a working build in      
  ponder-infusion                                                               

  Ran 2 shell commands (ctrl+o to expand)

● This is a substantial job, so I'll iterate: get the content pipeline running,
  then boot the site and fix things until pages render. First, dependencies.

  Ran 3 shell commands (ctrl+o to expand)

● Installed. Now getting siteModel.js running on Node 18: it uses Object.groupBy
  and recursive readdirSync, neither of which exists in 18.15.

  Ran 1 shell command (ctrl+o to expand)

● The content model loads: 59 pages. Now the theme. I need to read the rest of
  the SFCs before booting.

  Ran 2 shell commands (ctrl+o to expand)

● I've reviewed the theme, so now I'll rewrite buildSite.js to use the real
  fluid.outputDocumentView and fluid.writeOutputDocumentsWhenSettled APIs,
  starting with the driver and document layer, then fix issues as they surface.

● Write(/mnt/outer-source/gits/ponder-infusion/infusion/js/buildSite.js)
  ⎿  Error writing file

  Read 1 file (ctrl+o to expand)

● Write(/mnt/outer-source/gits/ponder-infusion/infusion/js/buildSite.js)
  ⎿  Added 50 lines, removed 49 lines
       2  
       3  "use strict";
       4  
       5 -// SKETCH - not runnable against Infusion 6 as it stands. The m
         -ulti-document counterpart of                                   
       6 -// src/framework/server/hydrate.js in Infusion 6: renders the w
         -hole site as one component tree, with one                      
       7 -// ponder.document per page, each rendering into its own server
         - document. APIs marked PROPOSED do not yet exist -             
       8 -// see REQUIREMENTS.md.                                        
       5 +// Renders the whole site as one component tree, with one ponde
         +r.document per page, each rendering into an output             
       6 +// document of its own (fluid.outputDocumentView), and writes e
         +very document which has changed - the multi-document           
       7 +// counterpart of src/framework/server/hydrate.js in Infusion 6
         +.                                                              
       8  //
      10 -// Usage: node infusion/js/buildSite.js [--infusion ../fluid-in
         -fusion-6] [-o docs-infusion]                                   
       9 +// Usage: node infusion/js/buildSite.js [--infusion ../fluid-in
         +fusion-6] [-o docs-infusion] [--verbose true]                  
      10  
      11  const fs = require("fs"),
      12      path = require("path");
      14 -const minimist = require("minimist");                          
      13  const siteModel = require("./siteModel.js");
      14  
      17 -const parsedArgs = minimist(process.argv.slice(2));            
      15 +/**                                                            
      16 + * Parse the command line arguments of the form `--name value` 
         +or `-n value`                                                  
      17 + * @param {String[]} args - The arguments following the script'
         +s name                                                         
      18 + * @return {Object<String, String>} The values of the arguments
         + keyed by name                                                 
      19 + */                                                            
      20 +const parseArgs = function (args) {                            
      21 +    const togo = {};                                           
      22 +    for (let i = 0; i < args.length - 1; i += 2) {             
      23 +        togo[args[i].replace(/^-+/, "")] = args[i + 1];        
      24 +    }                                                          
      25 +    return togo;                                               
      26 +};                                                             
      27 +                                                               
      28 +const parsedArgs = parseArgs(process.argv.slice(2));           
      29  const siteDir = path.resolve(__dirname, "../..");
      30  const infusionDir = path.resolve(parsedArgs.infusion ?? path.jo
          in(siteDir, "../fluid-infusion-6"));
      31  const outDir = path.resolve(parsedArgs.o ?? path.join(siteDir, 
          "docs-infusion"));
      32  
      33  const fluid = require(infusionDir);
      34 +fluid.setLogging(!!parsedArgs.verbose);                        
      35  
      36  /**
      25 - * Rewrite site-absolute URLs in a document to be relative to t
         -he document's own location - Hugo's `relativeURLs`,            
      26 - * which is likewise a pass over the output rather than a conce
         -rn of the templates.                                           
      27 - * PROPOSED (REQUIREMENTS.md R11): a hook in the framework's do
         -cument writer for passes such as this one                      
      37 + * Rewrite site-absolute URLs in a document to be relative to t
         +he document's own location - Hugo's `relativeURLs`.            
      38 + * See REQUIREMENTS.md R11: this would better be done as each U
         +RL is rendered, and is retained here only until the            
      39 + * templates do so.                                            
      40   * @param {Document} dokkument - The rendered document
      29 - * @param {String} relPermalink - The document's site-relative 
         -URL                                                            
      41 + * @param {String} outputPath - The document's path relative to
         + the publish directory, e.g. "post/x/index.html"               
      42   */
      31 -const relativiseURLs = function (dokkument, relPermalink) {    
      32 -    const depth = relPermalink.split("/").filter(segment => seg
         -ment).length;                                                  
      43 +const relativiseURLs = function (dokkument, outputPath) {      
      44 +    const depth = outputPath.split("/").filter(segment => segme
         +nt).length - 1;                                                
      45      const prefix = depth === 0 ? "./" : "../".repeat(depth);
      46      ["href", "src"].forEach(attr => {
      47          dokkument.querySelectorAll(`[${attr}^="/"]`).forEach(el
          ement => {
      48              const value = element.getAttribute(attr);
      49              // A protocol-relative URL such as //cdn.example.or
          g/x.js is left alone
      38 -            element.setAttribute(attr, value.startsWith("//") ?
         - value : prefix + value.substring(1));                         
      50 +            if (!value.startsWith("//")) {                     
      51 +                element.setAttribute(attr, prefix + value.subst
         +ring(1));                                                      
      52 +            }                                                  
      53          });
      54      });
      55  };
      56  
      43 -/**                                                            
      44 - * Write one rendered page document to the output directory    
      45 - * @param {Object} page - The page record                      
      46 - * @param {Document} dokkument - The document rendered for it  
      47 - */                                                            
      48 -const writePage = function (page, dokkument) {                 
      49 -    relativiseURLs(dokkument, page.relPermalink);              
      50 -    // PROPOSED (REQUIREMENTS.md R11): strip the framework's ow
         -n <fluid-module>/<fluid-import> markup and injected SFC        
      51 -    // script nodes, unless the output is to be live-editable, 
         -in which case keep them and mark the document hydrated         
      52 -    const outFile = path.join(outDir, page.outputPath);        
      53 -    fs.mkdirSync(path.dirname(outFile), {recursive: true});    
      54 -    fluid.writeDocument(outFile, dokkument);                   
      55 -};                                                             
      56 -                                                               
      57  const main = async function () {
      58 -    // The host document holds no markup of its own - it only d
         -eclares the modules and SFC imports, as for any page           
      59 -    // booted by hydrate.js                                    
      60 -    const host = fluid.loadAndBootDocument(path.join(__dirname,
         - "../site.html"));                                             
      58 +    // The host document holds no markup of its own - it only d
         +eclares the modules and SFC imports                            
      59 +    fluid.loadAndBootDocument(path.join(__dirname, "../site.htm
         +l"));                                                          
      60      const model = siteModel.load(siteDir);
      61  
      63 -    // PROPOSED (REQUIREMENTS.md R1): ponder.document's view co
         -ntainer is computed by                                         
      64 -    // fluid.serverDocument.create(outputPath), which creates a
         -nd registers a fresh linkedom document. Script and             
      65 -    // style injections from SFCs are then made into each such 
         -document, as they are for the host today.                      
      66 -    // The layers' creator functions live in Infusion's V8 cont
         -ext rather than node's global                                  
      62 +    fs.cpSync(path.join(siteDir, "static"), outDir, {recursive:
         + true});                                                       
      63 +                                                               
      64 +    // The creator functions of the layers live in Infusion's V
         +8 context rather than node's global                            
      65      const site = fluid.initFreeComponent("ponder.site", {
      68 -        config: model.config,                                  
      69 -        pages: model.pages,                                    
      70 -        data: model.data                                       
      66 +        config: {$reactiveRoot: model.config},                 
      67 +        pages: {$reactiveRoot: model.pages},                   
      68 +        data: {$reactiveRoot: model.data},                     
      69 +        outDir                                                 
      70      });
      71  
      73 -    await fluid.cell.settle();                                 
      74 -    // PROPOSED: per-document readiness - fluid.documentReady()
         - takes a single document, and its injectionsComplete           
      75 -    // is tracked per document, so this would be checked for ea
         -ch                                                             
      76 -    const unready = model.pages.filter((page, i) => fluid.isUna
         -vailable(fluid.documentReady(site.documents.list[i].view.contai
         -ner.ownerDocument).get()));                                    
      77 -    if (unready.length === 0) {                                
      78 -        site.documents.list.forEach((documentComponent, i) => {
      79 -            writePage(model.pages[i], documentComponent.view.co
         -ntainer.ownerDocument);                                        
      80 -        });                                                    
      81 -        console.log(`Wrote ${model.pages.length} pages to ${out
         -Dir} (host ${host.location})`);                                
      82 -    } else {                                                   
      83 -        console.error("Pages not ready after settling: " + unre
         -ady.map(page => page.relPermalink).join(", "));                
      72 +    const outcome = await fluid.writeOutputDocumentsWhenSettled
         +(record => {                                                   
      73 +        relativiseURLs(record.dokkument, path.relative(outDir, 
         +record.location).split(path.sep).join("/"));                   
      74 +        return record.location;                                
      75 +    });                                                        
      76 +    console.log(`Wrote ${outcome.written.length} pages to ${out
         +Dir}, ${outcome.unchanged.length} unchanged`);                 
      77 +    if (outcome.unready.length > 0) {                          
      78 +        console.error(`${outcome.unready.length} pages were not
         + ready:`);                                                     
      79 +        outcome.unready.forEach(record => console.error("  " + 
         +record.location + ": " + fluid.renderUnavailable(record.readine
         +ss)));                                                         
      80          process.exitCode = 1;
      81      }
      82 +    if (fluid.outputDocuments.get().length === 0) {            
      83 +        console.error("No pages were rendered - unavailable com
         +ponents: ", JSON.stringify(fluid.unavailableComponents.get()));
      84 +        process.exitCode = 1;                                  
      85 +    }                                                          
      86 +    site.destroy();                                            
      87  };
      88  
      89  main().catch(error => {

● Now ponder-document.vue: render into an output document, and use
  fluid.definedLayers for the Hugo layout lookup.

  Ran 1 shell command (ctrl+o to expand)

● Found a bug: the SFC parser is grabbing every <script> tag as a block, even
  ones nested inside <template>, which is why ponder-scriptTag.vue's template
  script got misparsed as code. I'll fix the parser to only treat top-level
  script tags as SFC blocks.

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "FluidView.js"…)
  ⎿  4
     00:50:14.864:   ASSERTION FAILED:  Inconsistent hierarchy for layer po
     nder.site: conflict between parent orders fluid.component, fluid.resol
     … +11 lines (ctrl+o to expand)
  ⎿  Shell cwd was reset to /mnt/outer-source/gits/fluid-infusion-6
  ⎿  Updated src/framework/core/js/FluidView.js (+15 -4)
      711      };
      712  
      713      /**
      714 +     * Find the top-level blocks of a Single File Component wi
          +th a given tag - e.g. its `<script>` blocks, but not any      
      715 +     * `<script>` element within its `<template>`, which is ma
          +rkup to be rendered                                           
      716 +     * @param {VNode} vTree - The virtual DOM tree representin
          +g the Single File Component                                   
      717 +     * @param {String} tag - The tag of the blocks            
      718 +     * @return {VNode[]} The blocks, in document order        
      719 +     */                                                       
      720 +    fluid.sfcBlocks = function (vTree, tag) {                 
      721 +        return vTree.children.filter(child => child.tag === ta
          +g);                                                           
      722 +    };                                                        
      723 +                                                              
      724 +    /**                                                       
      725       * Describe the error of a Single File Component which def
           ines its view's template twice - see
      726       * `fluid.hasSFCTemplateConflict`
      727       * @param {String} layerName - The name of the layer defin
           ed by the SFC
     ...
      742       * @return {Boolean} `true` if the template is defined twi
           ce
      743       */
      744      fluid.hasSFCTemplateConflict = function (vTree, ourSNI, la
           yerName) {
      734 -        const docTemplate = fluid.querySelectorAll(vTree, "tem
          -plate")[0];                                                   
      745 +        const docTemplate = fluid.sfcBlocks(vTree, "template")
          +[0];                                                          
      746          const ownTemplate = fluid.get(ourSNI.defMaps, [layerNa
           me, "view", "$component", "template", $m]);
      747          const viewLayers = fluid.defFromMap(ourSNI.text, ourSN
           I.defMaps, layerName, ["view", "$component", "$layers"]);
      748          return !!docTemplate && !!ownTemplate && !fluid.makeAr
           ray(viewLayers).includes("fluid.partialViewComponent");
     ...
      874  
      875          /** @type {Object<String, InjectRecord>} */
      876          const injRecs = {};
      866 -        const scriptNodes = fluid.querySelectorAll(vTree, "scr
          -ipt");                                                        
      877 +        const scriptNodes = fluid.sfcBlocks(vTree, "script"); 
      878          if (scriptNodes.length === 0) {
      879              reject(`Error in SFC: Expected definition for laye
           r ${layerName} but no script node was found`);
      880          } else {
     ...
      900                  let patchedText = ourSNI.text;
      901  
      902                  /** @type {VNode} */
      892 -                const docTemplate = fluid.querySelectorAll(vTr
          -ee, "template")[0];                                           
      903 +                const docTemplate = fluid.sfcBlocks(vTree, "te
          +mplate")[0];                                                  
      904  
      905                  let addLayers = ["fluid.templateViewComponent"
           ];
     … 9 more lines (ctrl+o to expand)
  ⎿  (timeout 5m 20s)

● Found a C3 conflict: ponder.site orders fluid.component before
  fluid.resolveRoot, even though the latter derives from the former—an
  inconsistent hierarchy since earlier should mean stronger.

  Ran 1 shell command (ctrl+o to expand)

● Now it runs but didn't finish within 5 minutes. That's either a loop or very
  slow rendering. I'll add a --limit option to build only a few pages and see.

  Ran 1 shell command (ctrl+o to expand)

● A page rendered. Let me look at it.

  Ran 1 shell command (ctrl+o to expand)

● The home page renders successfully, though each page is carrying every SFC's
  script unnecessarily—I'll trim that later. Right now I'm focused on the
  performance issue, so I'll time rendering for 5 and 10 pages.

  Ran 2 shell commands (ctrl+o to expand)

● With 10 pages the process exits silently, without ever resolving: the reactive
  graph stalls with nothing left to wait on. I'll add hydrate.js's exit
  diagnostics to the build.

  Ran 1 shell command (ctrl+o to expand)

● I found the issue: a Hugo shortcode rendered as a fluid-layers content island
  referencing a layer that doesn't exist, so it hangs pending indefinitely and
  blocks every page. Let me check which shortcodes the content actually uses.

  Ran 2 shell commands (ctrl+o to expand)

● Only one shortcode is used: stabilization, which is pure markup plus a client
  script. Porting it as an island layer.

  Ran 1 shell command (ctrl+o to expand)

● The full build is running in the background; it's slow, which I'll profile
  next. Meanwhile, comparing the rendered home page body against Hugo's.

  Ran 1 shell command (ctrl+o to expand)

● I found two issues: the R3 bug wrapping $for members in literal
  <template>/<fragment> tags (affecting the navbar and URL rewrite), and
  leftover empty optional elements like the subtitle <h2>. I'll fix the
  framework bug and switch the empty elements to @if, starting by checking the
  background build.

  Ran 1 shell command (ctrl+o to expand)
● Still running. Implementing the list fragment fix meanwhile.

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 3 lines, removed 1 line
      3214                      designalArgs: childTrees,
      3215                      unavailable: treesUnavailable
      3216                  } = fluid.processSignalArgs(componentList.map
            (component => component.view.vTree));
      3217 +                // A member whose view does not elide its tem
           +plate's root renders the root's children - e.g. several      
      3218 +                // top-level nodes of a template, or the cont
           +ents of an SFC's <template> - which are spliced in its place 
      3219                  return treesUnavailable || {
      3220                      tag: "template",
      3219 -                    children: childTrees,                    
      3221 +                    children: childTrees.flatMap(childTree =>
           + fluid.isTemplateRootTag(childTree.tag) ? childTree.children 
           +: [childTree]),                                              
      3222                      _id: vnode_id++
      3223                  };
      3224              }

● Update(src/framework/core/js/FluidView.js)
  ⎿  Added 8 lines
      3197      });
      3198  
      3199      /**
      3200 +     * Determine whether a tag is that of the synthetic root 
           +of a parsed template - the fragment holding the top-level    
      3201 +     * nodes of a template, or the <template> block of an SFC
           + - which is not itself rendered as an element                
      3202 +     * @param {String} tag - The tag                         
      3203 +     * @return {Boolean} `true` if it is the tag of a templat
           +e's root                                                     
      3204 +     */                                                      
      3205 +    fluid.isTemplateRootTag = tag => tag === "fragment" || ta
           +g === "template";                                            
      3206 +                                                             
      3207 +    /**                                                      
      3208       * Compute the vTree for a list of view components by con
            catenating the vTrees rendered by their views
      3209       * @param {ComponentComputer} self - The component list
      3210       * @param {Signal<ComponentComputer[]>} list - The list o
            f view components

● Now converting the header's optional elements to @if. Checking Hugo's header
  partial for the exact markup first.

  Ran 2 shell commands (ctrl+o to expand)

● Rewriting ponder.header with @if, following Hugo's logic: rule unless post,
  <span> subtitle for pages, <h2> otherwise.

  Ran 2 shell commands (ctrl+o to expand)

● The full build has burned 10 CPU-minutes, so cost grows superlinearly with
  page count. I'll kill it and profile a 20-page build.

  Ran 1 shell command (ctrl+o to expand)

● Background command "Add the shortcode island layer and run the full build"
failed with exit code 144

  Ran 1 shell command (ctrl+o to expand)

● Those runs are fast but fail. Looking at why:

  Ran 1 shell command (ctrl+o to expand)

● Pages 12 and 13 have islands that never resolve. Their content must contain
  literal fluid-layers attributes:

  Ran 2 shell commands (ctrl+o to expand)

● The figure shortcode is used too; my earlier grep missed it. Here's how Hugo
  rendered one:

  Ran 1 shell command (ctrl+o to expand)

● Porting Hugo's figure shortcode (the hugo-easy-gallery version in the theme)
  as an island layer.

  Ran 1 shell command (ctrl+o to expand)

● 20 pages in 27 s. Starting the full build in the background:

  Ran 1 shell command (ctrl+o to expand)

● While that runs, reviewing a rendered post against Hugo's.

  Ran 1 shell command (ctrl+o to expand)

● I'm nearly matching Hugo's output, with four remaining issues: the post
  header's <hr> ignoring showRule: false, missing share/comments/tags/related
  sections due to unavailable optional params, lingering <fluid-fragment>
  wrappers, and container tags/attributes not matching Hugo's templates. I'll
  start by digging into the <hr> layering issue.

  Ran 1 shell command (ctrl+o to expand)

● Found the bug: flatMergedComputer reverses the entire flattened $layers list,
  which incorrectly flips the internal order within each record too. I'll fix it
  to order records by priority (strongest first) while preserving each record's
  own internal order.

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "FluidIL.js"…)
  ⎿  static: post ["fluid.component","t.h","t.h.post"]
     dynamic: post ["fluid.component","t.h","t.h.post"]
     01:13:32.967:   fq:  All tests concluded: 1805/1805 total passed in 18
     959ms - PASS
  ⎿  Updated src/framework/core/js/FluidIL.js (+8 -4)
      1827              priority: fluid.mergeRecordTypes.subcomponent + (
            count - 1 - i),
      1828              layer: expanded
      1829          }));
      1830 -        const layerNames = [...new Set(contributions.flatMap(
           -({expanded}) => expanded.$layers))];                         
      1830 +        // Strongest contribution first, as for the parents l
           +isted in any $layers                                         
      1831 +        const layerNames = [...new Set([...contributions].rev
           +erse().flatMap(({expanded}) => expanded.$layers))];          
      1832          // TODO: detect injected reference and take direct pa
            th to instantiator
      1833          return fluid.pushPotentia(shadow, memberName, subLaye
            rRecords, layerNames, variables).computer;
      1834      };
     ...
      2491              const allMergeRecords = [...mergeRecords, dynamic
            MergeRecord];
      2492              shadow.mergeRecords = allMergeRecords; // Put thi
            s in early so we can resolve container if there is an error
      2493  
      2493 -            const mergeRecordLayerNames = allMergeRecords.map
           -(mergeRecord => fluid.makeArray(mergeRecord.layer.$layers))  
      2494 -                .flat().filter(name => name);                
      2495 -            const allLayerNames = [...layerNames, ...mergeRec
           -ordLayerNames].reverse();                                    
      2494 +            // The layers named by our merge records, stronge
           +st record first - within each record, as in any $layers      
      2495 +            // list, an earlier layer is stronger than a late
           +r one                                                        
      2496 +            const recordPriority = mergeRecord => mergeRecord
           +.priority ?? fluid.mergeRecordTypes[mergeRecord.mergeRecordTy
           +pe] ?? 0;                                                    
      2497 +            const mergeRecordLayerNames = [...allMergeRecords
           +].sort((a, b) => recordPriority(a) - recordPriority(b))      
      2498 +                .map(mergeRecord => fluid.makeArray(mergeReco
           +rd.layer.$layers)).flat().filter(name => name);              
      2499 +            const allLayerNames = [...mergeRecordLayerNames, 
           +...[...layerNames].reverse()];                               
      2500  
      2501              const [dynamicNames, staticNames] = fluid.partiti
            on(allLayerNames, fluid.isILReference);
      2502  
  ⎿  (timeout 10m)

● All 1805 tests pass. Now I'll implement framework support for <fluid-fragment 
  @id> (rendering a slot's nodes without a wrapper), plus add the missing
  boolean attributes from R16 (defer, async, etc.) needed for the build.

● Bash(cd /mnt/outer-source/gits/fluid-infusion-6/src/framework/core/js &&
      python3 - <<'EOF'
      p = "FluidView.js"…)
  ⎿  OK
  ⎿  Updated src/framework/core/js/FluidView.js (+38 -4)
      1592       * @type {Set<String>}
      1593       */
      1594      fluid.booleanAttrs = new Set(["disabled", "checked", "sel
            ected", "readonly", "required", "hidden", "multiple",
      1595 -        "open", "inert", "autofocus", "novalidate", "indeterm
           -inate"]);                                                    
      1595 +        "open", "inert", "autofocus", "novalidate", "indeterm
           +inate", "defer", "async", "nomodule", "itemscope", "autoplay"
           +,                                                            
      1596 +        "loop", "muted", "playsinline", "controls", "allowful
           +lscreen", "reversed"]);                                      
      1597  
      1598      /**
      1599       * @typedef {Object} LiveStateRecord
     ...
      2478                          vnode.defaultAttrs = {...vnode.defaul
            tAttrs, id: fluid.containerIdPrefix + fluid.composeSegment(sh
            adow.path, idValue)};
      2479  
      2480                          // The template record ensures that t
            he child has a view, rendering into the container supplied
      2480 -                        // here - if the child is a component
           - list, its view renders its members' views in sequence       
      2481 +                        // here - if the child is a component
           + list, its view renders its members' views in sequence. A    
      2482 +                        // <fluid-fragment> slot has no eleme
           +nt - the child's view renders no container of its own, and   
      2483 +                        // its tree is spliced into ours in p
           +lace of the slot by fluid.patchChildren                      
      2484 +                        const isFragment = vnode.tag === flui
           +d.fragmentSlotTag;                                           
      2485                          const viewLayer = fluid.isComponentLi
            stMember(shadow, idValue) ? "fluid.listViewComponent" : "flui
            d.viewComponent";
      2486                          const templateRecord = {
      2487                              mergeRecordType: "template",
     ...
      2490                                  view: {
      2491                                      $component: {
      2492                                          $layers: viewLayer,
      2489 -                                        container: vnode.elem
           -entSignal,                                                   
      2493 +                                        container: isFragment
           + ? fluid.fragmentSlotContainer : vnode.elementSignal,        
      2494                                          parentTemplate
      2495                                      }
      2496                                  }
     ...
      2498                          };
      2499  
      2500                          const childShadow = fluid.pushPotenti
            a(shadow, idValue, [templateRecord]);
      2501 +                        if (isFragment) {                    
      2502 +                            vnode.fragmentOf = childShadow;  
      2503 +                            delete vnode.defaultAttrs;       
      2504 +                        }                                    
      2505                          // Establish dependency on availabili
            ty of child component so we re-render if its availability cha
            nges
      2506                          childShadow.availableInstance.get();
      2507                          return disposable;
     ...
      2618          }
      2619      };
     … 39 more lines (ctrl+o to expand)

● Bash(sed -i 's|    fluid.isTemplateRootTag = tag => tag === "fragment" \|\|
      tag === "template";|    fluid.isTemplateRootTag = tag => tag ===
      "fragment" \|\| tag ===…)
  ⎿  3239:    fluid.isTemplateRootTag = tag => tag === "fragment" || tag ==
     = "template" || tag === fluid.fragmentSlotTag;
  ⎿  Updated src/framework/core/js/FluidView.js (+1 -1)
      3236       * @param {String} tag - The tag
      3237       * @return {Boolean} `true` if it is the tag of a templat
            e's root
      3238       */
      3239 -    fluid.isTemplateRootTag = tag => tag === "fragment" || ta
           -g === "template";                                            
      3239 +    fluid.isTemplateRootTag = tag => tag === "fragment" || ta
           +g === "template" || tag === fluid.fragmentSlotTag;           
      3240  
      3241      /**
      3242       * Compute the vTree for a list of view components by con
            catenating the vTrees rendered by their views

● While the full build runs, I'll fix the port's templates. Checking how Hugo
  lays out the end of a post page:

  Ran 1 shell command (ctrl+o to expand)

● Rewriting ponder-main-single.vue with @if slots. Conditions take whole params
  records, so an absent key no longer makes them unavailable.

  Ran 1 shell command (ctrl+o to expand)
● Now the other templates: pager, list pager, list and home mains, post preview,
  related posts and tags all move to @if, and lists use multi-root members
  where Hugo emits siblings.

  Ran 1 shell command (ctrl+o to expand)

● I've updated the document to render script lists via unwrapped fluid-fragment
  slots and fixed the 404 page to hide its header using a showHeader flag with
  @if, replacing the unsupported header: null approach.

  Ran 1 shell command (ctrl+o to expand)

● I removed marker classes the partial adaptations target, so those selectors
  need updating to @member (the R7 syntax):

  Ran 2 shell commands (ctrl+o to expand)

● The full build is still going on the old code; I'll leave it for its timing.
  Meanwhile, a 20-page build with the new framework and templates:

  Ran 2 shell commands (ctrl+o to expand)

● I'll fix two issues: remove the leftover empty related-posts div, and update
  the meta description logic to skip <style>/<script> content when generating
  the summary. Then I'll move on to performance.

  Ran 1 shell command (ctrl+o to expand)

● The full build has run about 20 minutes. Twenty pages take 27 s, so something
  specific is pathological. I'll stop it and bisect by page range.

  Ran 1 shell command (ctrl+o to expand)

● Background command "Run the full site build" completed (exit code 0)

  Ran 1 shell command (ctrl+o to expand)

● Each third of the site builds in about 20 s, but the whole site takes over 20
  minutes, so some cost scales with the square of the page count or worse.
  Profiling a 40-page build:

  Ran 2 shell commands (ctrl+o to expand)

● Teardown via fluid.destroyComponent(site) accounts for nearly half the runtime
  due to poor scaling in markStale, and since the build doesn't need to destroy
  anything before exiting, I'll remove that call. Next I'll look at the 3.6s
  spent in fluid.removeArrayElement.

  Ran 1 shell command (ctrl+o to expand)

● The hot caller is in FluidSignals, removing fits from fluid.cell.CurrentFits:

  Ran 1 shell command (ctrl+o to expand)

● CurrentFits is an array with linear removal, and endFits walks all of it. With
  thousands of fits open during the build, that's quadratic. Checking all its
  users before changing it to a Set:

  Ran 1 shell command (ctrl+o to expand)

● I'll make it an insertion-ordered Set, which keeps iteration order and makes
  removal constant-time. The test harness reads it too, so it gets the same
  change.

● Bash(python3 - <<'EOF'
      p = "src/framework/core/js/FluidSignals.js"…)
  ⎿  287:    fluid.cell.endFits = function (touchedFits) {
     291:            [...touchedFits].forEach(oneFit => {
     src/framework/core/js/FluidSignals.js:516:            fluid.cell.endFi
     … +3 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidSignals.js (+8 -7)
      219      }, "config"));
      220  
      221      /** @type {Fit[]} Array of all currently active fits */
      222 -    fluid.cell.CurrentFits = [];                              
      222 +    // The fits currently open, in the order they were started
          + - a Set so that ending one is cheap with many open           
      223 +    fluid.cell.CurrentFits = new Set();                       
      224  
      225      fluid.cell.fitId = 0;
      226  
     ...
      249       */
      250      fluid.cell.startFit = () => {
      251          const fit = fluid.cell.makeFit(false);
      251 -        fluid.cell.CurrentFits.push(fit);                     
      252 +        fluid.cell.CurrentFits.add(fit);                      
      253          fluid.cell.idleSignal.set(false);
      254          return fit;
      255      };
     ...
      277              fluid.cell.flushFit(fit, coalesce, true);
      278  
      279              fit.isActive = false;
      279 -            fluid.removeArrayElement(fluid.cell.CurrentFits, f
          -it);                                                          
      280 -            if (fluid.cell.CurrentFits.length === 0) {        
      280 +            fluid.cell.CurrentFits.delete(fit);               
      281 +            if (fluid.cell.CurrentFits.size === 0) {          
      282                  fluid.cell.idleSignal.set(true);
      283              }
      284          }
     ...
      288          const pendingFits = [];
      289          fluid.cell.untracked( () => {
      290              // Iterate over a copy, since endFit removes the f
           it from fluid.cell.CurrentFits, which may be the argument
      290 -            touchedFits.slice().forEach(oneFit => {           
      291 +            [...touchedFits].forEach(oneFit => {              
      292                  const pendingEffects = fluid.cell.filterPendin
           gEffects(oneFit.targetsConsumed);
      293                  if (pendingEffects.length === 0) {
      294                      fluid.cell.endFit(oneFit);
     ...
      1343       * @return {Boolean} `true` if the graph is quiescent
      1344       */
      1345      fluid.cell.isQuiescent = function () {
      1345 -        return fluid.cell.EffectQueue.length === 0 && fluid.c
           -ell.CurrentFits.every(fit => fit.staticFit);                 
      1346 +        return fluid.cell.EffectQueue.length === 0 && [...flu
           +id.cell.CurrentFits].every(fit => fit.staticFit);            
     … 11 more lines (ctrl+o to expand)
  ⎿  Updated tests/test-core/qunit/js/qunit-fluid.js (+1 -1)
      154   */
      155  QUnit.hooks.afterEach(function (assert) {
      156      if (fluid.cell?.isQuiescent && !fluid.cell.isQuiescent()) 
           {
      157 -        const openFits = fluid.cell.CurrentFits.filter(fit => 
          -!fit.staticFit).map(fit => fit.fitId);                        
      157 +        const openFits = [...fluid.cell.CurrentFits].filter(fi
          +t => !fit.staticFit).map(fit => fit.fitId);                   
      158          assert.pushResult({
      159              result: false,
      160              actual: {openFits, queuedEffects: fluid.cell.Effec
           tQueue.map(effect => effect.name)},

● Dropping the final destroy from the build, then rerunning the tests and the
  40-page profile.

  Ran 1 shell command (ctrl+o to expand)

● From 56 s to 26 s for 40 pages, and the rebuild rewrote only 3 changed files.
  fluid.isPlainObject is now the top self-time:

  Ran 1 shell command (ctrl+o to expand)

● Most calls come from fluid.mergeLayers, which re-tests every layer for every
  key. Hoisting that test out of the key loop:

● Bash(python3 - <<'EOF'
      p = "Fluid.js"…)
  ⎿  ok
  ⎿  Updated src/framework/core/js/Fluid.js (+6 -2)
      2180       */
      2181      fluid.mergeLayers = function (target, segs, layerMap, lay
            ers, mergeRecords) {
      2182          const clayers = layers.length;
      2183 +        // Test each layer once, rather than once for each of
           + the keys merged from it                                     
      2184 +        const plainLayers = layers.map(layer => fluid.isPlain
           +Object(layer));                                              
      2185  
      2186          const allKeysRec = {};
      2187          layers.forEach(layer => {
     ...
      2196              let count = 0;
      2197              let last, newTarget;
      2198              let lastIndex = -1;
      2199 +            let holdsComponent = false;                      
      2200              for (let i = 0; i < clayers; ++i) {
      2201                  const layer = layers[i];
      2199 -                if (fluid.isPlainObject(layer) && key in laye
           -r) {                                                         
      2202 +                if (plainLayers[i] && key in layer) {        
      2203                      ++count;
      2204                      last = layer[key];
      2205                      lastIndex = i;
      2206 +                    holdsComponent = holdsComponent || fluid.
           +isComponentRecordHolder(last);                               
      2207                  }
      2208              }
      2205 -            if (layers.some(layer => fluid.isPlainObject(laye
           -r) && fluid.isComponentRecordHolder(layer[key]))) {          
      2209 +            if (holdsComponent) {                            
      2210                  newTarget = fluid.collectComponentRecords(lay
            ers, key, segs, mergeRecords);
      2211              } else if (count > 1 && fluid.isPlainObject(last,
             true)) {
      2212                  newTarget = fluid.makeLayer(key, target);

● The change is equivalent to the original. Running the tests and then the full
  build:

  Ran 1 shell command (ctrl+o to expand)

● The whole site now builds: 59 pages in 39 s, down from over 20 minutes. The
  repo has a link checker (checklinks.js), so I'll run it against the new
  output.

  Ran 1 shell command (ctrl+o to expand)

● It also fetches external links, which is slow and needs the network. A quick
  local check instead: compare the set of pages with Hugo's, and confirm every
  local href/src resolves.

  Ran 1 shell command (ctrl+o to expand)

● Found three gaps versus Hugo's output (apostrophe stripping in slugs, page/1/
  alias redirects, missing index.xml) plus a wrong favicon path and
  unrelativised island URLs caused by the URL rewrite running before islands
  render. I'll fix the rewrite timing with a proper "before write" hook,
  starting by checking how Hugo generates head URLs.

  Ran 1 shell command (ctrl+o to expand)
● I noticed Hugo outputs absolute URLs for the favicon, og:image, and RSS link,
  so I'll fix the head template and add a writeDocumentsWhenSettled(records, 
  prepare) hook to the framework, where prepare runs on each document right
  before serialization.

● Bash(python3 - <<'EOF'
      p = "src/framework/server/server-support.js"…)
  ⎿  275:        } else if (prepare?.(record), fluid.writeDocument(record.f
     ilename, record.dokkument)) {
  ⎿  Updated src/framework/server/server-support.js (+9 -4)
      254   * are complete. Each document which is then ready is written 
           unless its file is already up to date - see
      255   * `fluid.writeDocument` - and a document which is not ready i
           s not written, without affecting the others.
      256   * @param {DocumentWriteRecord[]} records - The documents to b
           e written, and their files
      257 + * @param {Function} [prepare] - A function receiving each rec
          +ord whose document is ready, just before the document is      
      258 + * serialised, e.g. to strip material not wanted in a static b
          +uild. Since the document is then a rendered one, any          
      259 + * change made to it is overwritten should what rendered it ch
          +ange.                                                         
      260   * @return {Promise<DocumentWriteOutcome>} A promise for the o
           utcome of writing each document
      261   */
      259 -fluid.writeDocumentsWhenSettled = async function (records) {  
      262 +fluid.writeDocumentsWhenSettled = async function (records, pre
          +pare) {                                                       
      263      const readies = records.map(record => fluid.documentReady(
           record.dokkument));
      264      // A free effect watching readiness is pending whilst any 
           document is, and so holds the fit open until then
      265      const readyWatcher = fluid.cell.effect((...readiness) => r
           eadiness.find(fluid.isUnavailable) ?? true, readies,
     ...
      272          const readiness = readies[i].get();
      273          if (fluid.isUnavailable(readiness)) {
      274              outcome.unready.push({...record, readiness});
      272 -        } else if (fluid.writeDocument(record.filename, record
          -.dokkument)) {                                                
      275 +        } else if (prepare?.(record), fluid.writeDocument(reco
          +rd.filename, record.dokkument)) {                             
      276              outcome.written.push(record);
      277          } else {
      278              outcome.unchanged.push(record);
     ...
      304   * graph is settled first so that all the documents which rend
           ering creates have been created.
      305   * @param {Function} [filenameFor] - A function receiving an `
           OutputDocumentRecord` and returning the file to which
      306   * its document is written - by default, the file at its locat
           ion
      307 + * @param {Function} [prepare] - A function receiving each rec
          +ord whose document is ready, just before it is                
      308 + * serialised - see `fluid.writeDocumentsWhenSettled`         
      309   * @return {Promise<DocumentWriteOutcome>} A promise for the o
           utcome of writing each document
      310   */
      306 -fluid.writeOutputDocumentsWhenSettled = async function (filena
          -meFor = record => fileURLToPath(record.url)) {                
      311 +fluid.writeOutputDocumentsWhenSettled = async function (filena
          +meFor = record => fileURLToPath(record.url), prepare) {       
      312      await fluid.cell.settle();
      313      const records = fluid.outputDocuments.get().map(record => 
           ({...record, filename: filenameFor(record)}));
      309 -    return fluid.writeDocumentsWhenSettled(records);          
      314 +    return fluid.writeDocumentsWhenSettled(records, prepare); 
      315  };
      316  
      317  fluid.activateDocument = function (dokkument) {

● That comma-operator condition is too clever. Restructuring it:

  Ran 1 shell command (ctrl+o to expand)

● Update(src/framework/server/server-support.js)
  ⎿  Added 5 lines, removed 3 lines
      272          const readiness = readies[i].get();
      273          if (fluid.isUnavailable(readiness)) {
      274              outcome.unready.push({...record, readiness});
      275 -        } else if (prepare?.(record), fluid.writeDocument(reco
          -rd.filename, record.dokkument)) {                             
      276 -            outcome.written.push(record);                     
      275          } else {
      278 -            outcome.unchanged.push(record);                   
      276 +            if (prepare) {                                    
      277 +                prepare(record);                              
      278 +            }                                                 
      279 +            const written = fluid.writeDocument(record.filenam
          +e, record.dokkument);                                         
      280 +            (written ? outcome.written : outcome.unchanged).pu
          +sh(record);                                                   
      281          }
      282      });
      283      return outcome;

● Now the port. Checking Hugo's alias page markup:

  Ran 1 shell command (ctrl+o to expand)

● I'll generate aliases via a new ponder.alias component list rendering each
  into its own document, and handle feeds/sitemap as plain JS in a new feeds.js
  since they're non-HTML and outside the view layer—applying Hugo-style
  sanitisation to URL path segments.

  Ran 2 shell commands (ctrl+o to expand)

● Simplifying feed membership by recording every listed page on the paginator:

  Ran 1 shell command (ctrl+o to expand)

● Hugo's feeds include undated pages too (its home feed has 46 items), so I'll
  include them without a pubDate:

  Ran 1 shell command (ctrl+o to expand)

● Found 46 items, matching Hugo's count. Next I'll update buildSite.js to pass
  aliases into the site, write feeds, relativize URLs via the new prepare hook,
  and strip inert SFC script records and fluid-client markers by default for
  static builds (keeping them with --live true).

  Ran 1 shell command (ctrl+o to expand)

● Two issues remain: a stale file lingers since the build doesn't clean old
  output, and hugo-easy-gallery.css is missing. I'll check where Hugo sources
  that stylesheet from.

  Ran 1 shell command (ctrl+o to expand)

● The CSS link in the figure template points to a missing file, so I'll remove
  it. I also found that content relies on goldmark features Hugo
  supports—footnotes, smart quotes, linkify, and heading ids—so I'll add a
  footnote plugin, typographer/linkify, and Hugo-style heading id generation.

  Ran 2 shell commands (ctrl+o to expand)

● Footnotes work. But only one heading id came out on the page that should have
  reactivity-and-glitches. Checking the source:

  Ran 1 shell command (ctrl+o to expand)

● That heading is an <h4>, so my check simply didn't look for it; the ids are
  correct. Adding pruning of stale .html output, then a fresh build and
  comparison:

  Ran 1 shell command (ctrl+o to expand)

● Page counts now match Hugo at 69 pages each, and the remaining broken links
  are pre-existing issues in a static file that's broken in Hugo's output too.
  Next I'll check the other page kinds: home previews, section list, the
  taxonomy page, and the 404.

  Ran 1 shell command (ctrl+o to expand)

● I'll systematically compare each page's element structure (tags and classes)
  against Hugo's output to pinpoint the exact divergences.

  Ran 1 shell command (ctrl+o to expand)

● The diff is noisy, but one figure stands out: the post has 514 elements in
  Hugo's output and 190 in ours. That's probably syntax highlighting markup.
  Checking a code block:

  Ran 1 shell command (ctrl+o to expand)

● I'll leave server-side syntax highlighting as a known gap since our output
  relies on browser-side highlight.js instead of Hugo's chroma, but I'll strip
  the fence-option junk attributes markdown-it-attrs is adding to <pre> tags.
  Next I'll look into the navbar difference.

  Ran 1 shell command (ctrl+o to expand)

● Our navbar matches except for order. Hugo breaks weight ties by name, so About
  comes before Docs. Fixing that and stripping the fence options. Then the post
  preview markup:

  Ran 1 shell command (ctrl+o to expand)

● Found two differences: Hugo's summaries end at the sentence containing the
  70th word, and its preview omits the wrapper around the summary. I'll match
  the summary rule, but keep the wrapper since it's the content component's
  container.

  Ran 1 shell command (ctrl+o to expand)

● Those summaries now match Hugo's exactly. Checking two more things: the @{
  code samples in the Fluid View docs page (R2's motivating case), and a
  standalone page's header and "last modified" line.

  Ran 1 shell command (ctrl+o to expand)

● The Fluid View and about pages both check out fine, so now I'll write tests
  covering the framework changes from this build: the layer-precedence fix,
  <fluid-fragment> slots, multi-root list splicing, top-level SFC block
  restriction, and the writer's prepare hook.
● Bash(cat >> tests/framework-tests/core/js/FluidILTests.js <<'EOF'…)
  ⎿  01:31:31.219:   fq:  All tests concluded: 295/295 total passed in 1481
     ms - PASS
     01:31:35.176:   fq:  FAIL: Module "Fluid View Tests" Test name "Fragme
     … +9 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidILTests.js (+39 -0)
      2273      assert.equal(other.docB.header.kind, "plain", "Header out
            side scope unaffected by destruction of linkage");
      2274      other.destroy();
      2275  });
      2276 +                                                             
      2277 +fluid.def("fluid.tests.precedence.base", {                   
      2278 +    $layers: "fluid.component",                              
      2279 +    kind: "base"                                             
      2280 +});                                                          
      2281 +                                                             
      2282 +fluid.def("fluid.tests.precedence.post", {                   
      2283 +    kind: "post"                                             
      2284 +});                                                          
      2285 +                                                             
      2286 +fluid.def("fluid.tests.precedence.doc", {                    
      2287 +    $layers: "fluid.component",                              
      2288 +    header: {                                                
      2289 +        $component: {                                        
      2290 +            $layers: "fluid.tests.precedence.base"           
      2291 +        }                                                    
      2292 +    }                                                        
      2293 +});                                                          
      2294 +                                                             
      2295 +fluid.def("fluid.tests.precedence.type", {                   
      2296 +    header: {                                                
      2297 +        $component: {                                        
      2298 +            $layers: ["fluid.tests.precedence.post", "fluid.t
           +ests.precedence.base"]                                       
      2299 +        }                                                    
      2300 +    }                                                        
      2301 +});                                                          
      2302 +                                                             
      2303 +fluid.def("fluid.tests.precedence.typedDoc", {               
      2304 +    $layers: ["fluid.tests.precedence.type", "fluid.tests.pre
           +cedence.doc"]                                                
      2305 +});                                                          
      2306 +                                                             
      2307 +QUnit.test("Layers named by a stronger subcomponent record ar
           +e stronger, in the order it lists them", function (assert) { 
      2308 +    const that = fluid.tests.precedence.typedDoc();          
      2309 +    fluid.cell.stabilize();                                  
      2310 +    assert.equal(that.header.kind, "post", "Layer listed firs
           +t by the stronger record wins");                             
      2311 +    assert.deepEqual(that.header.$layers, ["fluid.component",
           + "fluid.tests.precedence.base", "fluid.tests.precedence.post"
           +],                                                           
      2312 +        "Layers ordered weakest first");                     
     … 2 more lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+81 -0)
      1549      assert.deepEqual([...holder.querySelectorAll("script")].m
            ap(fluid.classifyScriptNode),
      1550          ["framework", "injection", "injection", "client", "pa
            ge"], "Each script classified");
      1551  });
      1552 +                                                             
      1553 +fluid.def("fluid.tests.fragmentSlots", {                     
      1554 +    $layers: "fluid.component",                              
      1555 +    links: ["a.css", "b.css"],                               
      1556 +    tags: ["x", "y"],                                        
      1557 +    view: {                                                  
      1558 +        $component: {                                        
      1559 +            $layers: "fluid.templateViewComponent",          
      1560 +            template: `<div><span class="first">First</span><
           +fluid-fragment @id="linkTags"></fluid-fragment><fluid-fragmen
           +t @id="single"></fluid-fragment><p @id="tagLinks" class="tags
           +"></p><span class="last">Last</span></div>`                  
      1561 +        }                                                    
      1562 +    },                                                       
      1563 +    linkTags: {                                              
      1564 +        $component: {                                        
      1565 +            $layers: "fluid.component",                      
      1566 +            $for: {                                          
      1567 +                source: "{fragmentSlots}.links",             
      1568 +                valueAs: "link"                              
      1569 +            },                                               
      1570 +            view: {                                          
      1571 +                $component: {                                
      1572 +                    $layers: "fluid.templateViewComponent",  
      1573 +                    template: `<link rel="stylesheet" href="@
           +{link}">`                                                    
      1574 +                }                                            
      1575 +            }                                                
      1576 +        }                                                    
      1577 +    },                                                       
      1578 +    single: {                                                
      1579 +        $component: {                                        
      1580 +            $layers: "fluid.component",                      
      1581 +            view: {                                          
      1582 +                $component: {                                
      1583 +                    $layers: "fluid.templateViewComponent",  
      1584 +                    elideParent: false,                      
      1585 +                    template: `<em>one</em><em>two</em>`     
      1586 +                }                                            
      1587 +            }                                                
      1588 +        }                                                    
     … 44 more lines (ctrl+o to expand)
  ⎿  (timeout 10m)

● The only failure is my expectation about how a non-breaking space serialises.
  Comparing text content instead:

  Ran 1 shell command (ctrl+o to expand)

● My replacement didn't match the file. Looking at the exact text:

  Searched for 1 pattern, read 1 file (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "tests/framework-tests/core/js/FluidViewTests.js"…)
  ⎿      assert.deepEqual([fluid.tests.childSummary(qs(".tags", container))
     , qs(".tags", container).textContent], [["a", "a"], "x\u00a0y\u00a0"],
             "Both top-level nodes of each list member rendered, without wr
     … +4 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+2 -2)
      1613      assert.deepEqual(fluid.tests.childSummary(container), ["s
            pan.first", "link", "link", "em", "em", "p.tags", "span.last"
            ],
      1614          "Members of a list and nodes of a child rendered in p
            lace of their fragment slots");
      1615      assert.deepEqual(qsa("link", container).map(link => link.
            getAttribute("href")), ["a.css", "b.css"], "List members rend
            ered");
      1616 -    assert.equal(qs(".tags", container).innerHTML.replace(/ i
           -d="[^"]*"/g, ""), `<a href="/tags/x/">x</a>&nbsp;<a href="/ta
           -gs/y/">y</a>&nbsp;`                                          
      1617 -        .replace(/&nbsp;/g, " "), "Both top-level nodes of ea
           -ch list member rendered, without wrapping elements");        
      1616 +    assert.deepEqual([fluid.tests.childSummary(qs(".tags", co
           +ntainer)), qs(".tags", container).textContent], [["a", "a"], 
           +"x\u00a0y\u00a0"],                                           
      1617 +        "Both top-level nodes of each list member rendered, w
           +ithout wrapping elements");                                  
      1618  
      1619      that.links = ["c.css"];
      1620      fluid.cell.stabilize();
  ⎿  (timeout 10m)

● All 1815 pass. Now linting the port's JavaScript and syntax-checking every SFC
  script:

  Ran 1 shell command (ctrl+o to expand)

● --no-bin-links means there's no eslint shim, so I'll call it directly:

  Ran 1 shell command (ctrl+o to expand)

● Lint is clean. Two final runs: a second static build, to confirm a no-change
  rebuild writes nothing, and a --live true build into a scratch directory.

  Ran 1 shell command (ctrl+o to expand)

● Confirmed the rebuild changes nothing (66 unchanged), with the live build
  retaining 15 inert SFC records versus none in the static build, and output
  size matching Hugo's. Now I'll clean up the port's stale PROPOSED comments.

  Ran 1 shell command (ctrl+o to expand)

● Most of these are resolved now. The R8 one means switching the port to $for's
  native priority ordering, which runs higher-first, and dropping byPriority.
  Checking where priorities are used:

  Ran 1 shell command (ctrl+o to expand)

● I'll negate the scale (1000 - p) so the order is unchanged, point the $fors
  straight at the keyed records, and have the navbar use the framework's
  fluid.orderKeyedRecords for its extra items.

  Ran 1 shell command (ctrl+o to expand)

● I'll update ponder-scriptTag.vue to add the fluid-client marker and remove the
  defer note since it now renders as a proper boolean attribute, then rebuild
  and diff against a current output copy to confirm no differences.

  Ran 1 shell command (ctrl+o to expand)

● The only change is that asset element ids now use record keys like
  stylesheetTags.katex instead of .0, with ordering unchanged. Next I'll add an
  npm script and document the build in the port's README and REQUIREMENTS.md.

  Ran 2 shell commands (ctrl+o to expand)

● I'll keep the holder components since they usefully group each feature's
  linkages, just rewording the comment, then add a section to REQUIREMENTS.md
  documenting the framework changes this build required.

  Ran 1 shell command (ctrl+o to expand)

● ponder-infusion now builds the whole site: npm run build-infusion writes all
  69 pages to docs-infusion/ in about 35 seconds. It produces the same pages and
  URLs as Hugo's docs/, plus the RSS feeds, the sitemap and the page/1/
  redirects. Every local link resolves except four inside a static file that is
  copied as-is and is just as broken in Hugo's output. A rebuild with nothing
  changed rewrites no files. All Infusion tests pass (1815/1815, plus both
  server tests), and lint is clean in both repos.

  How it uses the new features
  - Each page is a member of one component tree and renders into its own
    document (R1).
  - Markdown content renders verbatim, so the 28 @{ code samples in the Fluid
    View docs survive. The figure and stabilization shortcodes became component
    islands within it (R2).
  - Optional parts of the page (subtitle, rule, tags, share links, pagers,
    related posts, comments, 404 header) use @if, so absent ones leave no empty
    element (R4).
  - Hugo's layout lookup uses fluid.definedLayers (R5). The partials target
    @navbar and last: .ponder-title (R7). Asset lists use $for's native priority
    ordering instead of the port's own sorting (R8).
  - Link slugs use calls in templates (R10). Footer scripts are marked as
    client-only, and the static build strips that marker along with the
    non-running SFC script records; --live true keeps both (R11).

  Framework changes the build forced
  - Layer precedence: when a stronger $component record listed
    ["ponder.header.post", "ponder.header"], ponder.header came out strongest,
    because the order within each record was reversed. Posts showed a rule they
    shouldn't have.
  - SFC blocks: a <script> inside an SFC's <template> was treated as the SFC's
    own script. A template script with src="@{script.src}" actually got fetched.
  - Wrapper elements: the <fragment>/<template> wrappers on list items that I
    documented under R3 are fixed. I also added <fluid-fragment @id> slots,
    which render with no wrapper element, needed for the <head> lists.
  - Boolean attributes: defer, async, itemscope and similar now render properly
    (part of R16).
  - Writer hook: documents can be adjusted just before they're written. The URL
    rewrite needs it, because islands finish rendering after the earlier point.
  - Speed: the first full build ran over 20 minutes before I stopped it.
    Profiling found three causes:
    - the signals library held its open transactions in an array and scanned it
      quadratically (now a Set);
    - every layer merge re-tested each layer once per key;
    - tearing down the whole tree at the end took about half the time, so the
      build no longer does that.

  Port changes beyond the templates
  - The content pipeline needed fixes for Node 18 and for parity with Hugo's
    markdown renderer: footnotes, smart quotes, heading ids (content links
    depend on them), Hugo's URL sanitisation, and its whole-sentence summaries.
  - New pieces: feeds.js for RSS and the sitemap, ponder-alias.vue for the
    redirects, copying of the theme's static files, and removal of stale pages.

  Known differences from Hugo, also listed in the port's README:
  - Code is highlighted in the browser by highlight.js rather than on the
    server, so there are no line numbers.
  - Some extra wrappers and ids remain, such as the <div> around content and the
    fl-id- ids.
  - The SEO partials and the home page's avatar image processing aren't ported.

  I added five packages to ponder-infusion's package.json: smol-toml, yaml,
  markdown-it and two of its plugins, all pinned to versions at least two weeks
  old. The README now covers building, and REQUIREMENTS.md has a new section on
  the framework changes. Nothing is committed in either repo, and docs-infusion/
  is new output.

✻ Brewed for 52m 41s · done 1:39
  ⎿  Referenced file tests/framework-tests/core/js/FluidViewTests.js
  ⎿  Referenced file src/framework/server/server-support.js
  ⎿  Referenced file src/framework/core/js/FluidView.js
  ⎿  Read ../ponder-infusion/infusion/js/buildSite.js (170 lines)
  ⎿  Referenced file src/framework/core/js/Fluid.js

● Compacted while idle, before the prompt cache expired · turn off with 
  "idleCompaction": false in settings.json

❯ Downport this build to node 16.6.2                                            

  Listed 1 directory, ran 3 shell commands, searched memories (ctrl+o to expand)

● Node 16.6.2 fails in smol-toml, which requires Node 18. Next I'm checking
  which version of it still supports Node 16.
  Ran 1 shell command (ctrl+o to expand)

● Every smol-toml version declares Node ≥ 18. Next I'll check whether
  Object.hasOwn is the only Node 18 API it actually uses.

  Ran 1 shell command (ctrl+o to expand)

● Object.hasOwn is the only Node 18 API it uses, so a guarded polyfill will do.
  The port itself has two problems: fs.cpSync (added in 16.7) and an
  Object.groupBy call.

  Ran 1 shell command (ctrl+o to expand)

● Updating siteModel.js and buildSite.js:

● Update(/mnt/outer-source/gits/ponder-infusion/infusion/js/siteModel.js)
  ⎿  File must be read first

● Update(/mnt/outer-source/gits/ponder-infusion/infusion/js/buildSite.js)
  ⎿  Added 18 lines
       89  };
       90  
       91  /**
       92 + * Copy a directory's contents into another, recursively, over
          +writing files of the same name - `fs.cpSync`, which node      
       93 + * 16.6 lacks                                                 
       94 + * @param {String} source - The directory to copy from        
       95 + * @param {String} target - The directory to copy into, create
          +d if absent                                                   
       96 + */                                                           
       97 +const copyDir = function (source, target) {                   
       98 +    fs.mkdirSync(target, {recursive: true});                  
       99 +    fs.readdirSync(source, {withFileTypes: true}).forEach(entr
          +y => {                                                        
      100 +        const from = path.join(source, entry.name), to = path.
          +join(target, entry.name);                                     
      101 +        if (entry.isDirectory()) {                            
      102 +            copyDir(from, to);                                
      103 +        } else {                                              
      104 +            fs.copyFileSync(from, to);                        
      105 +        }                                                     
      106 +    });                                                       
      107 +};                                                            
      108 +                                                              
      109 +/**                                                           
      110   * Remove HTML files left in the publish directory by an earli
           er build which this build neither wrote nor copied, e.g.
      111   * the page of a content file since renamed
      112   * @param {String[]} staticDirs - The static directories copie
           d into the publish directory

● Update(/mnt/outer-source/gits/ponder-infusion/infusion/js/buildSite.js)
  ⎿  Added 1 line, removed 1 line
      130  
      131      // Hugo's static files - the theme's, overlaid by the site
           's
      132      const staticDirs = [path.join(siteDir, "themes/beautifulhu
           go/static"), path.join(siteDir, "static")];
      133 -    staticDirs.forEach(dir => fs.cpSync(dir, outDir, {recursiv
          -e: true}));                                                   
      133 +    staticDirs.forEach(dir => copyDir(dir, outDir));          
      134  
      135      // The creator functions of the layers live in Infusion's 
           V8 context rather than node's global
      136      const site = fluid.initFreeComponent("ponder.site", {

  Read 1 file (ctrl+o to expand)

● Update(/mnt/outer-source/gits/ponder-infusion/infusion/js/siteModel.js)
  ⎿  Added 6 lines
       8  
       9  const fs = require("fs"),
      10      path = require("path");
      11 +                                                               
      12 +// smol-toml declares node >= 18, but of node 18's additions us
         +es only Object.hasOwn, which node 16.6 lacks                   
      13 +if (!Object.hasOwn) {                                          
      14 +    Object.hasOwn = (object, key) => Object.prototype.hasOwnPro
         +perty.call(object, key);                                       
      15 +}                                                              
      16 +                                                               
      17  const toml = require("smol-toml"),
      18      yaml = require("yaml"),
      19      markdownIt = require("markdown-it"),

● Background command "Read Node 16 memory and look for a Node 16 binary"
completed (exit code 0)

  Ran 1 shell command (ctrl+o to expand)

● It builds under Node 16.6.2. Comparing the output with the Node 18 build:

  Ran 3 shell commands (ctrl+o to expand)

● Adding a note to the README:

  Ran 3 shell commands (ctrl+o to expand)

● The ponder-infusion build now runs on Node 16.6.2. I downloaded that version
  into the scratchpad and ran the build with it: all 66 pages wrote in about 32
  seconds, byte-identical to the Node 18 output in docs-infusion/. The --live 
  true build also runs, and lint is clean.

  Only three things stopped it from running on Node 16:

  - smol-toml calls Object.hasOwn, which Node 16.6 doesn't have. Every published
    version of the package says it needs Node 18, but that call is the only
    Node 18 feature it uses. infusion/js/siteModel.js now adds a fallback for
    Object.hasOwn when it's missing, before loading the package. npm will print
    a version-mismatch warning when installing under Node 16; it's harmless. If
    you'd rather not patch a built-in object, the alternative is swapping in a
    different TOML parser that supports Node 16.
  - fs.cpSync was added in Node 16.7. infusion/js/buildSite.js now copies the
    static folders with a small recursive copyDir instead.
  - Object.groupBy was already handled by the port's own groupBy helper.

  My Infusion changes from the last round needed nothing for Node 16. I added a
  short note on the Node version to infusion/README.md.

  One leftover: there's an empty folder,
  docs-infusion/wip/2025-09-26-this-week's-reactive-chats, from an early build
  that used the old URL format. The stale-page cleanup removes old files but not
  empty folders, so you can delete this one by hand.

  Nothing is committed.

✻ Sautéed for 6m 48s · done 9:23

❯ Assess how much of the outputDocument support is reasonable to move into      
  FluidView-node.js given it seems impossible for it to execute on the client   
  which will observe at most one document at a time                             

  Listed 1 directory, ran 4 shell commands (ctrl+o to expand)

● I've reviewed FluidView.js and how client/server builds load files. Next I'll
  check what the server's V8 context can access, to determine where
  node-specific code can live.

  Ran 1 shell command (ctrl+o to expand)

● About 175 lines of the output-document support can move from FluidView.js into
  FluidView-node.js: everything that creates documents and writes into them. A
  handful of small checks inside FluidView.js should stay in core, as hooks with
  trivial client defaults. I haven't changed any code; this is an assessment
  only.

  Your premise is mostly right, with one qualification. It isn't strictly
  impossible on the client. The browser version of fluid.parseOutputDocument
  uses DOMParser, and the existing test "One component tree rendering many
  output documents" in FluidViewTests.js is written to pass in Chrome as well as
  under linkedom. A browser authoring tool could use it to export a static site
  or preview pages it isn't showing. But nothing does that today, and nothing
  needs the cost in the client bundle. The stronger argument is what a client
  should do when it finds the fluid.outputDocumentView layer: it should render
  into the one document it has, not create a new one. So the client needs a
  different definition of that layer, not just a missing one.

  Can move to FluidView-node.js (now FluidView.js lines 1224–1370 and
  2815–2830):

  - The document registry: the OutputDocumentRecord type, fluid.outputDocuments,
    fluid.outputDocumentRecords, fluid.outputDocumentMarkup,
    fluid.createOutputDocument and fluid.releaseOutputDocument.
  - fluid.parseOutputDocument and fluid.resolveOutputLocation. Their browser
    versions would be deleted. server-support.js currently overrides both, and
    those overrides become the only versions. They can stay in
    server-support.js, or move into the node file, since the server's V8 context
    does provide require and path.
  - fluid.subscribeOutputDocumentInjections, fluid.applyOutputScriptInjection
    and fluid.outputScriptInjectionStyles.
  - The fluid.outputDocumentView definition itself.

  Must stay in core, as hooks:

  - fluid.isOutputDocument is checked in three core places: the sourceURL
    comment on injected CSS, the choice of script injection styles in
    subscribeDocToInjections, and ensureImportsLoaded. Core can keep a version
    that always returns false, which the node file overrides. A cleaner seam
    would be one hook, fluid.scriptInjectionStylesFor(dokkument), plus an "is
    this document for publishing" check.
  - fluid.documentLocation is used in about five core places (CSS link
    resolution, fluid.toAbsoluteUrl, the names of some cells). Core keeps
    dokkument => dokkument.location, and the node file overrides it to consult
    the registry.
  - The subscribeOutputDocumentInjections call in fluid.renderView should come
    out of core altogether. The node version of fluid.outputDocumentView would
    subscribe through an $effect of its own on {self}.outputDocument. I haven't
    checked whether that changes when the injection-in-progress notice is
    registered relative to the first render; writeOutputDocumentsWhenSettled
    relies on it to wait for each document. The output-documents-test.js and
    ponder builds should confirm it.
  - fluid.inertScriptType and fluid.classifyScriptNode stay as they are. The
    client needs them to recognise the inert script records and make a page live
    again (R11). The ponder build's static strip uses them too.

  The client needs its own fluid.outputDocumentView, or a ponder page built with
  --live can't be hydrated, because ponder.document names that layer. The
  client version would be a few lines: the container is document.documentElement
  when documentLocation matches the current page, and is unavailable otherwise.
  That is your "at most one document" stated as code, and it lets the same SFCs
  run in both places.

  Costs:
  - The test "One component tree rendering many output documents" would need to
    become server-only, either in output-documents-test.js or behind a node-only
    guard in FluidViewTests.js. It then needs a client counterpart that checks
    the client layer renders into the host document.
  - Files loaded from the server import list in package.json run before
    server-support.js. Anything in FluidView-node.js that uses functions
    server-support.js defines must call them at use time, not copy them at load
    time. The existing fluid.parseDOM = fluid.serverDocumentParser; line in
    FluidView-node.js already breaks this rule: it is always undefined. It's
    marked as disused, so nothing fails.

  Recommendation: worth doing. About 175 lines leave the client bundle, and core
  keeps three small hooks plus a short client layer that's needed anyway for
  hydration. Do it together with the R11 work on making pages live again, since
  the client layer is part of that.

✻ Baked for 1m 17s · done 9:45

❯ go ahead and do the move as recommended                                       

  Listed 1 directory, ran 2 shell commands (ctrl+o to expand)

● I'm proceeding with the move, but revising my plan: since fluid.renderView
  subscribes all view renderings—including island views like the SFC widget in
  output-documents-test.js—into the output document, I'll keep the hook call in
  renderView and have core default it to a no-op instead of dropping it.

  Ran 3 shell commands (ctrl+o to expand)

● Bash(S=/tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-97d2-
      445d-8bfc-4f99019ddb5a/scratchpad && python3 - <<EOF
      p="src/framework/core/js/FluidView…)
  ⎿  1224:@@HOOKS@@
     167 /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-
     97d2-445d-8bfc-4f99019ddb5a/scratchpad/cut.js
  ⎿  Updated src/framework/core/js/FluidView.js (+1 -166)
      1221          }
      1222      };
      1223  
      1224 -    /**                                                      
      1225 -     * @typedef {Object} OutputDocumentRecord                
      1226 -     * @property {Document} dokkument - A document created by
           - `fluid.createOutputDocument`                                
      1227 -     * @property {String} location - The location at which th
           -e document is to be written, as supplied on creation         
      1228 -     * @property {URL} url - The location resolved to an abso
           -lute URL, against which the document's relative URLs resolve 
      1229 -     */                                                      
      1224 +@@HOOKS@@                                                    
      1225  
      1231 -    // Documents created by fluid.createOutputDocument, which
           - views render into without executing any script in them -    
      1232 -    // e.g. the pages of a site rendered as one component tre
           -e. Held as a cell so that a writer may enumerate them, in    
      1233 -    // order of creation                                     
      1234 -    /** @type {Cell<OutputDocumentRecord[]>} */              
      1235 -    fluid.outputDocuments = fluid.cell([], {name: "Fluid outp
           -ut documents"});                                             
      1236 -                                                             
      1237 -    /** @type {WeakMap<Document, OutputDocumentRecord>} */   
      1238 -    fluid.outputDocumentRecords = new WeakMap();             
      1239 -                                                             
      1240 -    // The markup from which an output document is created   
      1241 -    fluid.outputDocumentMarkup = "<!DOCTYPE html><html><head>
           -</head><body></body></html>";                                
      1242 -                                                             
      1243 -    /**                                                      
      1244 -     * Parse markup into a fresh document which has no browsi
           -ng context, and so in which no script executes. Overridden   
      1245 -     * on the server in server-support.js                    
      1246 -     * @param {String} markup - The markup of the document   
      1247 -     * @return {Document} The parsed document                
      1248 -     */                                                      
      1249 -    fluid.parseOutputDocument = function (markup) {          
      1250 -        return new DOMParser().parseFromString(markup, "text/
           -html");                                                      
      1251 -    };                                                       
      1252 -                                                             
      1253 -    /**                                                      
      1254 -     * Resolve the location of an output document to an absol
           -ute URL. Overridden on the server in server-support.js to    
      1255 -     * resolve file paths                                    
      1256 -     * @param {String} location - The location               
      1257 -     * @return {URL} The location as an absolute URL         
      1258 -     */                                                      
      1259 -    fluid.resolveOutputLocation = function (location) {      
     … 140 more lines (ctrl+o to expand)

● Now adding the core hooks in their place:

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/FluidView.js"…)
  ⎿  src/framework/core/js/FluidView.js:480:     * @property {InjectionStyl
     e} injStyle - The injection style object - a member of fluid.xxxxInjec
     tionStyles
     … +5 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView.js (+57 -2)
      456                  node.hasAttribute("fluid-client") ? "client" :
            "page";
      457      };
      458  
      459 +    // The type borne by inert records of the scripts of Singl
          +e File Components injected into output documents, which       
      460 +    // a client recognises so that it may make the document li
          +ve again                                                      
      461 +    fluid.inertScriptType = "text/x-fluid-layer";             
      462 +                                                              
      463      fluid.clearInjRec = function (dokkument, nodeId) {
      464          dokkument.getElementById(nodeId)?.remove();
      465      };
     ...
      1172              const newDocEffect = fluid.cell.effect(async func
            tion docInjectEffect(injRecs) {
      1173                  try {
      1174                      /** @type {DocInjectionRecord[]} */
      1171 -                    const scriptStyles = fluid.isOutputDocume
           -nt(dokkument) ? fluid.outputScriptInjectionStyles : fluid.scr
           -iptInjectionStyles;                                          
      1175 +                    const scriptStyles = fluid.scriptInjectio
           +nStylesFor(dokkument);                                       
      1176                      const docInjRecs = Object.values(injRecs)
            .map(injRec =>
      1177                          fluid.decodeInjectSFCElement(dokkumen
            t, injRec, rec.url, oldInjRecs,
      1178                              injRec.variety === "script" ? scr
            iptStyles : fluid.cssInjectionStyles)
     ...
      1225          }
      1226      };
      1227  
      1224 -@@HOOKS@@                                                    
      1228 +    // Hooks through which output documents participate in re
           +ndering and injection. An output document is one which       
      1229 +    // views render into without executing any script in it, 
           +e.g. each page of a site rendered as one component tree.     
      1230 +    // Only the server creates them - see FluidView-node.js, 
           +which overrides these hooks - whereas the client observes    
      1231 +    // at most one document, its own, and so here they descri
           +be a document which is never an output document.             
      1232  
      1233 +    /**                                                      
      1234 +     * Determine whether a document is an output document. Ov
           +erridden in FluidView-node.js                                
      1235 +     * @param {Document} dokkument - The document            
      1236 +     * @return {Boolean} `true` if it is an output document  
      1237 +     */                                                      
      1238 +    fluid.isOutputDocument = function (/* dokkument */) {    
      1239 +        return false;                                        
      1240 +    };                                                       
      1241 +                                                             
      1242 +    /**                                                      
      1243 +     * Determine the location of a document, against which re
           +lative URLs within it resolve. Overridden in                 
      1244 +     * FluidView-node.js for output documents, which may have
           + no location of their own                                    
      1245 +     * @param {Document} dokkument - The document            
     … 38 more lines (ctrl+o to expand)

● Now writing FluidView-node.js, using the cut code:

  Searched for 3 patterns, read 2 files (ctrl+o to expand)
● Writing the new node file:

● Bash(S=/tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-97d2-
      445d-8bfc-4f99019ddb5a/scratchpad && python3 - <<EOF
      cut=open("$S/cut.js").read()…)
  ⎿      // client observes at most one document, its own - see fluid.outpu
     tDocumentView in FluidView-browser.js. The documents
         // are parsed by fluid.parseOutputDocument and their locations res
     … +152 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView-node.js (+155 -1)
       4  
       5  const $fluidViewNodeScope = function (fluid) {
       6  
       7 +    const $m = fluid.metadataSymbol;                           
       8 +                                                               
       9      // Currently disused
      10      /**
      11       * Parses an HTML string into a DOM element.
     ...
      13       * @param {String} template - The HTML string to parse.
      14       * @return {HTMLElement|null} The first element in the pars
          ed DOM fragment, or null if none exists.
      15       */
      14 -    fluid.parseDOM = fluid.serverDocumentParser;               
      16 +    fluid.parseDOM = text => fluid.serverDocumentParser(text); 
      17  
      18      // Noop stub to discard event handler registration on serve
          r
      19      fluid.applyOns = () => {};
     ...
       23          func();
       24      };
       25  
       26 +    // Output documents - documents created by fluid.createOut
          +putDocument, which views render into without executing any    
       27 +    // script in them, e.g. each page of a site rendered as on
          +e component tree. Only the server creates them, since a       
       28 +    // client observes at most one document, its own - see flu
          +id.outputDocumentView in FluidView-browser.js. The documents  
       29 +    // are parsed by fluid.parseOutputDocument and their locat
          +ions resolved by fluid.resolveOutputLocation, both supplied   
       30 +    // by server-support.js, and written by fluid.writeOutputD
          +ocumentsWhenSettled.                                          
       31 +                                                              
       32 +    /**                                                       
       33 +     * @typedef {Object} OutputDocumentRecord                 
       34 +     * @property {Document} dokkument - A document created by 
          +`fluid.createOutputDocument`                                  
       35 +     * @property {String} location - The location at which the
          + document is to be written, as supplied on creation           
       36 +     * @property {URL} url - The location resolved to an absol
          +ute URL, against which the document's relative URLs resolve   
       37 +     */                                                       
       38 +                                                              
       39 +    // Documents created by fluid.createOutputDocument, which 
          +views render into without executing any script in them -      
       40 +    // e.g. the pages of a site rendered as one component tree
          +. Held as a cell so that a writer may enumerate them, in      
       41 +    // order of creation                                      
       42 +    /** @type {Cell<OutputDocumentRecord[]>} */               
       43 +    fluid.outputDocuments = fluid.cell([], {name: "Fluid outpu
          +t documents"});                                               
       44 +                                                              
       45 +    /** @type {WeakMap<Document, OutputDocumentRecord>} */    
       46 +    fluid.outputDocumentRecords = new WeakMap();              
     … 134 more lines (ctrl+o to expand)

● Fixing one over-long comment line and the server-support.js comments that
  point at the removed browser versions:

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/FluidView-node.js"…)
  ⎿  44-};
     45-
     46-/**
     … +17 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView-node.js (+5 -4)
       97      };
       98  
       99      /**
      100 -     * Node version of `fluid.subscribeOutputDocumentInjection
          -s` from FluidView.js. Record in an output document the injecti
          -ons of the Single File Components defining the layers of a com
          -ponent                                                        
      101 -     * rendering into it, and of its view, so that the documen
          -t holds the same styles as a document hosting the             
      102 -     * component would - and the scripts too, as inert records
          - - see `fluid.outputScriptInjectionStyles`. Layers which      
      103 -     * were not imported from Single File Components are skipp
          -ed.                                                           
      100 +     * Node version of `fluid.subscribeOutputDocumentInjection
          +s` from FluidView.js. Record in an output document the        
      101 +     * injections of the Single File Components defining the l
          +ayers of a component rendering into it, and of its view,      
      102 +     * so that the document holds the same styles as a documen
          +t hosting the component would - and the scripts too, as       
      103 +     * inert records - see `fluid.outputScriptInjectionStyles`
          +. Layers which were not imported from Single File             
      104 +     * Components are skipped.                                
      105       * @param {ComponentComputer} view - The view of the compo
           nent which is rendering
      106       * @param {Document} dokkument - The document into which i
           t renders
      107       */
  ⎿  Updated src/framework/server/server-support.js (+4 -3)
      44  };
      45  
      46  /**
      47 - * Server version of `fluid.parseOutputDocument` from FluidView
         -.js - linkedom executes no script in any document              
      47 + * Parse markup into a fresh output document - see `fluid.creat
         +eOutputDocument` in FluidView-node.js. linkedom                
      48 + * executes no script in any document                          
      49   * @param {String} markup - The markup of the document
      50   * @return {Document} The parsed document
      51   */
      52  fluid.parseOutputDocument = fluid.serverDocumentParser;
      53  
      54  /**
      54 - * Server version of `fluid.resolveOutputLocation` from FluidVi
         -ew.js. A location which is not a URL is a file path,           
      55 - * resolved against the current directory.                     
      55 + * Resolve the location of an output document to an absolute UR
         +L - see `fluid.createOutputDocument` in                        
      56 + * FluidView-node.js. A location which is not a URL is a file p
         +ath, resolved against the current directory.                   
      57   * @param {String} location - The location
      58   * @return {URL} The location as an absolute URL
      59   */

● Now the client version of the layer in FluidView-browser.js:

  Searched for 1 pattern (ctrl+o to expand)

● Update(src/framework/core/js/FluidView-browser.js)
  ⎿  Added 35 lines
      10      // an avatar - in the browser there is just the one. Left u
          ndefined on the server, which may host several.
      11      fluid.defaultDocument = document;
      12  
      13 +    /**                                                        
      14 +     * Resolve a location to the URL of the page which it desig
         +nates, so that locations naming the same page compare          
      15 +     * equal - any query and fragment are dropped, and a final 
         +`index.html` is taken as naming its directory                  
      16 +     * @param {String} location - The location, which may be re
         +lative                                                         
      17 +     * @param {String} base - The URL against which a relative 
         +location is resolved                                           
      18 +     * @return {String} The URL of the page                    
      19 +     */                                                        
      20 +    fluid.pageUrlOf = function (location, base) {              
      21 +        const url = new URL(location, base);                   
      22 +        return url.origin + url.pathname.replace(/\/index\.html
         +$/, "/");                                                      
      23 +    };                                                         
      24 +                                                               
      25 +    /**                                                        
      26 +     * Retrieve the root element of this document, as the conta
         +iner of a `fluid.outputDocumentView` - provided that           
      27 +     * the location of the output document is that of this docu
         +ment                                                           
      28 +     * @param {String} location - The location of the output do
         +cument                                                         
      29 +     * @return {Element|Unavailable} The root element of this d
         +ocument, or an unavailable value if the output document        
      30 +     * is not this one                                         
      31 +     */                                                        
      32 +    fluid.hostDocumentElement = function (location) {          
      33 +        const base = document.baseURI || document.location.href
         +;                                                              
      34 +        return fluid.pageUrlOf(location, base) === fluid.pageUr
         +lOf(document.location.href, base) ? document.documentElement : 
      35 +            fluid.unavailable({cause: `Output document at ${loc
         +ation} is not this document`, variety: "config"});             
      36 +    };                                                         
      37 +                                                               
      38 +    // Client version of fluid.outputDocumentView from FluidVie
         +w-node.js. The client observes at most one document, its       
      39 +    // own, and so rather than creating a fresh document, the v
         +iew renders into this one should it be at                      
      40 +    // `documentLocation` - e.g. once a page rendered on the se
         +rver is made live again - and otherwise does not render.       
      41 +    fluid.def("fluid.outputDocumentView", {                    
      42 +        $layers: "fluid.viewComponent",                        
      43 +        documentLocation: fluid.unavailable({cause: "Location o
         +f output document not configured", variety: "config"}),        
      44 +        container: "$compute:fluid.hostDocumentElement({self}.d
         +ocumentLocation)",                                             
      45 +        $variety: "framework"                                  
      46 +    });                                                        
      47 +                                                               
      48      // Currently disused
      49      /**
      50       * Parses an HTML string into a DOM element.

● Next, the tests. The QUnit test of multi-document rendering moves into
  output-documents-test.js, and a client test of the new layer replaces it in
  FluidViewTests.js:

● Bash(python3 - <<'EOF'
      p="tests/framework-tests/core/js/FluidViewTests.js"…)
  ⎿  ok
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+14 -44)
      1483      redirected.destroy();
      1484  });
      1485  
      1486 -fluid.def("fluid.tests.outputPage", {                        
      1486 +fluid.def("fluid.tests.hostedOutputPage", {                  
      1487      $layers: "fluid.component",
      1488      view: {
      1489          $component: {
      1490              $layers: ["fluid.templateViewComponent", "fluid.o
            utputDocumentView"],
      1491 -            documentLocation: "{outputPage}.page.path",      
      1492 -            template: `<html lang="en"><head><title>@{page.ti
           -tle}</title></head><body class="@{page.kind}"><h1>@{page.titl
           -e}</h1></body></html>`                                       
      1491 +            documentLocation: "elsewhere/index.html",        
      1492 +            template: `<html><body><h1>Elsewhere</h1></body><
           +/html>`                                                      
      1493          }
      1494      }
      1495  });
      1496  
      1497 -fluid.def("fluid.tests.outputSite", {                        
      1498 -    $layers: "fluid.component",                              
      1499 -    pages: {                                                 
      1500 -        $reactiveRoot: [{path: "a/index.html", title: "A", ki
           -nd: "post"}, {path: "b/index.html", title: "B", kind: "page"}
           -]                                                            
      1501 -    },                                                       
      1502 -    documents: {                                             
      1503 -        $component: {                                        
      1504 -            $layers: "fluid.tests.outputPage",               
      1505 -            $for: {                                          
      1506 -                source: "{outputSite}.pages",                
      1507 -                valueAs: "page"                              
      1508 -            }                                                
      1509 -        }                                                    
      1510 -    }                                                        
      1511 -});                                                          
      1497 +QUnit.test("An output document view on the client renders onl
           +y into its own document", function (assert) {                
      1498 +    const here = document.location.href;                     
      1499 +    assert.equal(fluid.hostDocumentElement(here), document.do
           +cumentElement, "Output document at this location is this docu
           +ment");                                                      
      1500 +    assert.equal(fluid.pageUrlOf("dir/index.html?q=1#top", "h
           +ttp://example.org/site/"), fluid.pageUrlOf("dir/", "http://ex
           +ample.org/site/"),                                           
      1501 +        "Final index.html, query and fragment do not distingu
           +ish a page");                                                
      1502 +    assert.ok(fluid.isUnavailable(fluid.hostDocumentElement("
           +elsewhere/index.html")), "Output document elsewhere is not th
           +is document");                                               
      1503 +    assert.notOk(fluid.isOutputDocument(document), "The clien
           +t's own document is not an output document");                
      1504  
     … 34 more lines (ctrl+o to expand)

● Now porting the removed test into the server test:

● Bash(python3 - <<'EOF'
      p="tests/framework-tests/server/output-documents-test.js"…)
  ⎿  Allocated instanceId 1 at site plainSite-31.documents.1.view
     Disposing unallocated effects for path plainSite-31.documents.1.view a
     t end of computeInstance
     … +8 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/server/output-documents-test.js (+65 -0)
       60      }
       61  });
       62  
       63 +fluid.def("fluid.tests.plainPage", {                          
       64 +    $layers: "fluid.component",                               
       65 +    view: {                                                   
       66 +        $component: {                                         
       67 +            $layers: ["fluid.templateViewComponent", "fluid.ou
          +tputDocumentView"],                                           
       68 +            documentLocation: "$compute:fluid.tests.outPath({p
          +lainPage}.page.name)",                                        
       69 +            template: `<html lang="en"><head><title>@{page.tit
          +le}</title></head><body class="@{page.kind}"><h1>@{page.title}
          +</h1></body></html>`                                          
       70 +        }                                                     
       71 +    }                                                         
       72 +});                                                           
       73 +                                                              
       74 +fluid.def("fluid.tests.plainSite", {                          
       75 +    $layers: "fluid.component",                               
       76 +    pages: {                                                  
       77 +        $reactiveRoot: [{name: "a", title: "A", kind: "post"},
          + {name: "b", title: "B", kind: "page"}]                       
       78 +    },                                                        
       79 +    documents: {                                              
       80 +        $component: {                                         
       81 +            $layers: "fluid.tests.plainPage",                 
       82 +            $for: {                                           
       83 +                source: "{plainSite}.pages",                  
       84 +                valueAs: "page"                               
       85 +            }                                                 
       86 +        }                                                     
       87 +    }                                                         
       88 +});                                                           
       89 +                                                              
       90 +/**                                                           
       91 + * Check that one component tree renders a document of its own
          + per page, which is rerendered, created and released          
       92 + * as the pages change - without writing any of them          
       93 + */                                                           
       94 +const checkPlainSite = function () {                          
       95 +    const site = fluid.initFreeComponent("fluid.tests.plainSit
          +e");                                                          
       96 +    fluid.cell.stabilize();                                   
       97 +    const records = fluid.outputDocuments.get();              
       98 +    expect(records.map(record => record.location).join() === [
          +fluid.tests.outPath("a"), fluid.tests.outPath("b")].join(),   
       99 +        "An output document created for each page");          
     … 38 more lines (ctrl+o to expand)
  ⎿  (timeout 5m)

● Both server tests pass. Now the full test suite and lint:

  Ran 1 shell command (ctrl+o to expand)

● All 1809 tests pass. That's 6 fewer assertions than before, which is the
  difference between the test that moved to the server and the new client test.
  Fixing the lint errors:

  Searched for 1 pattern, ran 2 shell commands (ctrl+o to expand)

● Next I'm running the real-browser tests and the ponder build against the moved
  code:

  Ran 1 shell command (ctrl+o to expand)

● The ponder build leaves all 66 pages byte-for-byte unchanged, and the 20
  browser demo steps pass. Checking whether anything runs the QUnit drivers in a
  real browser:

  Listed 1 directory (ctrl+o to expand)

● There's no browser runner for the QUnit drivers, so I'll load
  FluidViewTests.html in puppeteer's Chromium directly:

  Ran 2 shell commands (ctrl+o to expand)

● The output-document code now lives in FluidView-node.js, the server-only file;
  nothing in the browser build creates or registers extra documents any more.
  All tests pass:

  - Node suite: 1809/1809 (6 fewer assertions, because a test moved to the
    server).
  - Server tests: output-documents-test and hydrate-test both pass.
  - Real browser: FluidViewTests.html passes 35/35 in headless Chromium.
  - ponder: the site build writes 0 pages and leaves all 66 unchanged.

  Lint is clean. Nothing is committed.

  Moved to src/framework/core/js/FluidView-node.js:
  - The document registry: fluid.outputDocuments, fluid.outputDocumentRecords,
    fluid.outputDocumentMarkup, fluid.createOutputDocument and
    fluid.releaseOutputDocument.
  - The injection machinery: fluid.subscribeOutputDocumentInjections,
    fluid.applyOutputScriptInjection and fluid.outputScriptInjectionStyles.
  - The fluid.outputDocumentView layer.
  - Server versions of four hooks that core now declares (below).

  Deleted: the browser versions of fluid.parseOutputDocument and
  fluid.resolveOutputLocation. The versions in server-support.js are now the
  only ones, and their comments say so.

  Left in core (FluidView.js):
  - Four hooks whose client versions simply say "no document is an output
    document":
    - fluid.isOutputDocument (always false);
    - fluid.documentLocation (the document's own location);
    - fluid.subscribeOutputDocumentInjections (does nothing);
    - fluid.scriptInjectionStylesFor, which is new and replaces the one place
      core referred to fluid.outputScriptInjectionStyles directly.
  - fluid.documentElementOf, which both versions of the layer use.
  - fluid.inertScriptType, moved next to fluid.classifyScriptNode, because the
    client needs it to recognise inert script records when making a page live
    again.

  One departure from my plan: I had suggested moving the subscription call out
  of fluid.renderView into the layer itself, but it has to stay. Every view
  rendering into an output document subscribes its own layers that way,
  including SFC island views that aren't part of the page's own view. The SFC
  widget in output-documents-test.js depends on this. So renderView still calls
  the hook, which does nothing on the client.

  New client layer in FluidView-browser.js: a client version of
  fluid.outputDocumentView. If documentLocation names the current page, its
  container is document.documentElement; otherwise the container is unavailable
  and nothing renders. A trailing index.html, the query and the fragment are
  ignored when comparing locations.

  For ponder this isn't enough yet: its documentLocation is an absolute file
  path on the build machine, which will never match the page's address in a
  browser. Making a page live again (R11) will need ponder to give each page its
  URL as documentLocation, with the build turning that into a file name in the
  filenameFor callback.

  Tests:
  - The test "One component tree rendering many output documents" moved from
    FluidViewTests.js into output-documents-test.js as checkPlainSite, with the
    same checks plus one on fluid.documentLocation.
  - In its place, FluidViewTests.js has "An output document view on the client
    renders only into its own document". It runs under both linkedom and
    Chromium. It checks the location comparison and that a page at another
    location stays unrendered. It doesn't render into the test page's own root
    element, since that would overwrite QUnit's page.

  Small fix: fluid.parseDOM in FluidView-node.js now calls
  fluid.serverDocumentParser when used, instead of copying it at load time, when
  it was still undefined.

✻ Crunched for 7m 15s · done 9:53

❯ make ponder pass page URLs as documentLocation                                

  Ran 2 shell commands (ctrl+o to expand)

● Pages use page.permalink as documentLocation, with alias documents getting
  their own URL, and buildSite.js maps URLs back to files via each model's
  outputPath rather than re-deriving paths. Now checking what else references
  outDir and the output files.

  Ran 2 shell commands (ctrl+o to expand)

● Making the edits:

  Ran 2 shell commands (ctrl+o to expand)

● Now buildSite.js:

  Read 1 file, ran 1 shell command (ctrl+o to expand)

● Rebuilding and comparing with the previous output:

  Ran 1 shell command (ctrl+o to expand)

● Output is byte-for-byte identical. Checking the --live build, Node 16.6.2, a
  partial --from/--limit build, and lint:

  Ran 3 shell commands (ctrl+o to expand)
● Updating the R1 notes in REQUIREMENTS.md, which describe the old browser
  behaviour:

  Ran 2 shell commands (ctrl+o to expand)

● ponder now passes each page's URL as its documentLocation, e.g.
  https://ponder.org.uk/post/x/, instead of a file path under docs-infusion/.
  The build output is byte-for-byte identical to before. A full rebuild writes
  nothing and reports all 66 pages unchanged. The --live build works under Node
  16.6.2, a partial --from/--limit build works, and lint passes.

  What changed in ponder-infusion:
  - ponder-document.vue: documentLocation is now {document}.page.permalink. The
    ponder.document.outputFile helper that built file paths is gone.
  - siteModel.js and ponder-alias.vue: the page/1/ redirect documents had no URL
    of their own, so their records now carry a permalink, and the alias layer
    uses that.
  - buildSite.js:
    - It looks up each document's file from its URL, using the outputPath that
      siteModel.js already computes for every page and alias, so no path logic
      is repeated.
    - The outDir value is no longer handed to the site component, which no
      longer needs it.
    - A document whose URL matches no page stops the build with an error naming
      the URL, rather than being silently skipped.
    - The URL rewriting and the stale-page cleanup use the same lookup.
  - REQUIREMENTS.md (R1 notes): they now give the new documentLocation and say
    output documents exist only on the server, with the client layer described.

  Limitation: a live page recognises itself only when it is served at its real
  address under https://ponder.org.uk. A local preview such as
  http://localhost:1313/post/x/, or opening the file directly, won't match, so
  the page view won't render there. If you want live local previews, the
  client-side match could compare paths relative to the site's base URL instead
  of whole URLs. That would be a change in Infusion's fluid.hostDocumentElement,
  plus a way for the page to know the base URL. I haven't done it.

  Nothing is committed.

✻ Sautéed for 3m 47s · done 10:02

❯ make the client match paths relative to the base URL                          

● The client can't learn the site's local base from its one document, so I'm
  adding a baseURL option to fluid.outputDocumentView. With it, the client
  ignores the origin and compares the page's path below the base URL's path. The
  home page is the reason extra information is needed: its path below the base
  is empty, and any page's URL ends with an empty path.

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/FluidView-browser.js"…)
  ⎿  77:    fluid.def("fluid.outputDocumentView", {
     78-        $layers: "fluid.viewComponent",
     79-        documentLocation: fluid.unavailable({cause: "Location of ou
     tput document not configured", variety: "config"}),
  ⎿  Updated src/framework/core/js/FluidView-browser.js (+46 -9)
      11      fluid.defaultDocument = document;
      12  
      13      /**
      14 -     * Resolve a location to the URL of the page which it desig
         -nates, so that locations naming the same page compare          
      14 +     * Resolve a location to the path of the page which it desi
         +gnates, so that locations naming the same page compare         
      15       * equal - any query and fragment are dropped, and a final 
          `index.html` is taken as naming its directory
      16       * @param {String} location - The location, which may be re
          lative
      17       * @param {String} base - The URL against which a relative 
          location is resolved
      18 -     * @return {String} The URL of the page                    
      18 +     * @return {String} The path of the page, e.g. "/post/x/"  
      19       */
      20 +    fluid.pagePathOf = function (location, base) {             
      21 +        return new URL(location, base).pathname.replace(/\/inde
         +x\.html$/, "/");                                               
      22 +    };                                                         
      23 +                                                               
      24 +    /**                                                        
      25 +     * Resolve a location to the URL of the page which it desig
         +nates, as by `fluid.pagePathOf`                                
      26 +     * @param {String} location - The location, which may be re
         +lative                                                         
      27 +     * @param {String} base - The URL against which a relative 
         +location is resolved                                           
      28 +     * @return {String} The URL of the page, without query or f
         +ragment                                                        
      29 +     */                                                        
      30      fluid.pageUrlOf = function (location, base) {
      21 -        const url = new URL(location, base);                   
      22 -        return url.origin + url.pathname.replace(/\/index\.html
         -$/, "/");                                                      
      31 +        return new URL(location, base).origin + fluid.pagePathO
         +f(location, base);                                             
      32      };
      33  
      34      /**
      35 +     * Resolve a location to the path of the page which it desi
         +gnates relative to the path of a site's base URL,              
      36 +     * whatever the origin of either - so that a page is recogn
         +ised wherever the site is served, e.g. on a local server       
      37 +     * @param {String} location - The location, which may be re
         +lative                                                         
      38 +     * @param {String} base - The URL against which a relative 
         +location is resolved                                           
      39 +     * @param {String} baseURL - The site's base URL, e.g. "htt
         +ps://example.org/blog"                                         
      40 +     * @return {String|undefined} The path of the page relative
         + to the site, e.g. "post/x/", or `undefined` if the page       
      41 +     * does not lie within the site's path                     
      42 +     */                                                        
      43 +    fluid.sitePathOf = function (location, base, baseURL) {    
      44 +        const sitePath = new URL(baseURL).pathname.replace(/\/?
         +$/, "/");                                                      
      45 +        const pagePath = fluid.pagePathOf(location, base);     
      46 +        return pagePath.startsWith(sitePath) ? pagePath.substri
         +ng(sitePath.length) : undefined;                               
     … 43 more lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView-node.js (+159 -1)
       4  
       5  const $fluidViewNodeScope = function (fluid) {
       6  
       7 +    const $m = fluid.metadataSymbol;                           
       8 +                                                               
       9      // Currently disused
      10      /**
      11       * Parses an HTML string into a DOM element.
     ...
      13       * @param {String} template - The HTML string to parse.
      14       * @return {HTMLElement|null} The first element in the pars
          ed DOM fragment, or null if none exists.
      15       */
      14 -    fluid.parseDOM = fluid.serverDocumentParser;               
      16 +    fluid.parseDOM = template => fluid.serverDocumentParser(tem
         +plate);                                                        
      17  
      18      // Noop stub to discard event handler registration on serve
          r
      19      fluid.applyOns = () => {};
     ...
       23          func();
       24      };
       25  
       26 +    // Output documents - documents created by fluid.createOut
          +putDocument, which views render into without executing any    
       27 +    // script in them, e.g. each page of a site rendered as on
          +e component tree. Only the server creates them, since a       
       28 +    // client observes at most one document, its own - see flu
          +id.outputDocumentView in FluidView-browser.js. The documents  
       29 +    // are parsed by fluid.parseOutputDocument and their locat
          +ions resolved by fluid.resolveOutputLocation, both supplied   
       30 +    // by server-support.js, and written by fluid.writeOutputD
          +ocumentsWhenSettled.                                          
       31 +                                                              
       32 +    /**                                                       
       33 +     * @typedef {Object} OutputDocumentRecord                 
       34 +     * @property {Document} dokkument - A document created by 
          +`fluid.createOutputDocument`                                  
       35 +     * @property {String} location - The location at which the
          + document is to be written, as supplied on creation           
       36 +     * @property {URL} url - The location resolved to an absol
          +ute URL, against which the document's relative URLs resolve   
       37 +     */                                                       
       38 +                                                              
       39 +    // Documents created by fluid.createOutputDocument, which 
          +views render into without executing any script in them -      
       40 +    // e.g. the pages of a site rendered as one component tree
          +. Held as a cell so that a writer may enumerate them, in      
       41 +    // order of creation                                      
       42 +    /** @type {Cell<OutputDocumentRecord[]>} */               
       43 +    fluid.outputDocuments = fluid.cell([], {name: "Fluid outpu
          +t documents"});                                               
       44 +                                                              
       45 +    /** @type {WeakMap<Document, OutputDocumentRecord>} */    
       46 +    fluid.outputDocumentRecords = new WeakMap();              
     … 138 more lines (ctrl+o to expand)

● Adding test cases for base-relative matching:

● Bash(python3 - <<'EOF'
      p="tests/framework-tests/core/js/FluidViewTests.js"…)
  ⎿  LINT-OK
     10:05:03.696:   fq:  FAIL: Module "Fluid View Tests" Test name "An out
     put document view on the client renders only into its own document" -
     … +16 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+18 -0)
      1502      assert.ok(fluid.isUnavailable(fluid.hostDocumentElement("
            elsewhere/index.html")), "Output document elsewhere is not th
            is document");
      1503      assert.notOk(fluid.isOutputDocument(document), "The clien
            t's own document is not an output document");
      1504  
      1505 +    // A site whose base URL is on another origin, but whose 
           +path is that of this document's directory - as when a site   
      1506 +    // published at https://example.org/... is served locally
      1507 +    const dirPath = new URL("./", here).pathname;            
      1508 +    const fileName = new URL(here).pathname.substring(dirPath
           +.length);                                                    
      1509 +    const baseURL = "https://example.org" + dirPath.replace(/
           +\/$/, "");                                                   
      1510 +    assert.equal(fluid.sitePathOf("https://example.org/blog/p
           +ost/x/index.html", undefined, "https://example.org/blog"), "p
           +ost/x/",                                                     
      1511 +        "Path of page relative to site");                    
      1512 +    assert.equal(fluid.sitePathOf("https://example.org/other/
           +", undefined, "https://example.org/blog"), undefined,        
      1513 +        "Page outside the site's path has no path within it")
           +;                                                            
      1514 +    assert.equal(fluid.hostDocumentElement(baseURL + "/" + fi
           +leName, baseURL), document.documentElement,                  
      1515 +        "Output document at this path relative to the site's 
           +base is this document, whatever its origin");                
      1516 +    assert.equal(fluid.hostDocumentElement(fileName, baseURL)
           +, document.documentElement,                                  
      1517 +        "Relative location resolved against the site's base U
           +RL");                                                        
      1518 +    assert.ok(fluid.isUnavailable(fluid.hostDocumentElement(b
           +aseURL + "/", baseURL)),                                     
      1519 +        "The site's home page is not this document");        
      1520 +    assert.ok(fluid.isUnavailable(fluid.hostDocumentElement(b
           +aseURL + "/elsewhere/" + fileName, baseURL)),                
      1521 +        "Output document at another path of the site is not t
           +his document");                                              
      1522 +                                                             
      1523      const that = fluid.tests.hostedOutputPage();
      1524      fluid.cell.stabilize();
      1525      assert.ok(fluid.isUnavailable(that.view.container), "View
             of output document elsewhere has no container");
  ⎿  (timeout 5m)

● Found the bug: resolving relative URLs against a base without a trailing slash
  drops the last path segment, as happens with ponder's URL. I'll fix this by
  treating the base URL as a directory.

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/FluidView-browser.js"…)
  ⎿  LINT-OK
     10:05:35.675:   fq:  Test concluded - Module "Fluid View Tests" Test n
     ame "An output document view on the client renders only into its own d
     … +10 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView-browser.js (+2 -1)
      60          const here = document.location.href, base = document.ba
          seURI || here;
      61          let matches;
      62          if (baseURL) {
      63 -            const sitePath = fluid.sitePathOf(location, baseURL
         -, baseURL);                                                    
      63 +            // The base URL names the site's directory, whether
         + or not it ends with a slash                                   
      64 +            const sitePath = fluid.sitePathOf(location, baseURL
         +.replace(/\/?$/, "/"), baseURL);                               
      65              matches = sitePath !== undefined && sitePath === fl
          uid.sitePathOf(here, base, baseURL);
      66          } else {
      67              matches = fluid.pageUrlOf(location, base) === fluid
          .pageUrlOf(here, base);
  ⎿  (timeout 5m)

● Now passing the base URL from ponder:

  Ran 1 shell command (ctrl+o to expand)

● The ponder output is again byte-for-byte identical. Running the full Infusion
  suite and server tests:

  Ran 1 shell command (ctrl+o to expand)

● On the client, a page now recognises itself by its path below the site's base
  URL, so a ponder page served at http://localhost:1313/post/x/ matches
  https://ponder.org.uk/post/x/. Infusion's tests pass: the full suite at
  1815/1815, both server tests, and FluidViewTests.html in headless Chromium.
  The ponder build output is byte-for-byte unchanged and lint is clean. Nothing
  is committed.

  How it works:
  - New option: fluid.outputDocumentView takes an optional baseURL, empty by
    default. ponder now passes {site}.config.baseURL to both page and redirect
    documents. The server version of the layer declares the option but doesn't
    use it.
  - With a base URL: the client ignores the origin and compares the page's path
    below the base URL's path, after dropping any query, fragment and trailing
    index.html. A relative documentLocation is resolved against the base URL,
    which is treated as a folder whether or not it ends in a slash. That last
    rule is what one new test caught: without it, ponder's https://ponder.org.uk
    would lose its last path segment.
  - Without a base URL: whole URLs are compared, as before.
  - Code: two helpers do this in FluidView-browser.js: fluid.sitePathOf and
    fluid.pagePathOf.

  Why the base URL has to be passed in: the client sees only its own address, so
  without it the home page can't be told apart from other pages. The home
  page's path below the base is empty, and every page's address ends with an
  empty path.

  When it still won't match:
  - The site is served from a different path than its base URL's, for example
    http://localhost/docs-infusion/post/x/.
  - The pages are opened directly as files.

  Supporting those would need each written page to record where the site's root
  is relative to it. I haven't done that.

  Tests: the client test in FluidViewTests.js gained six checks:
  - a page's path within the site;
  - a page outside the site's path;
  - a match across different origins;
  - a relative location;
  - the home page not matching another page;
  - a different page of the site not matching.

  The REQUIREMENTS.md R1 notes and the comment in ponder-document.vue describe
  the new matching.

✻ Worked for 3m 42s · done 10:07

❯ record the site root in each page so file previews match                      

● I'll start by checking how the reconciler treats attributes on the root
  element, since that decides where the record can live:

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● Root element attributes survive rendering, so I'll have the server stamp a
  fluid-site-root attribute (relative path) on each document's <html> element,
  let the client resolve it for the local site root, and move the path helpers
  into core for shared use.

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/FluidView-browser.js"…)
  ⎿  LINT-OK
  ⎿  Updated src/framework/core/js/FluidView-browser.js (+9 -41)
      11      fluid.defaultDocument = document;
      12  
      13      /**
      14 -     * Resolve a location to the path of the page which it desi
         -gnates, so that locations naming the same page compare         
      15 -     * equal - any query and fragment are dropped, and a final 
         -`index.html` is taken as naming its directory                  
      16 -     * @param {String} location - The location, which may be re
         -lative                                                         
      17 -     * @param {String} base - The URL against which a relative 
         -location is resolved                                           
      18 -     * @return {String} The path of the page, e.g. "/post/x/"  
      19 -     */                                                        
      20 -    fluid.pagePathOf = function (location, base) {             
      21 -        return new URL(location, base).pathname.replace(/\/inde
         -x\.html$/, "/");                                               
      22 -    };                                                         
      23 -                                                               
      24 -    /**                                                        
      25 -     * Resolve a location to the URL of the page which it desig
         -nates, as by `fluid.pagePathOf`                                
      26 -     * @param {String} location - The location, which may be re
         -lative                                                         
      27 -     * @param {String} base - The URL against which a relative 
         -location is resolved                                           
      28 -     * @return {String} The URL of the page, without query or f
         -ragment                                                        
      29 -     */                                                        
      30 -    fluid.pageUrlOf = function (location, base) {              
      31 -        return new URL(location, base).origin + fluid.pagePathO
         -f(location, base);                                             
      32 -    };                                                         
      33 -                                                               
      34 -    /**                                                        
      35 -     * Resolve a location to the path of the page which it desi
         -gnates relative to the path of a site's base URL,              
      36 -     * whatever the origin of either - so that a page is recogn
         -ised wherever the site is served, e.g. on a local server       
      37 -     * @param {String} location - The location, which may be re
         -lative                                                         
      38 -     * @param {String} base - The URL against which a relative 
         -location is resolved                                           
      39 -     * @param {String} baseURL - The site's base URL, e.g. "htt
         -ps://example.org/blog"                                         
      40 -     * @return {String|undefined} The path of the page relative
         - to the site, e.g. "post/x/", or `undefined` if the page       
      41 -     * does not lie within the site's path                     
      42 -     */                                                        
      43 -    fluid.sitePathOf = function (location, base, baseURL) {    
      44 -        const sitePath = new URL(baseURL).pathname.replace(/\/?
         -$/, "/");                                                      
      45 -        const pagePath = fluid.pagePathOf(location, base);     
      46 -        return pagePath.startsWith(sitePath) ? pagePath.substri
         -ng(sitePath.length) : undefined;                               
      47 -    };                                                         
      48 -                                                               
      49 -    /**                                                        
      14       * Retrieve the root element of this document, as the conta
          iner of a `fluid.outputDocumentView` - provided that
     … 24 more lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView.js (+59 -0)
      1278          return dokkument.documentElement;
      1279      };
      1280  
      1281 +    /**                                                      
      1282 +     * Resolve a location to the path of the page which it de
           +signates, so that locations naming the same page compare     
      1283 +     * equal - any query and fragment are dropped, and a fina
           +l `index.html` is taken as naming its directory              
      1284 +     * @param {String} location - The location, which may be 
           +relative                                                     
      1285 +     * @param {String} base - The URL against which a relativ
           +e location is resolved                                       
      1286 +     * @return {String} The path of the page, e.g. "/post/x/"
      1287 +     */                                                      
      1288 +    fluid.pagePathOf = function (location, base) {           
      1289 +        return new URL(location, base).pathname.replace(/\/in
           +dex\.html$/, "/");                                           
      1290 +    };                                                       
      1291 +                                                             
      1292 +    /**                                                      
      1293 +     * Resolve a location to the URL of the page which it des
           +ignates, as by `fluid.pagePathOf`                            
      1294 +     * @param {String} location - The location, which may be 
           +relative                                                     
      1295 +     * @param {String} base - The URL against which a relativ
           +e location is resolved                                       
      1296 +     * @return {String} The URL of the page, without query or
           + fragment                                                    
      1297 +     */                                                      
      1298 +    fluid.pageUrlOf = function (location, base) {            
      1299 +        return new URL(location, base).origin + fluid.pagePat
           +hOf(location, base);                                         
      1300 +    };                                                       
      1301 +                                                             
      1302 +    /**                                                      
      1303 +     * Express a site's base URL as the URL of its root direc
           +tory, whether or not it ends with a slash                    
      1304 +     * @param {String} baseURL - The site's base URL, e.g. "h
           +ttps://example.org/blog"                                     
      1305 +     * @return {String} The URL of the site's root directory,
           + e.g. "https://example.org/blog/"                            
      1306 +     */                                                      
      1307 +    fluid.siteDirectoryOf = function (baseURL) {             
      1308 +        return baseURL.replace(/\/?$/, "/");                 
      1309 +    };                                                       
      1310 +                                                             
      1311 +    /**                                                      
      1312 +     * Resolve a location to the path of the page which it de
           +signates relative to the path of a site's root directory,    
      1313 +     * whatever the origin of either - so that a page is reco
           +gnised wherever the site is served                           
      1314 +     * @param {String} location - The location, which may be 
           +relative                                                     
      1315 +     * @param {String} base - The URL against which a relativ
           +e location is resolved                                       
      1316 +     * @param {String} siteRoot - The URL of the site's root 
           +directory, e.g. "https://example.org/blog/"                  
      1317 +     * @return {String|undefined} The path of the page relati
           +ve to the site's root, e.g. "post/x/", or `undefined` if the 
     … 25 more lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidView-node.js (+15 -4)
      53       * `fluid.outputDocumentView`. No script executes in it, in
          cluding the scripts of any Single File Component whose
      54       * injections are recorded in it - see `fluid.subscribeOutp
          utDocumentInjections`. The document is registered in
      55       * `fluid.outputDocuments` until released by `fluid.release
          OutputDocument`.
      56 +     * Should the document be a page of a site with a base URL,
         + its root element records the relative URL of the site's       
      57 +     * root, bearing `fluid.siteRootAttribute`. A root renderin
         +g onto the element leaves it, having not written it.           
      58       * @param {String} location - The location at which the doc
          ument is to be written, e.g. "posts/first/index.html",
      59       * which is resolved as by `fluid.resolveOutputLocation`
      60 +     * @param {String} [baseURL] - The base URL of the site to 
         +which the document belongs, if any                             
      61       * @return {Document} The fresh document
      62       */
      60 -    fluid.createOutputDocument = function (location) {         
      63 +    fluid.createOutputDocument = function (location, baseURL) {
      64          const dokkument = fluid.parseOutputDocument(fluid.outpu
          tDocumentMarkup);
      65 +        if (baseURL) {                                         
      66 +            const siteBase = fluid.siteDirectoryOf(baseURL);   
      67 +            const sitePath = fluid.sitePathOf(location, siteBas
         +e, siteBase);                                                  
      68 +            if (sitePath !== undefined) {                      
      69 +                dokkument.documentElement.setAttribute(fluid.si
         +teRootAttribute, fluid.relativeSiteRoot(sitePath));            
      70 +            }                                                  
      71 +        }                                                      
      72          const record = {dokkument, location, url: fluid.resolve
          OutputLocation(location)};
      73          fluid.outputDocumentRecords.set(dokkument, record);
      74          fluid.outputDocuments.set([...fluid.outputDocuments._va
          lue, record]);
     ...
      176      fluid.def("fluid.outputDocumentView", {
      177          $layers: "fluid.viewComponent",
      178          documentLocation: fluid.unavailable({cause: "Location 
           of output document not configured", variety: "config"}),
      169 -        // The base URL of the site to which the document belo
          -ngs, if any - used only on the client, to recognise the       
      170 -        // document wherever the site is served - see fluid.ho
          -stDocumentElement in FluidView-browser.js                     
      179 +        // The base URL of the site to which the document belo
          +ngs, if any - by which the document records the relative      
      180 +        // URL of the site's root, so that on the client it re
          +cognises itself wherever the site is served - see             
      181 +        // fluid.hostDocumentElement in FluidView-browser.js  
      182          baseURL: "",
      183          outputDocument: {
      184              $bindable: {
      174 -                bind: "fluid.createOutputDocument({self}.docum
          -entLocation)",                                                
      185 +                bind: "fluid.createOutputDocument({self}.docum
          +entLocation, {self}.baseURL)",                                
      186                  unbind: "fluid.releaseOutputDocument({boundVal
           ue})"
      187              }
      188          },

● Now the tests, client first:

● Bash(python3 - <<'EOF'
      p="tests/framework-tests/core/js/FluidViewTests.js"…)
  ⎿  LINT-OK
     Allocated instanceId 2 at site plainSite-31
     Disposing unallocated effects for path plainSite-31 at end of computeI
     … +14 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidViewTests.js (+13 -0)
      1520      assert.ok(fluid.isUnavailable(fluid.hostDocumentElement(b
            aseURL + "/elsewhere/" + fileName, baseURL)),
      1521          "Output document at another path of the site is not t
            his document");
      1522  
      1523 +    // A page recording the site's root as its parent directo
           +ry, as when a site published at https://example.org/blog/    
      1524 +    // is previewed from files in some other directory       
      1525 +    const dirName = dirPath.split("/").filter(segment => segm
           +ent).pop();                                                  
      1526 +    const html = document.documentElement;                   
      1527 +    html.setAttribute(fluid.siteRootAttribute, "../");       
      1528 +    assert.equal(fluid.hostDocumentElement("https://example.o
           +rg/blog/" + dirName + "/" + fileName, "https://example.org/bl
           +og"),                                                        
      1529 +        html, "Output document at this path relative to the s
           +ite's root recorded in this document is this document");     
      1530 +    assert.ok(fluid.isUnavailable(fluid.hostDocumentElement("
           +https://example.org/blog/" + fileName, "https://example.org/b
           +log")),                                                      
      1531 +        "Output document at another path relative to the reco
           +rded root is not this document");                            
      1532 +    html.removeAttribute(fluid.siteRootAttribute);           
      1533 +    assert.deepEqual(["post/x/", "404.html", ""].map(fluid.re
           +lativeSiteRoot), ["../../", "./", "./"],                     
      1534 +        "Relative URL of the site's root from pages of the si
           +te");                                                        
      1535 +                                                             
      1536      const that = fluid.tests.hostedOutputPage();
      1537      fluid.cell.stabilize();
      1538      assert.ok(fluid.isUnavailable(that.view.container), "View
             of output document elsewhere has no container");
  ⎿  Updated tests/framework-tests/server/output-documents-test.js (+19 -1)
      66          $component: {
      67              $layers: ["fluid.templateViewComponent", "fluid.out
          putDocumentView"],
      68              documentLocation: "$compute:fluid.tests.outPath({pl
          ainPage}.page.name)",
      69 +            baseURL: "{plainSite}.baseURL",                    
      70              template: `<html lang="en"><head><title>@{page.titl
          e}</title></head><body class="@{page.kind}"><h1>@{page.title}</
          h1></body></html>`
      71          }
      72      }
     ...
      74  
      75  fluid.def("fluid.tests.plainSite", {
      76      $layers: "fluid.component",
      77 +    baseURL: "",                                               
      78      pages: {
      79          $reactiveRoot: [{name: "a", title: "A", kind: "post"}, 
          {name: "b", title: "B", kind: "page"}]
      80      },
     ...
       94   * as the pages change - without writing any of them
       95   */
       96  const checkPlainSite = function () {
       95 -    const site = fluid.initFreeComponent("fluid.tests.plainSit
          -e");                                                          
       97 +    // The site is published from the output directory, whose 
          +pages record the relative URL of its root                     
       98 +    const site = fluid.initFreeComponent("fluid.tests.plainSit
          +e", {baseURL: pathToFileURL(outDir).href});                   
       99      fluid.cell.stabilize();
      100      const records = fluid.outputDocuments.get();
      101      expect(records.map(record => record.location).join() === [
           fluid.tests.outPath("a"), fluid.tests.outPath("b")].join(),
     ...
      108      expect(docB.querySelector("h1")?.textContent === "B", "Sec
           ond page rendered into its own document");
      109      expect(records[0].url.href === pathToFileURL(fluid.tests.o
           utPath("a")).href, "Location resolved to a URL");
      110      expect(fluid.documentLocation(docA) === records[0].url, "L
           ocation of output document is that with which it was created")
           ;
      111 +    expect(docA.documentElement.getAttribute(fluid.siteRootAtt
          +ribute) === "../", "Page records the relative URL of the site'
          +s root");                                                     
      112  
      113      const h1B = docB.querySelector("h1");
      114      site.pages = [{...site.pages[0], title: "A2"}, site.pages[
           1]];
      115      fluid.cell.stabilize();
      116      expect(docA.querySelector("h1").textContent === "A2", "Edi
           t to a page rerenders its document");
      117      expect(docB.querySelector("h1") === h1B, "Other document u
           ndisturbed");
      118 +    expect(docA.documentElement.getAttribute(fluid.siteRootAtt
          +ribute) === "../" && docA.documentElement.getAttribute("lang")
          + === "en",                                                    
      119 +        "Record of the site's root survives rerendering of the
          + template's root onto the document element");                 
      120      expect(fluid.outputDocuments.get().length === 2, "No furth
           er documents created");
      121  
      122      site.pages = [site.pages[0]];
     ...
      126      site.destroy();
      127      fluid.cell.stabilize();
     … 16 more lines (ctrl+o to expand)
  ⎿  (timeout 5m)

● Tests pass under all three runners. In ponder, the static build should remove
  the new attribute along with the other make-it-live material, so only --live
  builds keep it:

  Ran 1 shell command (ctrl+o to expand)

● Paths look correct on every page type—./ at the root and 404 page, ../ for
  posts, and ../../ for the page/1 redirect. Next I'll test end-to-end by
  opening a live post in Chromium, loading the client framework, and checking if
  the page correctly recognizes its own URL.

  Ran 1 shell command (ctrl+o to expand)

● Opened from files, a post and the home page each match their own URL and not
  another page's. Updating the R1 notes and running the full suite:

  Ran 1 shell command (ctrl+o to expand)

● ponder pages built with --live true now record where the site's root is, so a
  live page recognises itself even when opened from a file. I checked this in
  Chromium against the --live build: a post and the home page, opened as files,
  each matched their own URL on https://ponder.org.uk and not another page's.
  All tests pass: the full suite at 1818/1818, both server tests, and
  FluidViewTests.html in headless Chromium. Lint is clean in both repos, and
  nothing is committed.

  How it works:
  - Server: when a page belongs to a site with a base URL, the server stamps the
    relative path to the site's root on its <html> element at creation, for
    example fluid-site-root="../../" for post/x/. Rendering the template's root
    onto that element leaves the attribute alone, because the reconciler only
    removes attributes the template wrote itself.
  - Client: resolves the attribute against its own address to find where the
    site's root is locally, then compares the page's path below that root with
    its documentLocation. This works on the live site, a local server, or files.
    A page without the attribute falls back to the base-URL-path comparison
    from last time.

  Code changes:
  - Shared helpers: the path helpers moved into core so both sides use the same
    ones: fluid.pagePathOf, fluid.pageUrlOf, fluid.siteDirectoryOf (new),
    fluid.sitePathOf and fluid.relativeSiteRoot (new). There's also a
    fluid.siteRootAttribute constant holding "fluid-site-root".
  - Server side: fluid.createOutputDocument takes an optional baseURL, which
    fluid.outputDocumentView now passes.
  - ponder: the static build strips the attribute along with the other material
    that only matters for making a page live, so docs-infusion/ stays
    byte-for-byte unchanged. A --live true build keeps it: I checked ./ on the
    home page and 404.html, ../ on post/ and ../../ on the page/1/ redirects.

  Tests:
  - Server test: checks that the record is right for pages at different depths,
    absent for pages outside the site or with no base URL, and still present
    after the page re-renders.
  - Client test: a page that records its root as its parent folder matches its
    location under an unrelated base URL, as a file preview does. It also checks
    fluid.relativeSiteRoot.

  The R1 notes in REQUIREMENTS.md describe the record and when the static build
  strips it.

✻ Cogitated for 4m 53s · done 10:13

❯ The fit system in FluidSignals.js seems to be a big overapproximation - it    
  succeeds in its goals of preventing bidirectional arcs from causing cyclic    
  activation within the same update but it seems many thousands of these        
  records are created where reasonably they could be coalesced. Consider some   
  alternative approaches for coalescing them whilst preserving the              
  bidirectional behaviour and benchmark how many fewer fits can be constructed  
  during the ponder build and any resulting speedup                             

● I'll start by reading the fit machinery in FluidSignals.js:
  Searched for 2 patterns, read 1 file (ctrl+o to expand)

● I've traced how fluid.cell.update triggers fits via enlistInFit, starting a
  new fit (and two signal writes) whenever neither target nor sources are
  already active, and these mostly stem from lazy pulls rather than set().
  Before exploring fixes, I'll instrument the fit functions with a scratch
  runner to measure where fits actually originate during the ponder build.

  Ran 4 shell commands (ctrl+o to expand)

● In the baseline build, 199,013 fits start, but none of them guard a
  bidirectional arc, confirming this scenario never occurs. I'll now prototype
  alternative patches via the runner and compare fit counts, timing, and output
  byte-identity.

  Ran 1 shell command (ctrl+o to expand)

● I've compiled benchmark results across the four variants. Now I'll dig into
  why the ambient fit variant produces one differing output file.

  Ran 1 shell command (ctrl+o to expand)

● Sharing a single fit across unrelated pulls loses figure islands, confirming
  the expected risk, so I'll drop that variant—both lazy variants otherwise
  match. I'll refine further: letting set() skip starting a fit when there's no
  source marker (unless the cell is already in one) and making sure async edges
  get counted too.

  Ran 1 shell command (ctrl+o to expand)

● Combined variant C cuts fits to 66 (one per page plus a few) while keeping
  output byte-identical, though wall-clock gains are lost in runner overhead.
  I'll implement C in FluidSignals.js, saving a backup copy first for proper
  timing and correctness checks against the signal tests.

  Ran 1 shell command (ctrl+o to expand)

● The suite normally takes about 16 seconds and this run hung, so something
  under C waits forever or loops. Stopping it and checking where it stuck:

  Ran 2 shell commands (ctrl+o to expand)

● Background command "Implement lazy fits in FluidSignals.js and run tests"
completed (exit code 0)

● Running the signal test files one at a time, with timeouts, to find the hang:

  Ran 2 shell commands (ctrl+o to expand)

● No test in either file finishes, so the first test must hang. Looking at it:

  Ran 1 shell command (ctrl+o to expand)

● The first test is the Celsius/Fahrenheit pair, the canonical bidirectional
  case. Reproducing it in a standalone script, with a cap on stabilization
  passes, to see where it loops:

  Ran 4 shell commands (ctrl+o to expand)

● Found the hang: fluid.cell.findFit loops forever on a dirty-chain cycle
  created by the bidirectional pair, which only surfaces once a cell lacks a
  fit. I'll add cycle protection to the walk and limit it to edges with a source
  condition.

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/FluidSignals.js"…)
  ⎿  exit 0
     after F computed 59 15
     after C computed 59 15
     … +8 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidSignals.js (+13 -3)
      930      };
      931  
      932      // Utility temporarily required because fits are not prope
           rly propagating across linked updates
      933 +    /**                                                       
      934 +     * Find the fit in which a cell is enlisted, or else that 
          +of the nearest cell along the chain from which it was         
      935 +     * dirtied. The chain may be cyclic, e.g. across a bidirec
          +tional arc, of whose cells none is enlisted.                  
      936 +     * @param {Cell} cell - The cell whose fit is to be found 
      937 +     * @return {Fit|undefined} The fit, if any                
      938 +     */                                                       
      939      fluid.cell.findFit = function (cell) {
      934 -        while (cell) {                                        
      940 +        const visited = new Set();                            
      941 +        let togo;                                             
      942 +        while (cell && togo === undefined && !visited.has(cell
          +)) {                                                          
      943 +            visited.add(cell);                                
      944              if (cell._fit !== null) {
      936 -                return cell._fit;                             
      945 +                togo = cell._fit;                             
      946              }
      947              cell = cell._dirtyFrom;
      948          }
      949 +        return togo;                                          
      950      };
      951  
      952      /**
     ...
      982              const args = inEdge.staticSources ? inEdge.staticS
           ources.map(mapArg) : [];
      983              const {unavailable} = fluid.cell.mapSignalArgs(arg
           s, cell._value);
      984  
      975 -            const fit = fluid.cell.findFit(cell);             
      985 +            const fit = inEdge.excludeSource || inEdge.include
          +Source ? fluid.cell.findFit(cell) : undefined;                
      986  
      987              // Skip notification if the fit has an excluded so
           urce
      988              if (inEdge.excludeSource) {
  ⎿  (timeout 6m 40s)

● Signal tests pass now, including all the bidirectional cases. Full suite,
  server tests and lint:

  Ran 1 shell command (ctrl+o to expand)

● Everything passes: 1818/1818, and the ASSERTION FAILED lines come from tests
  that check failure cases. Running the browser demo tests too, since they
  exercise live async behaviour:

  Ran 1 shell command (ctrl+o to expand)

● The demo steps pass. My Chromium runner stopped early, because it matched
  "completed" in a progress message. Fixing the match:

  Ran 1 shell command (ctrl+o to expand)

● Everything passes in Chromium too. Now I'll set up a scratch copy of Infusion
  with the old FluidSignals.js to benchmark both versions side by side,
  alternating builds for three runs each and writing all 66 pages to fresh
  folders.

  Ran 1 shell command (ctrl+o to expand)

● Wall time dropped about 10% (31.3s to 28.0s), but shared-folder I/O adds noise
  to the measurement, so I'll CPU-profile one build of each version for a
  cleaner comparison.

  Ran 1 shell command (ctrl+o to expand)

● The regex missed the functions' qualified names, such as fluid.cell.startFit.
  Fixing it:

  Ran 1 shell command (ctrl+o to expand)

● Self time in the fit functions dropped from 953 ms to 12 ms out of roughly 35
  s profiled, though that excludes calls they make like idleSignal writes. Now
  I'll measure inclusive time, counting samples where a fit function appears
  anywhere on the stack.

  Ran 1 shell command (ctrl+o to expand)

● I implemented the lazy-fit approach (variant C) in FluidSignals.js. A ponder
  build now creates 67 fits instead of about 192,000, and the output is
  byte-identical (66/66 pages). The bidirectional behaviour still holds: all
  tests pass (1818/1818 under node; the signal and view tests also in Chromium;
  the 20 browser demo steps; both server tests), and lint is clean. The speedup
  is small, about 4% of CPU. Nothing is committed, and the old version is saved
  at /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-97d2-445d
  -8bfc-4f99019ddb5a/scratchpad/FluidSignals.baseline.js.

  Where the fits came from. Counting during a baseline build:

  ┌────────────────────────────────────────────────────────────────┬─────────┐
  │                            Measure                             │  Count  │
  ├────────────────────────────────────────────────────────────────┼─────────┤
  │ Fits started                                                   │ 199,013 │
  ├────────────────────────────────────────────────────────────────┼─────────┤
  │ … by update() when no fit was active on the target or any      │ 175,623 │
  │ source (mostly first pulls of new cells)                       │         │
  ├────────────────────────────────────────────────────────────────┼─────────┤
  │ … by set()                                                     │ 23,390  │
  ├────────────────────────────────────────────────────────────────┼─────────┤
  │ Merges of one fit into another                                 │ 24,622  │
  ├────────────────────────────────────────────────────────────────┼─────────┤
  │ Fits protecting an edge that has a reverse arc                 │ 0       │
  └────────────────────────────────────────────────────────────────┴─────────┘

  So you were right: in this build none of the fits was doing the job they exist
  for.

  Alternatives benchmarked (the first three prototyped as patches in a scratch
  runner; the 66 pages compared each time):

  Approach: A. Ambient fit: unrelated pulls share one open fit
  Fits: 95,584
  Output: wrong
  Notes: One page lost two figure islands. A shared fit makes each merge clear
  protection marks for unrelated cells too. Rejected.
  ────────────────────────────────────────
  Approach: B. Lazy pulls: no fit unless the update meets an active fit or an
  edge with a reverse arc; effects always get one
  Fits: 57,118
  Output: identical
  Notes:
  ────────────────────────────────────────
  Approach: B′. As B, but an effect gets a fit only once it is pending, since
  only then can it hold one open
  Fits: 22,721
  Output: identical
  Notes: The remaining fits nearly all come from set()
  ────────────────────────────────────────
  Approach: C. As B′, and set() starts a fit only when it carries a source 
  marker
  Fits: 67
  Output: identical
  Notes: Implemented

  C is consistent because under the lazy rule a fit only protects anything if it
  covers a reverse arc, and any update across one is still put in a fit. Apart
  from that, a fit only carries source markers or holds pending effects open,
  and C keeps both. Async updates always get a fit, as before.

  Speed:
  - CPU profile: samples with fit code on the stack fell from 1,408 ms of 34.8 s
    (4.0%) to 70 ms (0.2%). That is the real saving, about 1.3 s per build.
  - Wall time: three alternating runs averaged 31.3 s before and 28.0 s after.
    One profiled pair came out the other way round, though, so the spread from
    file I/O on the shared folder is bigger than the gain. Nothing else changed
    noticeably.

  A latent bug this exposed: fluid.cell.findFit walks a cell's _dirtyFrom chain
  looking for a fit. Across a bidirectional pair that chain is a cycle (C → F →
  C). It never mattered before, because the cell being updated always had a fit,
  but with lazy fits the Celsius/Fahrenheit test hung. It now stops at a cell
  it has already visited, and is only called for edges with includeSource or
  excludeSource.

  Where C differs from before:
  - Reverse arcs found late: C detects a reverse arc from edges that already
    exist, by static sources or sources already computed. Before, every update
    marked its sources, so it also covered a reverse dependency that was first
    read later in the same update. No test does this, but it is a narrower
    guarantee.
  - Pending marks: cells never put in a fit don't have their _prePendingState
    cleared when a fit ends. Only async-related cells set it, and those still
    get fits; the async tests pass.

  Possible next step: where fits are still needed, the cost of clearing marks
  when a fit ends could be avoided by stamping each mark with a fit number
  instead of storing lists that must be emptied. With 67 fits left there's
  little to gain in ponder; it would only matter in apps with many genuine
  bidirectional updates.

✻ Crunched for 33m 25s · done 10:49

※ recap: You asked me to reduce how many fits FluidSignals.js creates during the ponder build: the lazy-fit change cuts them from about 192,000 to 67, with identical output, all tests passing and roughly 4% less CPU. Next, you can review the change and decide whether to keep it. (disable recaps in /config)
❯ add a test for a reverse arc discovered late in the update                    

● First I'll check whether a reverse arc found late in an update even behaves
  differently under the new fits. A dependency that only appears partway through
  an update only matters if the cell it reads then changes again within that
  same update. So the scenario needs:

  - a forward arc B = 10·A;
  - a reverse arc from A to B that A's computation reads only when a gate is
    open;
  - the gate opening, and B changing a second time, within one update.

  I'll run candidate scenarios against both the old and new FluidSignals.js:

  Ran 1 shell command (ctrl+o to expand)

● I found that neither test exercised the reverse leg since A was never
  computed. I'll make A a computed cell driven by a mode cell—sourcing from seed
  when "own" and from B when "linked"—then update B again via a second source X
  in the same pass.

  Ran 1 shell command (ctrl+o to expand)

● Both versions behave the same because any recompute of B revisits needsFit,
  which already accounts for A's new dependency, so marks never linger
  improperly. I'll write a test for the three-effect stabilization scenario and
  run it on both versions to compare how often each edge executes.

  Ran 1 shell command (ctrl+o to expand)

● Both versions agree so far, but a faithful inverse could mask a hidden cyclic
  re-activation since values stay the same. I'll run two more checks: an
  unfaithful inverse that exposes extra traversals through changed values, and a
  deliberately broken copy to confirm the test catches a missing reverse-arc
  mark.

  Ran 1 shell command (ctrl+o to expand)

● This confirms the old and new versions match while the broken copy fails
  (looping on the reverse edge), so I'll use this as the test, adding a guard
  against hangs on the unfaithful case. Now locating where the bidirectional
  tests end.

  Ran 1 shell command (ctrl+o to expand)

● Update(tests/framework-tests/core/js/FluidSignalsTests.js)
  ⎿  Added 68 lines
      150      assert.nearEqual(kelvinCell.get(), 373.15, "Spread from Fa
           hrenheit to Kelvin");
      151  });
      152  
      153 +/**                                                           
      154 + * Construct a bidirectional pair whose reverse leg is a dynam
          +ic dependency, only discovered part way through the           
      155 + * update which traverses its forward leg. B is computed from 
          +A and a further source X. A is computed from `seed`           
      156 + * until `mode` becomes "linked", whereupon it is computed fro
          +m B instead - the reverse leg. A single update sets `seed`    
      157 + * and links the pair, and within the same stabilization an ef
          +fect on `mode` changes X.                                     
      158 + * @param {Number} offset - Added by the reverse leg to its in
          +verse of the forward leg, which is faithful if it is 0        
      159 + * @return {Object} The number of times each leg was traversed
          + by the update, the values seen by effects on A and B,        
      160 + * and their final values                                     
      161 + */                                                           
      162 +fluid.tests.lateReverseArc = function (offset) {              
      163 +    const seed = fluid.cell(1, {name: "seed"}), mode = fluid.c
          +ell("own", {name: "mode"}), x = fluid.cell(0, {name: "X"});   
      164 +    const a = fluid.cell(undefined, {name: "A"}), b = fluid.ce
          +ll(undefined, {name: "B"});                                   
      165 +    const runs = {forward: 0, reverse: 0};                    
      166 +    b.computed((aValue, xValue) => {                          
      167 +        runs.forward++;                                       
      168 +        return aValue * 10 + xValue;                          
      169 +    }, [a, x]);                                               
      170 +    a.computed(() => {                                        
      171 +        let togo;                                             
      172 +        if (mode.get() === "linked") {                        
      173 +            runs.reverse++;                                   
      174 +            // Guard against a cycle, which would otherwise ne
          +ver terminate for an unfaithful inverse                       
      175 +            togo = runs.reverse > 10 ? fluid.unavailable("Runa
          +way reverse leg") : (b.get() - x.get()) / 10 + offset;        
      176 +        } else {                                              
      177 +            togo = seed.get();                                
      178 +        }                                                     
      179 +        return togo;                                          
      180 +    }, []);                                                   
      181 +    const bSeen = [], aSeen = [];                             
      182 +    const effects = [                                         
      183 +        fluid.cell.effect(bValue => bSeen.push(bValue), [b], {
          +name: "bEffect"}),                                            
      184 +        fluid.cell.effect(aValue => aSeen.push(aValue), [a], {
          +name: "aEffect"}),                                            
      185 +        fluid.cell.effect(modeValue => {                      
      186 +            if (modeValue === "linked") {                     
      187 +                x.set(5);                                     
      188 +            }                                                 
      189 +        }, [mode], {name: "modeEffect"})                      
      190 +    ];                                                        
      191 +    fluid.cell.stabilize();                                   
      192 +    runs.forward = 0;                                         
      193 +    runs.reverse = 0;                                         
      194 +    bSeen.length = 0;                                         
      195 +    aSeen.length = 0;                                         
      196 +                                                              
      197 +    seed.set(2);                                              
      198 +    mode.set("linked");                                       
      199 +    fluid.cell.stabilize();                                   
      200 +    const togo = {runs: {...runs}, bSeen, aSeen, a: a.get(), b
          +: b.get()};                                                   
      201 +    effects.forEach(effect => effect.dispose());              
      202 +    return togo;                                              
      203 +};                                                            
      204 +                                                              
      205 +QUnit.test("Bidirectional tests - reverse leg discovered late 
          +in the update", assert => {                                   
      206 +    // Whether the forward leg was traversed in a fit is decid
          +ed as it is traversed, by whether the leg has a reverse       
      207 +    // arc - see fluid.cell.needsFit. Here the reverse arc onl
          +y appears once A is recomputed from B, after B was first      
      208 +    // computed from A in the same update. B's further update 
          +from X must then still not be relayed back to A.              
      209 +    const faithful = fluid.tests.lateReverseArc(0);           
      210 +    assert.deepEqual(faithful.runs, {forward: 1, reverse: 1}, 
          +"Each leg traversed once - no cyclic activation of the reverse
          + leg");                                                       
      211 +    assert.deepEqual([faithful.aSeen, faithful.bSeen], [[1], [
          +15]], "Effects notified once each");                          
      212 +    assert.deepEqual([faithful.a, faithful.b], [1, 15], "Value
          +s consistent across the pair");                               
      213 +                                                              
      214 +    // An unfaithful inverse would change A, and so B, on each
          + traversal of the cycle                                       
      215 +    const unfaithful = fluid.tests.lateReverseArc(1);         
      216 +    assert.deepEqual(unfaithful.runs, {forward: 2, reverse: 1}
          +, "Reverse leg traversed once, forward leg once on either side
          + of it");                                                     
      217 +    assert.deepEqual([unfaithful.aSeen, unfaithful.bSeen], [[2
          +], [20, 25]], "Effects notified of each value once");         
      218 +    assert.deepEqual([unfaithful.a, unfaithful.b], [2, 25], "C
          +ycle broken after one traversal of the reverse leg");         
      219 +});                                                           
      220 +                                                              
      221  /*
      222  QUnit.test("Genuine cyclicity with monotonicity is acceptable"
           , assert => {
      223  

● I'll verify fluid.tests exists in this file, then copy the test files into
  both scratch versions so the old and broken copies can be tested alongside the
  new one.

  Ran 1 shell command (ctrl+o to expand)

● Turns out my expected value was wrong, not the code—A ends at 1 since the new
  seed is ignored once the pair is linked, so its effect never fires. I'll fix
  the test's expectation accordingly.

● Update(tests/framework-tests/core/js/FluidSignalsTests.js)
  ⎿  Added 1 line, removed 1 line
      208      // computed from A in the same update. B's further update 
           from X must then still not be relayed back to A.
      209      const faithful = fluid.tests.lateReverseArc(0);
      210      assert.deepEqual(faithful.runs, {forward: 1, reverse: 1}, 
           "Each leg traversed once - no cyclic activation of the reverse
            leg");
      211 -    assert.deepEqual([faithful.aSeen, faithful.bSeen], [[1], [
          -15]], "Effects notified once each");                          
      211 +    assert.deepEqual([faithful.aSeen, faithful.bSeen], [[], [1
          +5]], "A's value is unchanged, so only B's effect is notified, 
          +once");                                                       
      212      assert.deepEqual([faithful.a, faithful.b], [1, 15], "Value
           s consistent across the pair");
      213  
      214      // An unfaithful inverse would change A, and so B, on each
            traversal of the cycle

  Ran 1 shell command (ctrl+o to expand)

● The new test passes on old/new versions and in Chromium, fails as expected on
  the broken copy—the EPIPE error was just a harmless pipe-closing artifact.
  Running the full suite again to confirm.

  Ran 1 shell command (ctrl+o to expand)

● I added the test "Bidirectional tests - reverse leg discovered late in the
  update" to FluidSignalsTests.js. It passes on both the new lazy-fit code and
  the old FluidSignals.js. It fails on a deliberately broken copy that never
  detects reverse arcs, so it does catch a missing protection. The full suite
  passes (1824/1824), the file passes in Chromium too, and lint is clean.

  The scenario, built by a helper fluid.tests.lateReverseArc(offset):
  - B is computed from A and from a second cell X.
  - A is computed from a seed cell until a mode cell becomes "linked"; after
    that it is computed from B instead. That is the reverse leg, which only
    appears partway through the update.
  - One update sets seed and links the pair. In the same stabilization, an
    effect on mode changes X, so B changes again after A has started reading it.
  - The test counts how often each edge runs and records what effects on A and B
    see.

  It runs this twice:
  - Faithful inverse: each leg runs exactly once, A stays at 1 and B becomes 15.
    The broken copy runs the reverse leg twice.
  - Inverse that's off by one: here every extra trip around the cycle would
    change the values. The expected result is one reverse traversal, A = 2 and B
    = 25. The broken copy never stops here, so the helper gives up after 10
    reverse runs, and a regression fails the test instead of hanging the suite.

  This settles the caveat I raised last time: in this case the new code's
  protection is as strong as the old. Each time B is recomputed, needsFit checks
  again and sees A's new dependency on B, so B is protected before it commits.
  Directly setting B clears the protection in both versions anyway.

  One correction while writing it: I had expected the effect on A to fire once
  in the faithful case. Both versions agreed it doesn't, because A's value
  doesn't change, so I changed the expectation rather than the code.

  Nothing is committed.

✻ Sautéed for 5m 13s · done 11:01

❯ Hugo is capable of building this site in 3504ms from this mount, so we are    
  about a factor of 8 away from parity. I accept that JS raw file I/O will      
  never equal what can be done from Go, but it would be great to be somewhere   
  in the ballpark of a 2-3x slowdown. Can you determine/comment whether the     
  remaining discrepancy is largely explained by JS' poorer I/O stack, excessive 
  reactive recomputations of material that could be better cached, overhead     
  in-memory of the reactive system or IL's book-keeping (scopes and scope       
  updates) etc. or some other kind of cause                                     

● I'll answer this by measuring rather than guessing. One instrumented build
  will record:

  - time per build phase;
  - time spent in synchronous file I/O;
  - counts of cells, recomputations and components.

  A fresh CPU profile, grouped by subsystem, will cover the rest. First I'm
  looking at who calls internalModuleStat, which took about 1 s in the last
  profile and looks suspicious:

  Ran 1 shell command (ctrl+o to expand)

● That startup slowness is just one-off module loading overhead, not a
  performance concern. Now checking the instrumented build's phase times, sync
  fs time, and reactive system counts.

  Ran 1 shell command (ctrl+o to expand)

● I/O, startup, and recomputation aren't the bottleneck—the real cost is 27.7s
  spent building and rendering components, averaging ~4.4ms per component. Next
  I'll break down the CPU profile by subsystem to pinpoint where that time goes.

  Ran 1 shell command (ctrl+o to expand)

● The settle phase is dominated by framework overhead (FluidSignals, FluidIL,
  Fluid.js each ~7.5s, plus GC), while DOM/markdown/parsing work totals under
  2s. Next I'll pinpoint the hottest individual functions.

  Ran 2 shell commands (ctrl+o to expand)

● I've identified several hotspots that scale with overall site size rather than
  actual work done: linear scans in removeParentObservers and
  updateIfNecessary, full map copies/refilters in updateAvailability, and heavy
  call volume into isPlainObject from layer merging. Next I'll measure how large
  these get—observer-list lengths, availability-map traffic, and inclusive
  times.

  Ran 1 shell command (ctrl+o to expand)

● I've found that observer-list scans (43M entries, 1.7s) and availability-map
  copying (0.38M keys via a slow destructuring path, 1.5s) both scale badly, but
  the biggest cost is flatMergedComputer's layer merging at 6.9s (18.8%). I'll
  dig into its code to see how much is redundant re-merging of the same layer
  stack across components.

  Ran 1 shell command (ctrl+o to expand)

● I'll count the number of merges and distinct layer chains across the 6,279
  components to determine how many unique stacks actually exist.

  Ran 1 shell command (ctrl+o to expand)

● Merging turns out to be highly redundant: 19,150 calls to mergeLayerRecords
  (4.9s) resolve down to just 59 distinct layer chains across 9,815 resolutions,
  with 70% of merged records being layer definitions that produce identical
  results each time. Next, I'll check what the 41 cells per component represent
  by grouping cells by name as they're created.

  Ran 1 shell command (ctrl+o to expand)
● Mostly none of the causes you listed, except IL book-keeping, which is about
  60% of the cost. A build is roughly 30 s against Hugo's 3.5 s:

  - JS's I/O stack: about 3 s, which is 10% or less.
  - Reactive recomputation: small. The graph mostly computes each cell once.
  - The rest: almost all of it is the cost of building the component tree. The
    site becomes 6,279 components and 259,000 cells for 66 pages, and each cell
    carries reactive overhead. The biggest single part of that is IL
    book-keeping: merging layers and resolving references, per component.

  I measured this with phase timers, timers on synchronous fs calls, counters in
  the signal and IL code, and a CPU profile. I changed no Infusion or ponder
  code for this; the measuring scripts are in the scratchpad.

  Where one build's time goes

  Category: Startup and I/O
  Approx. time: ~3 s
  Evidence: Loading Infusion's npm modules 1.7 s (mostly linkedom's many small
  files on this shared folder); all synchronous fs calls 1.24 s (reads 0.65 s,
  copying static files 0.34 s)
  ────────────────────────────────────────
  Category: Content pipeline (TOML, front matter, markdown)
  Approx. time: ~1 s
  Evidence: siteModel.load 0.98 s
  ────────────────────────────────────────
  Category: DOM, serializing and writing
  Approx. time: ~1.2 s
  Evidence: linkedom 1.0 s; writing 66 pages 0.18 s
  ────────────────────────────────────────
  Category: Building and rendering the component tree
  Approx. time: ~27.7 s
  Evidence: Everything inside writeOutputDocumentsWhenSettled before the writing

  starts

  Within those 27.7 s, the CPU profile divides as:

  ┌──────────────────────────────────────────────────┬──────────────┬───────┐
  │                       Area                       │  Profiled    │ Share │
  │                                                  │     time     │       │
  ├──────────────────────────────────────────────────┼──────────────┼───────┤
  │ FluidSignals.js                                  │ 7.6 s        │ 21%   │
  ├──────────────────────────────────────────────────┼──────────────┼───────┤
  │ FluidIL.js                                       │ 7.6 s        │ 21%   │
  ├──────────────────────────────────────────────────┼──────────────┼───────┤
  │ Fluid.js (layer merging)                         │ 7.4 s        │ 20%   │
  ├──────────────────────────────────────────────────┼──────────────┼───────┤
  │ Garbage collection                               │ 3.5 s        │ 10%   │
  ├──────────────────────────────────────────────────┼──────────────┼───────┤
  │ FluidCore.js                                     │ 1.9 s        │ 5%    │
  ├──────────────────────────────────────────────────┼──────────────┼───────┤
  │ FluidView.js (template activation and            │ 1.9 s        │ 5%    │
  │ reconciliation)                                  │              │       │
  └──────────────────────────────────────────────────┴──────────────┴───────┘

  Recomputation is not the problem. There were 220,000 updates for 178,000
  cells, only 24% more than one each. 82% of cells were computed exactly once,
  and the most-updated cell (a scopeTick) ran 65 times. The fit change already
  removed the one large over-approximation.

  The cost is volume times per-unit overhead. That's about 41 cells and 4.4 ms
  per component, and about 125 µs per cell update. The cells break down as:

  - Resolving references and arguments, about 115,000 cells (44%): flattened 
    argument 29k, fetchContextReference 26k plus 9k bareValue cells, $sitedRef
    26k, resolveFuncReference 19k and resolveContext 5.6k. Every reference gets
    its own reactive cell in every component, including references to things
    that never change during a build. For example, each of thousands of
    components builds its own cells for {site}.config.baseURL.
  - Fixed book-keeping, 13 cells per component, about 81,000 in all: potentia,
    flatMergedComputer, computeInstance, availableInstance, scopeTick,
    ownScopeTick, scopeEffect, trackComponentAvailability, $effectScheduler and
    others.
  - View cells, about 28,000: element signals, string templates, attribute
    bindings.

  Material that could be cached. Layer merging runs again in every component.
  flatMergedComputer takes 6.9 s inclusive, and 4.9 s of that is in
  mergeLayerRecords. Across 9,815 merges there are only 59 distinct chains of 
  layer definitions: one is used 2,202 times, and the top 20 cover almost every
  component. 70% of the 106,000 records merged are definitions whose result is
  the same every time a chain is merged. Merging each chain's definitions once
  and merging only each component's own records on top should save most of that
  time.

  Two costs that grow faster than the site:
  - Removing observers: fluid.cell.removeParentObservers scans a source's whole
    observer list. The layer-definition cells are read by nearly every
    component's merge, so fluid.component's has 18,853 observers, and the build
    scans 43 million entries (1.7 s). An index or a Set would make each removal
    constant-time.
  - The availability map: updateAvailability copies the whole
    fluid.unavailableComponentMap (up to 578 keys) on each of about 1,250
    changes. The copying uses a slow rest-destructuring path, costing 1.5 s. A
    counted set, or changing the map in place and notifying, would remove it.
  - A smaller candidate: updateIfNecessary (1.2 s self) and markStale keep
    visited lists as arrays checked with includes. They may grow the same way on
    large graphs; I didn't measure their sizes.

  What closing the gap would take. Your 2–3× target is 7–10 s. With about 4–5 s
  of startup, I/O, content and DOM work that JS can't avoid, that leaves 3–5 s
  for the component tree, which now takes 27.7 s.

  - Targeted fixes:
    - observer removal, about −1.7 s;
    - the availability map, about −1.5 s;
    - caching merged definitions per chain, about −4 to −5 s;
    - less allocation churn, which also cuts garbage collection.

    Together that's probably 8–10 s off, bringing a build to about 20 s, or
    roughly 5–6× Hugo.
  - The rest is structural. Reaching 2–3× means much less per-component
    machinery in a one-shot build. Options, roughly in order of payoff:
    a. Treat references to values that can't change during the build
       (configuration, page records) as plain values, not one reactive cell per
       reference per component. That would remove a large part of the 115,000
       reference cells.
    b. Share each component's 13 fixed book-keeping cells, or create them only
       when needed. Most components in a static build never become unavailable
       or change their layers.
    c. Render simple repeated pieces, such as tag links, nav items and footer
       scripts, as plain template output rather than full components.

  I/O, for comparison. Hugo also has to read 380 files and copy 206 static
  files. Our synchronous I/O for that is 1.24 s, which isn't far from what Go
  would need on this mount. The 1.7 s of module loading is the one I/O cost
  that's really JS's. It would mostly go if node_modules lived off the shared
  folder or the server build were bundled into one file.

✻ Brewed for 5m 44s · done 11:10

❯ fix the observer removal and availability map hotspots as well as caching     
  merged definitions per chain                                                  

● I'll start by finding every use of _observers, since the observer-removal fix
  changes its data structure:

  Searched for 1 pattern (ctrl+o to expand)

● I found all usages are confined to FluidSignals.js, and since sources aren't
  deduplicated, the fix needs to count occurrences per observer while preserving
  insertion order for notifications. I'll implement this with a Map tracking
  observer-to-count.

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/FluidSignals.js"…)
  ⎿  147:     * @property {Map<Cell, Number>|null} _observers - Cells that
     have us as sources (out links), in the order in which
     194:        cell._observers = null; // nodes that have us as sources (
     … +13 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidSignals.js (+38 -25)
      144       * @property {CacheState} _state - The cache state of the 
           cell (clean, check, or dirty).
      145       * @property {CacheState} _prePendingState - A "high water
           mark" of our _state at the point we went into a pending state
      146       * @property {Cell|null} _dirtyFrom - Cell from along whic
           h we were dirtied
      147 -     * @property {Cell[]|null} _observers - Cells that have us
          - as sources (out links)                                       
      147 +     * @property {Map<Cell, Number>|null} _observers - Cells t
          +hat have us as sources (out links), in the order in which     
      148 +     * they began to observe us, each with the number of times
          + it does so - see fluid.cell.addObserver                      
      149       * @property {Edge[]|null} _inEdges - Array of incoming ed
           ges which could update this node
      150       * @property {Cell[]|null} _consumedSources - Sources from
            which arcs have been traversed during this fit
      151       * @property {CellTrackingRecord|null} _trackingRecord - C
           aptures dynamic dependency tracking information for an update 
           which is in progress
     ...
      212  
      213      fluid.cell.cellId = 0;
      214  
      215 +    /**                                                       
      216 +     * Record that a cell observes a source, once more. Since 
          +an edge's sources are not deduplicated, a cell may observe    
      217 +     * the same source several times, and is counted each time
          +, so that it remains an observer until it has been            
      218 +     * removed as many times as it was added. A map is used ra
          +ther than an array of observers since a widely-shared         
      219 +     * source, e.g. the definition of a base layer, may acquir
          +e tens of thousands of observers, from which each removal     
      220 +     * would otherwise be a linear search.                    
      221 +     * @param {Cell} source - The cell which is observed      
      222 +     * @param {Cell} observer - The cell which observes it    
      223 +     */                                                       
      224 +    fluid.cell.addObserver = function (source, observer) {    
      225 +        if (!source._observers) {                             
      226 +            source._observers = new Map();                    
      227 +        }                                                     
      228 +        source._observers.set(observer, (source._observers.get
          +(observer) || 0) + 1);                                        
      229 +    };                                                        
      230 +                                                              
      231 +    /**                                                       
      232 +     * Withdraw one record that a cell observes a source - see
          + fluid.cell.addObserver                                       
      233 +     * @param {Cell} source - The cell which is observed      
      234 +     * @param {Cell} observer - The cell which observes it    
      235 +     */                                                       
      236 +    fluid.cell.removeObserver = function (source, observer) { 
      237 +        const count = source._observers?.get(observer);       
      238 +        if (count === 1) {                                    
      239 +            source._observers.delete(observer);               
      240 +        } else if (count !== undefined) {                     
      241 +            source._observers.set(observer, count - 1);       
      242 +        }                                                     
     … 65 more lines (ctrl+o to expand)

  Ran 1 shell command (ctrl+o to expand)

● Signal tests pass. Next, the availability map. First, who reads it:

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● I'll fix this by storing unavailable paths in a mutable object with a version
  counter that internal readers depend on, while keeping
  fluid.unavailableComponentMap as a computed copy generated only on read for
  backward compatibility.

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/FluidIL.js"…)
  ⎿  LINT-OK
     11:15:38.212:   fq:  All tests concluded: 295/295 total passed in 1255
     ms - PASS
     … +3 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidIL.js (+25 -17)
      2796  
      2797      // Unavailable component tracking - used to determine whe
            ther server-side has stabilised and is ready to be written
      2798  
      2799 -    fluid.unavailableComponentMap = fluid.cell(Object.create(
           -null), {name: "Fluid global unavailable component map"});    
      2799 +    // The paths of the components which are currently unavai
           +lable, maintained in place by                                
      2800 +    // fluid.trackComponentAvailability - each change is sign
           +alled by fluid.unavailableComponentsVersion. A system with   
      2801 +    // many thousands of components, e.g. a site rendered as 
           +one tree, changes the set many times whilst it is            
      2802 +    // constructed, and copying it on each change would cost 
           +time quadratic in its size                                   
      2803 +    /** @type {Object<String, Boolean>} */                   
      2804 +    fluid.unavailableComponentPaths = Object.create(null);   
      2805  
      2806 +    fluid.unavailableComponentsVersion = fluid.cell(0, {name:
           + "Fluid global unavailable components version"});            
      2807 +                                                             
      2808 +    // A copy of fluid.unavailableComponentPaths, made only w
           +hen read after it has changed                                
      2809 +    fluid.unavailableComponentMap = fluid.cell(undefined, {na
           +me: "Fluid global unavailable component map"}).computed(() =>
      2810 +        Object.assign(Object.create(null), fluid.unavailableC
           +omponentPaths), [fluid.unavailableComponentsVersion]);       
      2811 +                                                             
      2812      // Allocated with an undefined value so that it is evalua
            ted when first read, rather than its initial value being
      2813      // trusted until the map first changes
      2803 -    fluid.unavailableComponents = fluid.cell(undefined, {name
           -: "Fluid global unavailable components"}).computed(unavailabl
           -eComponentMap => {                                           
      2804 -        const keys = Object.keys(unavailableComponentMap);   
      2814 +    fluid.unavailableComponents = fluid.cell(undefined, {name
           +: "Fluid global unavailable components"}).computed(() => {   
      2815 +        const keys = Object.keys(fluid.unavailableComponentPa
           +ths);                                                        
      2816          // Pending rather than an error - a component is typi
            cally unavailable whilst its layers are loading
      2817          return keys.length === 0 ? true : fluid.unavailable({
            message: "Some components are unavailable", paths: keys}, "pe
            nding");
      2807 -    }, [fluid.unavailableComponentMap]);                     
      2818 +    }, [fluid.unavailableComponentsVersion]);                
      2819  
      2820      /**
      2810 -     * Track whether a component is available in `fluid.unava
           -ilableComponentMap`, keyed by its path, so that              
      2821 +     * Track whether a component is available in `fluid.unava
           +ilableComponentPaths`, keyed by its path, so that            
      2822       * `fluid.unavailableComponents` reports whether any comp
            onent in the system is unavailable
      2823       * @param {Shadow} shadow - The shadow of the component t
            o be tracked
      2824       * @return {Effect} An effect maintaining the component's
             entry, which removes it when disposed
      2825       */
      2826      fluid.trackComponentAvailability = function (shadow) {
      2827          const updateAvailability = function (instance) {
      2817 -            const currentMap = fluid.unavailableComponentMap.
           -_value;                                                      
      2818 -            const currentEntry = currentMap[shadow.path];    
      2828 +            const paths = fluid.unavailableComponentPaths;   
     … 23 more lines (ctrl+o to expand)
  ⎿  Updated src/framework/server/server-support.js (+3 -3)
      214   * @return {Cell<Boolean>} A signal which holds `true` if no s
           uch component is unavailable, and is otherwise unavailable
      215   */
      216  fluid.documentComponentsAvailable = function (dokkument) {
      217 -    return fluid.cell(undefined, {name: `Components available 
          -for ${fluid.documentLocation(dokkument)}`}).computed(unavailab
          -leComponentMap => {                                           
      218 -        const paths = Object.keys(unavailableComponentMap).fil
          -ter(componentPath => {                                        
      217 +    return fluid.cell(undefined, {name: `Components available 
          +for ${fluid.documentLocation(dokkument)}`}).computed(() => {  
      218 +        const paths = Object.keys(fluid.unavailableComponentPa
          +ths).filter(componentPath => {                                
      219              const shadow = fluid.globalInstantiator.pathToComp
           onent[componentPath];
      220              const found = shadow ? fluid.findDocument(shadow) 
           : undefined;
      221              return found === undefined || found === dokkument;
      222          });
      223          return paths.length === 0 ? true : fluid.unavailable({
           message: "Some components are unavailable", paths}, "pending")
           ;
      224 -    }, [fluid.unavailableComponentMap]);                      
      224 +    }, [fluid.unavailableComponentsVersion]);                 
      225  };
      226  
      227  /**
  ⎿  (timeout 6m 40s)

● Both fixes pass the IL and server tests. Next I'll tackle caching merged
  definitions per chain, starting by examining what fluid.mergeLayerRecords
  produces and whether the merge depends on the component.

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● The merge deep-merges records (strongest last), tracking provenance per path
  and collecting subcomponent records with names. I need to check whether the
  merged tree gets mutated afterward, since a cached result could end up shared
  across components.

  Ran 1 shell command (ctrl+o to expand)

● expandLayer reads the merged tree but writes results into a separate instance,
  so merged material can be shared. Next I'll check for any dependencies on
  merged nodes' parent pointers or on the contributions used by
  isSameSignalRecord.

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● Sharing a premerged definition layer wouldn't be exact, since the merge isn't
  associative in an edge case and would change the record names provenance and
  subcomponent collection rely on. Before deciding what to cache, I'll dig into
  what inside flatMergedComputer is actually expensive.

  Ran 1 shell command (ctrl+o to expand)

● Hierarchy resolution (resolve, 2.8 s) calls mergeLayerRecords too. If that
  inner merge covers only definitions, it is a pure function of the chain and
  can be cached exactly. Reading the resolver:

  Ran 2 shell commands (ctrl+o to expand)

● I found that hierarchy resolution computes merged on every call, but it's
  largely discarded—9,815 of 19,150 merges are wasted since flatMergedComputer
  redoes the merging itself using only mergeRecords. I'll now check all callers
  of resolve to confirm this.

  Searched for 2 patterns (ctrl+o to expand)

● The definition merge in resolve is dead code—its only intended reader no
  longer exists, and its side effect (sorting by priority) is already satisfied
  by how the records are built. I'll remove it rather than cache it.

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/Fluid.js"…)
  ⎿           */
             resolve(layerNames) {
                 const useLayerNames = layerNames.filter(layerName => !this
     … +5 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/Fluid.js (+6 -10)
      2403      /**
      2404       * @typedef {Object} MergedHierarchyResolution
      2405       * @property {MergeRecord[]} mergeRecords - The array of 
            merge records representing the merged layers and their priori
            ties.
      2406 -     * @property {LayerDef} merged - The final merged object 
           -representing the composite component definition.             
      2407 -     * @property {LayerMap} layerMap - A map of all paths in 
           -the merged object to their source layers.                    
      2406       */
      2407  
      2408      /**
     ...
      2791          };
      2792  
      2793          /**
      2796 -         * Resolve a component hierarchy by evaluating all si
           -gnals in the supplied flatDefs map,                          
      2797 -         * computing precedence, and producing merge records 
           -and a layer map suitable for instantiating the component.    
      2794 +         * Resolve a component hierarchy by evaluating all si
           +gnals in the supplied flatDefs map, and computing            
      2795 +         * precedence, producing the merge records of its def
           +initions in order of decreasing priority.                    
      2796           *
      2797           * @param {String[]} layerNames - The names of the to
            p-level layer to resolve.
      2800 -         * @return {MergedHierarchyResolution | Unavailable} 
           -An object containing `mergeRecords`, `merged`, and `layerMap`
           -,                                                            
      2798 +         * @return {MergedHierarchyResolution | Unavailable} 
           +An object containing `mergeRecords`,                         
      2799           *     or an `unavailable` signal if resolution could
             not be completed.
      2800           */
      2801          resolve(layerNames) {
     ...
      2818                      priority: fluid.mergeRecordTypes.defParen
            ts,
      2819                      layer: {$layers: order}
      2820                  });
      2823 -                const merged = {};                           
      2824 -                return {                                     
      2825 -                    // Note merged is currently only read by 
           -fluid.readDef                                                
      2826 -                    mergeRecords, merged, layerMap: fluid.mer
           -geLayerRecords(merged, mergeRecords)                         
      2827 -                };                                           
      2821 +                // The records are merged, together with thos
           +e of the component itself, by fluid.flatMergedComputer -     
      2822 +                // they are not merged here, since that merge
           + would be discarded                                          
      2823 +                return {mergeRecords};                       
      2824  
      2825              }
      2826          };
  ⎿  (timeout 10m)

● Tests pass. Next I'll implement per-chain caching for merged subtrees in
  fluid.mergeLayers—caching when every value at a key comes purely from
  definition records—but first I'm checking whether anything reads merged node
  metadata in a way that sharing would break.

  Searched for 3 patterns (ctrl+o to expand)

● One reader matters: fluid.get at FluidIL.js:966 uses move[$m] to describe a
  missing member. Checking what it does with a merged node's metadata:

  Searched for 1 pattern (ctrl+o to expand)

● Confirmed that sharing cached subtrees is safe since merged nodes only read
  their own $m, not a parent's. I'll do one more check before writing the code.

  Searched for 2 patterns, ran 1 shell command (ctrl+o to expand)

● $m is a symbol, so walking a layer map with Object.keys visits only the path
  keys. Writing the cache:

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/Fluid.js"…)
  ⎿  src/framework/core/js/FluidCore.js:60:    fluid.arrayEqual = function
     (array1, array2) {
     src/framework/core/js/Fluid.js:1017:    fluid.getRecInsist = function
     (root, segs) {
  ⎿  Updated src/framework/core/js/Fluid.js (+97 -5)
      2170      };
      2171  
      2172      /**
      2173 +     * Merge the material of several layers at a path into a 
           +fresh layer object - see `fluid.mergeLayers`                 
      2174 +     * @param {Object} target - The merged object of which th
           +is is a member                                               
      2175 +     * @param {String} key - The member's key                
      2176 +     * @param {String[]} segs - The path of the member within
           + the root being merged                                       
      2177 +     * @param {LayerMap} layerMap - The layer map of the root
           + being merged                                                
      2178 +     * @param {Array} newLayers - The material of each layer 
           +at the member, weakest first                                 
      2179 +     * @param {MergeRecord[]} mergeRecords - The merge record
           +s holding the layers                                         
      2180 +     * @return {Object} The merged member                    
      2181 +     */                                                      
      2182 +    fluid.mergeFreshMaterial = function (target, key, segs, l
           +ayerMap, newLayers, mergeRecords) {                          
      2183 +        const merged = fluid.makeLayer(key, target);         
      2184 +        // Record the material merged here, so that a fresh m
           +erge of the same material may be recognised as               
      2185 +        // equivalent - see fluid.isSameSignalRecord         
      2186 +        merged[$m].contributions = newLayers;                
      2187 +        fluid.mergeLayers(merged, segs, layerMap, newLayers, 
           +mergeRecords);                                               
      2188 +        return merged;                                       
      2189 +    };                                                       
      2190 +                                                             
      2191 +    /**                                                      
      2192 +     * Determine whether the material of several layers at a 
           +path is drawn solely from layer definitions, i.e. no         
      2193 +     * other layer, such as one supplied by a user record, a 
           +parent's subcomponent record or a live layer, contributes    
      2194 +     * anything there                                        
      2195 +     * @param {Array} newLayers - The material of each layer 
           +at the path, weakest first                                   
      2196 +     * @param {MergeRecord[]} mergeRecords - The merge record
           +s holding the layers                                         
      2197 +     * @return {Boolean} `true` if only layer definitions con
           +tribute material at the path                                 
      2198 +     */                                                      
      2199 +    fluid.isDefinitionMaterial = function (newLayers, mergeRe
           +cords) {                                                     
      2200 +        return newLayers.every((material, i) => material === 
           +undefined || mergeRecords[i].mergeRecordType === "def");     
      2201 +    };                                                       
      2202 +                                                             
      2203 +    // Merges of the material of layer definitions at a path,
           + keyed by the strongest such material - see                  
      2204 +    // fluid.mergeDefinitionMaterial                         
      2205 +    /** @type {WeakMap<Object, DefinitionMerge[]>} */        
      2206 +    fluid.definitionMergeCache = new WeakMap();              
      2207 +                                                             
      2208 +    /**                                                      
      2209 +     * @typedef {Object} DefinitionMerge                     
     … 76 more lines (ctrl+o to expand)
  Ran 2 shell commands (ctrl+o to expand)

● fluid.set creates prototype-free nodes, so the graft should match. I'll also
  read the local map with getRecInsist, which is pure, rather than fluid.get:

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/Fluid.js"…)
  ⎿  LINT-OK
     11:21:06.957:   fq:  All tests concluded: 1824/1824 total passed in 12
     458ms - PASS
     … +3 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/Fluid.js (+4 -4)
      2235          const entries = fluid.definitionMergeCache.get(strong
            est) || [];
      2236          let entry = entries.find(entry => fluid.arrayEqual(en
            try.materials, materials) && fluid.arrayEqual(entry.names, na
            mes));
      2237          if (!entry) {
      2238 -            const localMap = {};                             
      2238 +            const localMap = Object.create(null);            
      2239              const merged = fluid.mergeFreshMaterial(target, k
            ey, segs, localMap, newLayers, mergeRecords);
      2240 -            entry = {materials, names, merged, layerMap: flui
           -d.get(localMap, segs) || {}};                                
      2240 +            entry = {materials, names, merged, layerMap: flui
           +d.getRecInsist(localMap, segs)};                             
      2241              entries.push(entry);
      2242              fluid.definitionMergeCache.set(strongest, entries
            );
      2243          }
     ...
      2253      fluid.graftLayerMapSources = function (target, source) {
      2254          Object.keys(source).forEach(key => {
      2255              const from = source[key];
      2256 -            const into = target[key] || (target[key] = {});  
      2256 +            const into = target[key] || (target[key] = Object
           +.create(null));                                              
      2257              if (from[$m]?.source !== undefined) {
      2258 -                (into[$m] || (into[$m] = {})).source = from[$
           -m].source;                                                   
      2258 +                (into[$m] || (into[$m] = Object.create(null))
           +).source = from[$m].source;                                  
      2259              }
      2260              fluid.graftLayerMapSources(into, from);
      2261          });
  ⎿  (timeout 10m)

● All tests pass. Now the ponder build: is the output still identical, and how
  fast is it?

  Ran 1 shell command (ctrl+o to expand)

● The output is still byte-identical, and a build takes 23.4–24.5 s, down from
  about 28–31 s. Profiling again to see what each fix removed:

  Ran 1 shell command (ctrl+o to expand)

● Observer removal and availability map hotspots are fixed, but the per-chain
  cache barely helps since it caches nested objects while merge time is spent on
  top-level leaf keys. I'll restructure mergeLayers to cache merged results and
  policy extraction per top-level key instead, which stays exact since it only
  affects keys untouched by other records.

  Ran 1 shell command (ctrl+o to expand)

● Now the rewrite. It replaces the nested-level cache with the top-level one and
  adds the per-layer policy cache:

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/Fluid.js"…)
  ⎿  2522:        const layerMap = {};
         fluid.mergeLayerRecords = function (root, mergeRecords) {
             const layerMap = {};
     … +24 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/Fluid.js (+161 -104)
      2189      };
      2190  
      2191      /**
      2192 -     * Determine whether the material of several layers at a 
           -path is drawn solely from layer definitions, i.e. no         
      2193 -     * other layer, such as one supplied by a user record, a 
           -parent's subcomponent record or a live layer, contributes    
      2194 -     * anything there                                        
      2195 -     * @param {Array} newLayers - The material of each layer 
           -at the path, weakest first                                   
      2196 -     * @param {MergeRecord[]} mergeRecords - The merge record
           -s holding the layers                                         
      2197 -     * @return {Boolean} `true` if only layer definitions con
           -tribute material at the path                                 
      2198 -     */                                                      
      2199 -    fluid.isDefinitionMaterial = function (newLayers, mergeRe
           -cords) {                                                     
      2200 -        return newLayers.every((material, i) => material === 
           -undefined || mergeRecords[i].mergeRecordType === "def");     
      2201 -    };                                                       
      2202 -                                                             
      2203 -    // Merges of the material of layer definitions at a path,
           - keyed by the strongest such material - see                  
      2204 -    // fluid.mergeDefinitionMaterial                         
      2205 -    /** @type {WeakMap<Object, DefinitionMerge[]>} */        
      2206 -    fluid.definitionMergeCache = new WeakMap();              
      2207 -                                                             
      2208 -    /**                                                      
      2209 -     * @typedef {Object} DefinitionMerge                     
      2210 -     * @property {Array} materials - The material merged, of 
           -the layer definitions which contribute any, weakest first    
      2211 -     * @property {String[]} names - The names of the merge re
           -cords of those layer definitions                             
      2212 -     * @property {Object} merged - The merged material, share
           -d by every merge of the same material                        
      2213 -     * @property {LayerMap} layerMap - The layer map of the m
           -erged material, relative to its path                         
      2214 -     */                                                      
      2215 -                                                             
      2216 -    /**                                                      
      2217 -     * Merge the material of several layer definitions at a p
           -ath - see `fluid.mergeLayers`. Many components are           
      2218 -     * instances of the same few chains of layer definitions,
           - e.g. the components of a site rendered as one tree, and     
      2219 -     * the merge of such material is a pure function of the m
           -aterial and the names of the layers supplying it. It is      
      2220 -     * therefore merged once, and the merged material shared 
           -by every later merge of the same material, whose layer map   
      2221 -     * receives the provenance of the merged material.       
      2222 -     * @param {Object} target - The merged object of which th
           -is is a member                                               
      2223 -     * @param {String} key - The member's key                
      2224 -     * @param {String[]} segs - The path of the member within
           - the root being merged                                       
      2225 -     * @param {LayerMap} layerMap - The layer map of the root
           - being merged                                                
      2226 -     * @param {Array} newLayers - The material of each layer 
           -at the member, weakest first                                 
      2227 -     * @param {MergeRecord[]} mergeRecords - The merge record
           -s holding the layers                                         
      2228 -     * @return {Object} The merged member                    
     … 276 more lines (ctrl+o to expand)

● Running lint and the full suite:

  Ran 2 shell commands (ctrl+o to expand)

● The output is identical and the browser demos pass, but wall time hasn't
  improved on the previous step. Profiling to see whether the top-level cache is
  being hit:

  Ran 1 shell command (ctrl+o to expand)

● mergeLayers dropped from 1,419 ms to 37 ms, but mergeRootLayers still costs
  1.56 s, mostly from collecting the key union (417 ms) and checking each key
  against every layer (780 ms). I'll cache the chain's key list so each
  component only needs its own record keys, though I need to check whether this
  preserves key order relative to definitions.

  Ran 1 shell command (ctrl+o to expand)

● Confirmed that definitions sort first since they carry priority 1000+ while
  all other types are 700 or below, so the merged key order is just the chain's
  keys followed by any new component keys. Now caching the chain's key list.

● Bash(python3 - <<'EOF'
      p="src/framework/core/js/Fluid.js"…)
  ⎿  LINT-OK
     11:28:49.314:   fq:  All tests concluded: 1824/1824 total passed in 13
     409ms - PASS
     … +16 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/Fluid.js (+11 -4)
      2265       * @typedef {Object} DefinitionChainMerge
      2266       * @property {Object[]} layers - The layer definitions of
             the chain, weakest first
      2267       * @property {String[]} names - The names of their merge 
            records
      2268 +     * @property {String[]} keys - The keys of the members of
           + the chain, as found by `fluid.mergedKeys`                   
      2269 +     * @property {Set<String>} keySet - The same keys, as a s
           +et                                                           
      2270       * @property {Object} target - The object holding the mer
            ged members of the chain which have been demanded
      2271       * @property {LayerMap} layerMap - The provenance of thos
            e merged members
      2272       */
     ...
      2282          const entries = fluid.definitionChainCache.get(strong
            est) || [];
      2283          let entry = entries.find(entry => fluid.arrayEqual(en
            try.layers, layers) && fluid.arrayEqual(entry.names, names));
      2284          if (!entry) {
      2283 -            entry = {layers, names, target: fluid.makeLayer("
           -definitions", null), layerMap: Object.create(null)};         
      2285 +            const keys = fluid.mergedKeys(layers);           
      2286 +            entry = {layers, names, keys, keySet: new Set(key
           +s), target: fluid.makeLayer("definitions", null), layerMap: O
           +bject.create(null)};                                         
      2287              entries.push(entry);
      2288              fluid.definitionChainCache.set(strongest, entries
            );
      2289          }
     ...
      2309              defIndices.map(i => mergeRecords[i].mergeRecordNa
            me));
      2310          const chainRecords = chain && defIndices.map(i => mer
            geRecords[i]);
      2311          const chainPlain = chain && defIndices.map(() => true
            );
      2309 -        fluid.mergedKeys(layers).forEach(key => {            
      2310 -            const definitionsOnly = layers.every((layer, i) =
           -> isDef[i] || !(plainLayers[i] && key in layer));            
      2311 -            if (chain && definitionsOnly) {                  
      2312 +        // The keys to which layers other than definitions co
           +ntribute - since definitions are the weakest layers, and     
      2313 +        // so come first, the keys of all the layers are thos
           +e of the chain followed by any others of these               
      2314 +        const ownKeys = chain && fluid.mergedKeys(layers.filt
           +er((layer, i) => !isDef[i]));                                
      2315 +        const ownKeySet = chain && new Set(ownKeys);         
      2316 +        const allKeys = chain ? [...chain.keys, ...ownKeys.fi
           +lter(key => !chain.keySet.has(key))] : fluid.mergedKeys(layer
           +s);                                                          
      2317 +        allKeys.forEach(key => {                             
      2318 +            if (chain && !ownKeySet.has(key)) {              
      2319                  if (!(key in chain.target)) {
      2320                      fluid.mergeLayerKey(chain.target, [], cha
            in.layerMap, chain.layers, chainRecords, chainPlain, key);
      2321                  }
  ⎿  (timeout 10m)

● I'll create a pre-fix reference build by reverting the one changed line in the
  broken copy, then compare both CPU time and wall time while alternating
  between the builds, since wall time alone is too noisy here to detect a 1–2 s
  difference.

  Ran 1 shell command (ctrl+o to expand)

● CPU time only dropped ~1.5s (6%), far less than the 6.7s improvement the
  profiler suggested—likely because profiling inflates overhead for many small
  calls. I'll time mergeLayerRecords directly without the profiler in both
  versions to get accurate numbers.

  Ran 1 shell command (ctrl+o to expand)

● Merge time drops from 4.4s to 2.5s with half the merge count (9,243 vs
  18,966), though the measured totals seem a bit noisy against the expected
  ~1.9s. I'll run four more alternating pairs and take medians.

  Ran 1 shell command (ctrl+o to expand)

● The median comparison shows the build is now 8–10% faster (about 2–3s). Since
  these fixes are exact rather than heuristic, I'll add tests for each—starting
  with the double-counted observer signal test, followed by one for shared
  merged definitions with provenance and redefinition.

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● Writing both tests:

● Bash(python3 - <<'EOF'
      p="tests/framework-tests/core/js/FluidILTests.js"…)
  ⎿  LINT-OK
     11:39:32.597:   fq:  Test concluded - Module "Fluid Signals Tests" Tes
     t name "An observer of the same source several times observes it until
     … +8 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidILTests.js (+52 -0)
      24      assert.strictEqual(testDef.events.onCreate, 0, "Merged valu
          e unchanged");
      25  });
      26  
      27 +fluid.def("fluid.tests.chainBase", {                           
      28 +    $layers: "fluid.component",                                
      29 +    settings: {                                                
      30 +        colour: "red",                                         
      31 +        size: {width: 10, height: 20}                          
      32 +    },                                                         
      33 +    label: "base"                                              
      34 +});                                                            
      35 +                                                               
      36 +fluid.def("fluid.tests.chainDerived", {                        
      37 +    $layers: "fluid.tests.chainBase",                          
      38 +    settings: {                                                
      39 +        size: {width: 30}                                      
      40 +    }                                                          
      41 +});                                                            
      42 +                                                               
      43 +QUnit.test("Members merged from the same chain of layer definit
         +ions are shared", function (assert) {                          
      44 +    const plain = that => ({colour: that.settings.colour, width
         +: that.settings.size.width, height: that.settings.size.height})
         +;                                                              
      45 +    const shadowOf = that => that[fluid.proxySymbol].shadow;   
      46 +    const sourceOf = (that, segs) => fluid.get(shadowOf(that).l
         +ayerMap, [...segs, fluid.metadataSymbol, "source"]);           
      47 +    const first = fluid.tests.chainDerived();                  
      48 +    const second = fluid.tests.chainDerived();                 
      49 +    const coloured = fluid.tests.chainDerived({settings: {colou
         +r: "blue"}});                                                  
      50 +                                                               
      51 +    assert.deepEqual(plain(first), {colour: "red", width: 30, h
         +eight: 20}, "Members merged from the chain of definitions");   
      52 +    assert.deepEqual(plain(coloured), {colour: "blue", width: 3
         +0, height: 20}, "Member supplied by a user record merged over t
         +he chain");                                                    
      53 +    const merged = that => fluid.deSignal(shadowOf(that).flatMe
         +rged);                                                         
      54 +    assert.strictEqual(merged(first).settings, merged(second).s
         +ettings, "Member merged only from definitions is shared by inst
         +ances of the chain");                                          
      55 +    assert.notStrictEqual(merged(first).settings, merged(colour
         +ed).settings, "Member to which a user record contributes is mer
         +ged afresh");                                                  
      56 +    assert.strictEqual(merged(first).label, "base", "Member of 
         +a single definition held directly");                           
      57 +                                                               
      58 +    assert.equal(sourceOf(second, ["settings", "size", "width"]
         +), "fluid.tests.chainDerived", "Provenance of a shared member r
         +etained for each instance");                                   
      59 +    assert.equal(sourceOf(second, ["settings", "size", "height"
         +]), "fluid.tests.chainBase", "Provenance of a weaker definition
         + retained");                                                   
      60 +    assert.notEqual(sourceOf(coloured, ["settings", "colour"]),
         + "fluid.tests.chainBase", "Provenance of a member supplied by a
         + user record");                                                
      61 +    assert.equal(sourceOf(coloured, ["settings", "size", "heigh
         +t"]), "fluid.tests.chainBase", "Provenance beneath a member mer
         +ged afresh");                                                  
      62 +                                                               
      63 +    // A redefinition is a fresh layer, whose chain is merged a
         +fresh                                                          
     … 18 more lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidSignalsTests.js (+30 -0)
      299  // kairo's "avoidable computation" test at https://github.com/
           milomg/js-reactivity-benchmark/blob/main/packages/core/src/ben
           ches/kairo/avoidable.ts
      300  // Which was ported to knockout (passes) and adapton (fails), 
           probably fails in S as well.
      301  
      302 +QUnit.test("An observer of the same source several times obser
          +ves it until removed as often", assert => {                   
      303 +    const source = fluid.cell(1, {name: "source"}), reads = fl
          +uid.cell(2, {name: "reads"});                                 
      304 +    let runs = 0;                                             
      305 +    // The edge's sources are not deduplicated, so that the so
          +urce is observed once for each read                           
      306 +    const observer = fluid.cell(undefined, {name: "observer"})
          +.computed(() => {                                             
      307 +        runs++;                                               
      308 +        let sum = 0;                                          
      309 +        for (let i = 0; i < reads.get(); ++i) {               
      310 +            sum += source.get();                              
      311 +        }                                                     
      312 +        return sum;                                           
      313 +    }, []);                                                   
      314 +    assert.equal(observer.get(), 2, "Source read twice");     
      315 +    assert.equal(source._observers.get(observer), 2, "Observer
          + counted once for each read");                                
      316 +                                                              
      317 +    reads.set(1);                                             
      318 +    assert.equal(observer.get(), 1, "Source now read once");  
      319 +    assert.equal(source._observers.get(observer), 1, "One coun
          +t withdrawn");                                                
      320 +    source.set(5);                                            
      321 +    assert.equal(observer.get(), 5, "Still notified of the sou
          +rce, which it still reads once");                             
      322 +                                                              
      323 +    reads.set(0);                                             
      324 +    assert.equal(observer.get(), 0, "Source no longer read"); 
      325 +    assert.notOk(source._observers.has(observer), "No longer a
          +n observer");                                                 
      326 +    const before = runs;                                      
      327 +    source.set(6);                                            
      328 +    assert.equal(observer.get(), 0, "Value unchanged");       
      329 +    assert.equal(runs, before, "Not notified of a source it no
          + longer reads");                                              
      330 +});                                                           
      331 +                                                              
      332  QUnit.test("Early cutoff", assert => {
      333  
      334      let busyCount = 0;
  ⎿  (timeout 6m 40s)

● Both new tests pass. Last checks: the full suite, the IL and signal tests in
  Chromium, and a build under Node 16.6.2:

  Ran 1 shell command (ctrl+o to expand)

● The FluidIL tests printed nothing in Chromium, so checking that run on its
  own:

  Ran 1 shell command (ctrl+o to expand)

● The IL test page never reaches its "completed" line in Chromium. To see
  whether my changes caused that, I'll run the pre-fix copy the same way, and
  capture how far each run gets:

  Ran 1 shell command (ctrl+o to expand)
● Both copies stop at the same test with the same 14 failures, so it isn't my
  change. The page stalls the same way in Chromium from file:// URLs whether or
  not these fixes are present, and under node the same file passes 307/307.

  I made all three fixes. Measured on the pre-fix reference copy, a ponder build
  is about 2–3 s faster (8–10%). Medians over seven alternating pairs:

  ┌────────────────────┬─────────────┬────────────┐
  │      Version       │ Median wall │ Median CPU │
  ├────────────────────┼─────────────┼────────────┤
  │ Before these fixes │ 27.6 s      │ 27.8 s     │
  ├────────────────────┼─────────────┼────────────┤
  │ After              │ 24.7 s      │ 25.7 s     │
  └────────────────────┴─────────────┴────────────┘

  The output is byte-for-byte identical (66/66 pages), under Node 16.6.2 as
  well. Tests pass:

  - the full node suite at 1845/1845;
  - both server tests;
  - the 20 browser demo steps;
  - the signal and view test files in Chromium.

  The IL test page in Chromium is the exception above, and it behaves the same
  before and after. Nothing is committed.

  The gain is much smaller than the 6.7 s that CPU profiles of the two builds
  differ by. Profiling exaggerates time in code made of many small calls. Timing
  the merge directly, without the profiler, puts it at 4.4 s before and 2.5 s
  after.

  What changed:

  1. Observer removal (FluidSignals.js):
     - _observers is now a Map from observer to a count. A cell that reads the
       same source twice is counted twice, so it stays an observer until removed
       twice, as the old array allowed.
     - Removal is constant-time, where it used to scan a list of up to 18,853
       entries (43 million entries scanned per build).
     - New helpers fluid.cell.addObserver and fluid.cell.removeObserver handle
       this.
     - Notification order is unchanged, since a Map keeps insertion order.
     - Profiled time: 1,686 ms → 21 ms.
  2. Availability map (FluidIL.js, server-support.js):
     - Unavailable components are tracked in place in
       fluid.unavailableComponentPaths, and each change bumps a counter cell,
       fluid.unavailableComponentsVersion.
     - fluid.unavailableComponents and the server's per-document readiness check
       depend on that counter.
     - fluid.unavailableComponentMap still exists for its readers, such as the
       IL tests, but is now a copy made only when read.
     - Profiled time: 1,490 ms → 31 ms.
  3. Merging definitions per chain (Fluid.js):
     - Dead merge removed. HierarchyResolver.resolve merged each component's
       definitions and then threw the result away: only the merge records were
       used, and the one reader named in its comment, fluid.readDef, no longer
       exists. That accounted for about half of all merges (18,966 → 9,243).
     - Top-level chain cache. In fluid.mergeRootLayers, a member that only layer
       definitions contribute to is merged once per chain of definitions and
       shared by every component built from that chain. Its provenance is copied
       into each component's layer map. Members the component's own records
       touch are merged as before. The chain's key list is cached too, which
       keeps the keys in exactly the original order.
     - Policy extraction cached. Finding $reactiveRoot markers is cached per
       definition, since definitions don't change after they're written.
     - Why it's exact: a member that only definitions contribute to merges to a
       pure function of those definitions and their record names. Any merge
       error there would occur identically without the cache. A redefined layer
       is a new object, so its chains are merged afresh.

  Two things I tried and replaced:
  - A cache on nested members only: it almost never applied, because most of the
    cost is at the top level of each component's members. I moved the cache
    there.
  - Sharing a single premerged layer of all the definitions: I rejected this
    before writing it. The merge isn't associative in an edge case, and
    per-record provenance and subcomponent-record collection would have changed.

  New tests:
  - "An observer of the same source several times observes it until removed as
    often" in FluidSignalsTests.js.
  - "Members merged from the same chain of layer definitions are shared" in
    FluidILTests.js. It checks shared versus freshly merged members, provenance
    (including beneath members merged afresh), and that redefining a layer in
    the chain updates every instance.

  What this means for the Hugo comparison: the time that remains is mostly the
  structural cost I described last time. Each component carries 13 fixed
  book-keeping cells, and each reference in each component gets reactive cells
  of its own (about 115,000 in all). Getting from 24 s towards the 7–10 s you're
  after needs those structural changes. The narrow hot-spot fixes are largely
  done.

✻ Baked for 33m 6s · done 11:46
  ⎿  Referenced file tests/framework-tests/core/js/FluidSignalsTests.js
  ⎿  Read src/framework/core/js/FluidView-browser.js (261 lines)
  ⎿  Referenced file ../ponder-infusion/infusion/js/siteModel.js
  ⎿  Read ../../../../tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/04
     53b3a3-97d2-445d-8bfc-4f99019ddb5a/scratchpad/cut.js (168 lines)
  ⎿  Read ../ponder-infusion/infusion/js/buildSite.js (208 lines)

● Compacted while idle, before the prompt cache expired · turn off with 
  "idleCompaction": false in settings.json

❯ Expand on why the single premerged layer was rejected, together with an       
  example of how merge is not associative                                       

  Ran 3 shell commands (ctrl+o to expand)

● The idea I rejected was to merge each chain of definitions once, into a single
  layer, and then merge each component's own records over that layer. That only
  gives the right answer if merging is associative: merging the definitions
  first, and the component's records after, would have to match merging all the
  layers at once. Infusion's merge isn't associative. There were also two more
  reasons, below. I checked both failures against the current fluid.mergeLayers
  with a scratch script (/tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-
  6/0453b3a3-97d2-445d-8bfc-4f99019ddb5a/scratchpad/assoc.js).

  1. Merging isn't associative

  fluid.mergeLayerKey (src/framework/core/js/Fluid.js:2232) decides what to do
  at each key by looking only at the strongest value there:
  - If more than one layer has the key and the strongest value is a plain
    object, it merges every layer's value at that key.
  - At the next level down, layers whose value isn't a plain object are skipped
    (plainLayers).
  - Otherwise the strongest value simply wins.

  So a plain value in a middle layer stops one weaker object from reaching the
  result only when it is the strongest value merged at that point. Grouping the
  layers changes which value is strongest at that point:

  const A = {x: {p: 1}}, B = {x: 5}, C = {x: {q: 2}};   // weakest first

  merge([A, B, C])          // → {x: {p: 1, q: 2}}
  merge([merge([A, B]), C]) // → {x: {q: 2}}

  - All at once: C's object is the strongest value. The merge goes down into x
    and merges {p: 1}, 5 and {q: 2}. It skips the 5, so A's p survives.
  - A and B first: 5 is the strongest value in that step, so A⊕B is {x: 5} and
    {p: 1} is gone before C is merged.

  In practice, A and B would be two definitions in a chain, say a base layer
  that sets x to an object and a derived layer that overrides it with a value. C
  would be a component's own record that sets x to an object again. The single
  premerged layer would quietly lose p in that case. I'm not aware of a ponder
  layer that does this, but the semantics would change, and nothing would report
  it.

  Subcomponent records and IL references follow the same kind of strongest-value
  rule, so they would be at risk too.

  2. Subcomponent records can't be merged twice

  fluid.collectComponentRecords deliberately doesn't merge $component records
  (the FLUID-5614 behaviour). Instead it keeps a fluid.componentRecords holding
  one contribution per layer. Each contribution keeps its own merge-record name,
  and the subcomponent later resolves them as separate merge records with their
  own priorities.

  A premerged layer would therefore already contain a fluid.componentRecords
  object. Merging it again fails, because that object isn't the plain
  {$component: {...}} form the function expects:

  merge([D, E]).sub.$component.contributions  → names ["L0", "L1"]
  merge([merge([D]), E])                       → ASSERTION FAILED: Cannot merge 
  value {"$component":{"contributions":[...]}} at path sub ...

  Making that work would mean teaching the merge to splice contribution lists.
  Even then, every contribution from the definitions would be attributed to the
  premerged layer, not to the definition that wrote it.

  3. Provenance and the record of merged material would change

  - Provenance: the layer map records the merge-record name of the winning layer
    at every path ($m.source). Error messages, layer-provenance tooling and the
    AI layers' provenance work all read it. With a premerged layer, every value
    from the definitions would be attributed to that one layer. Getting the
    real names back would mean keeping a second layer map alongside it, which is
    effectively the per-key cache I ended up with.
  - Merged material: each merged object records the material it was merged from
    ($m.contributions), and fluid.isSameSignalRecord compares it to recognise a
    fresh merge of the same material as equivalent. Over a premerged layer, that
    list would be [premerged, own] where the current merge gives [def1, def2, 
    …, own]. After a redefinition or a change of live layers, the equality check
    could then fail and recreate signals that are currently kept.

  Why the per-key cache avoids all of this

  The cache I implemented in fluid.mergeRootLayers never changes how layers are
  grouped. A member is shared only if none of the component's own records touch
  it. In that case, merging all the layers at that key is exactly the same work
  as merging only the definitions: the same layers and merge-record names, in
  the same order. The cached result is that same computation done once, not a
  regrouping.

  The cache also keeps everything above:
  - each definition's own merge-record name, both in subcomponent contributions
    and in the provenance copied into each component's layer map;
  - the record of merged material;
  - error behaviour.

  Any key a component's own records touch is merged from all the layers as
  before, so the A, B, C case gives {p: 1, q: 2} exactly as it did without the
  cache.

✻ Sautéed for 1m 14s · done 13:31

❯ add a test for the non-associative A, B, C case and write a report of your    
  last reponse to a-scratch/reports/non-associative-merging.md                  

  Listed 1 directory, ran 1 shell command (ctrl+o to expand)

● Update(tests/framework-tests/core/js/FluidILTests.js)
  ⎿  Added 30 lines
       76      [first, second, coloured].forEach(that => that.destroy());
       77  });
       78  
       79 +fluid.def("fluid.tests.assocBase", {                          
       80 +    $layers: "fluid.component",                               
       81 +    shape: {p: 1}                                             
       82 +});                                                           
       83 +                                                              
       84 +fluid.def("fluid.tests.assocDerived", {                       
       85 +    $layers: "fluid.tests.assocBase",                         
       86 +    shape: 5                                                  
       87 +});                                                           
       88 +                                                              
       89 +// Merging is not associative - a plain value overrides weaker
          + material only where it is the strongest value merged, and    
       90 +// so a chain of definitions cannot be premerged into a single
          + layer over which a component's own records are merged        
       91 +QUnit.test("Member of a user record merged over a chain whose 
          +definitions do not associate", function (assert) {            
       92 +    const merge = function (layers) {                         
       93 +        const target = fluid.makeLayer("root", null);         
       94 +        const mergeRecords = layers.map((layer, i) => ({mergeR
          +ecordType: "user", mergeRecordName: "layer" + i}));           
       95 +        fluid.mergeLayers(target, [], {}, layers, mergeRecords
          +);                                                            
       96 +        return target;                                        
       97 +    };                                                        
       98 +    const A = {shape: {p: 1}}, B = {shape: 5}, C = {shape: {q:
          + 2}};                                                         
       99 +    assert.deepEqual({...merge([A, B, C]).shape}, {p: 1, q: 2}
          +, "All layers merged together");                              
      100 +    assert.deepEqual({...merge([merge([A, B]), C]).shape}, {q:
          + 2}, "Weaker layers merged first lose the weakest material"); 
      101 +                                                              
      102 +    const plain = fluid.tests.assocDerived();                 
      103 +    const shaped = fluid.tests.assocDerived({shape: {q: 2}}); 
      104 +    assert.strictEqual(plain.shape, 5, "Member merged only fro
          +m definitions");                                              
      105 +    assert.deepEqual({...shaped.shape}, {p: 1, q: 2}, "Member 
          +of a user record merged over every definition of the chain, as
          + if all were merged together");                               
      106 +    [plain, shaped].forEach(that => that.destroy());          
      107 +});                                                           
      108 +                                                              
      109  fluid.def("fluid.tests.basicTestComponent", {
      110      $layers: "fluid.component",
      111      testValue: 0

  Ran 3 shell commands (ctrl+o to expand)

● The new test passes (4/4); I'm checking the file's overall totals, then
  writing the report.

  Ran 1 shell command (ctrl+o to expand)

● Write(a-scratch/reports/non-associative-merging.md)
  ⎿  Wrote 98 lines to a-scratch/reports/non-associative-merging.md
       1 # Why a chain of layer definitions is not premerged into a singl
       2 
       3 When we optimised the merging of layers for the ponder build, on
       4 once into a single layer. Each component's own records would the
       5 rejected. A per-key cache of members merged from the chain was i
         mplemented instead, in `fluid.mergeRootLayers` in
       7 
       8 The premerge only gives the right answer if merging is associati
       9 component's records afterwards matches merging all the layers at
      10 a
     … +134 lines (ctrl+o to expand)

● I added the test for the A, B, C case, and it passes. FluidILTests.html now
  passes 311/311 under node and lint is clean.

  The new test is "Member of a user record merged over a chain whose definitions
  do not associate", in tests/framework-tests/core/js/FluidILTests.js, after
  the chain-sharing test. It checks two things:

  - The merge itself: using fluid.mergeLayers directly, all three layers
    together give {p: 1, q: 2}, while merging A and B first gives {q: 2}.
  - Through the chain cache: two new definitions, fluid.tests.assocBase (shape: 
    {p: 1}) and fluid.tests.assocDerived (shape: 5), act as A and B. A plain
    instance has shape equal to 5. An instance given its own record {shape: {q: 
    2}} has shape equal to {p: 1, q: 2}, the same as merging all the layers at
    once.

  I haven't checked that the second part fails when the definitions are
  premerged, because there is no premerging version of the code to run it
  against. It should fail, since that version would give {q: 2}.

  The report is at a-scratch/reports/non-associative-merging.md. I created the
  reports directory for it. It covers the three reasons the single premerged
  layer was rejected, with both failing examples I reproduced, why the per-key
  cache is exact, and a description of the new test.

  Nothing is committed.

✻ Baked for 1m 26s · done 13:37

❯ So we have around 115,000 components in memory as a result of the build? One  
  idea could be to make a radical simplification of the book-keeping structures 
  for components by inspecting which DefinitionChainMerge object it is derived  
  from, and where there is no dynamic material, sharing the definitions from a  
  single DefinitionChainShadow object by either prototypal inheritance at the   
  shadow level or simply sharing instances in the various shadow maps. Or       
  perhaps as you say provably static components could avoid having instances    
  and/or shadows allocated at all. Could you do a book-keeping run and make a   
  histogram of what the most frequent inhabitant types of the 115,000           
  components are and what differences they have amongst themselves?             

  Ran 1 shell command (ctrl+o to expand)

● Correcting an earlier mix-up: the 115,000 figure was reactive cells resolving
  references, not components — the actual component count was 6,279, totaling
  about 259k cells. I'll verify both numbers in this run, then break the
  components down by definition chain.

  Ran 6 shell commands (ctrl+o to expand)

● I've finished the census: one instrumented ponder build, with every component
  grouped by its chain of layer definitions.

  First, a correction: there aren't 115,000 components. The build has 6,279 
  components carrying 259,311 cells, about 41 cells each. The 115,000 I
  mentioned earlier were cells that resolve references, not components. They
  fall across only 46 distinct definition chains.

  Histogram by definition chain (strongest layer named)

  Components: 1,977
  Cumulative: 31%
  Chain: fluid.sfcTemplateViewComponent
  What they are: the view of each SFC-backed component
  Own records differ by: 38 distinct own records; template is one of 28 SFC
  layers; 509 also carry a container/parentTemplate cell
  ────────────────────────────────────────
  Components: 467
  Cumulative: 39%
  Chain: fluid.componentList
  What they are: drivers of $for
  Own records differ by: 3 distinct; a list cell
  ────────────────────────────────────────
  Components: 429
  Cumulative: 46%
  Chain: fluid.templateViewComponent
  What they are: inline-template views, e.g. nav child links and content
  Own records differ by: 6 distinct; the template string
  ────────────────────────────────────────
  Components: 419
  Cumulative: 52%
  Chain: fluid.listViewComponent
  What they are: views of those lists
  Own records differ by: 2 distinct; the container cell
  ────────────────────────────────────────
  Components: 413
  Cumulative: 59%
  Chain: ponder.stylesheetTag
  What they are: $for items, 7 per page
  Own records differ by: only the variables layer, stylesheet: 
  "{doc}.stylesheets.X"
  ────────────────────────────────────────
  Components: 413
  Cumulative: 66%
  Chain: ponder.navItem
  What they are: $for items, 7 per page
  Own records differ by: only item, plus 2 variants of a dynamic layer (leaf or
  parent)
  ────────────────────────────────────────
  Components: 307
  Cumulative: 70%
  Chain: fluid.component
  What they are: nav children and term links ($for)
  Own records differ by: only the variables layer
  ────────────────────────────────────────
  Components: 295
  Cumulative: 75%
  Chain: ponder.scriptTag
  What they are: $for items, 5 per page
  Own records differ by: only the variables layer
  ────────────────────────────────────────
  Components: 211 + 211
  Cumulative: 82%
  Chain: fluid.templateBlock(View)
  What they are: if- blocks and their views
  Own records differ by: the parentTemplate fragment (96 distinct)
  ────────────────────────────────────────
  Components: 121
  Cumulative: 84%
  Chain: ponder.content
  What they are: page and preview bodies
  Own records differ by: 2 variants: the html source
  ────────────────────────────────────────
  Components: 111
  Cumulative: 86%
  Chain: ponder.tags
  What they are: tag lists
  Own records differ by: 2 variants
  ────────────────────────────────────────
  Components: 59 each
  Cumulative:
  Chain: head, navbar, footer, pageMeta, header.bigimg, …
  What they are: one per page
  Own records differ by: 1 distinct own record across all 59 pages
  ────────────────────────────────────────
  Components: 32 chains
  Cumulative: the last ~14%
  Chain: everything else
  What they are:
  Own records differ by:

  What the components differ by, sorted into four kinds:

  1. Views, about 50% of components (the first, third, fourth and
     templateBlockView rows). They differ only by which template they hold, from
     a few dozen, and by the container and parentTemplate cells their parent
     passes down.
  2. $for iterations, 1,560 components (25%). Their own records are identical
     within each chain. The only difference is one reference in the variables
     layer, such as {/site-11.documents.0}.stylesheets.katex.
  3. Per-page singletons. Each has the same own record on every page and differs
     only in its context, {document}.
  4. Genuinely varied material: if- block fragments, page content, the pager and
     share links. This is a small minority.

  Where the components sit in each page

  Pages have 76–206 components each, with a median of 95. By subtree, across all
  59 pages:

  ┌──────────────────┬────────────┬──────────┐
  │     Subtree      │ Components │ Per page │
  ├──────────────────┼────────────┼──────────┤
  │ navbar           │ 1,770      │ 30       │
  ├──────────────────┼────────────┼──────────┤
  │ head             │ 1,298      │ 22       │
  ├──────────────────┼────────────┼──────────┤
  │ footerScriptTags │ 590        │ 10       │
  ├──────────────────┼────────────┼──────────┤
  │ footer, pageMeta │ 236        │ 4        │
  ├──────────────────┼────────────┼──────────┤
  │ main             │ 1,886      │ varies   │
  ├──────────────────┼────────────┼──────────┤
  │ header           │ 358        │ varies   │
  └──────────────────┴────────────┴──────────┘

  About 63% of all components are page chrome: the head, navbar, footer and
  script tags. This chrome is built again for every page, from the same own
  records. I haven't checked whether the rendered chrome is byte-identical
  across pages. The navbar probably differs at least in its active item and its
  relative URLs.

  What this means for your two ideas

  - Sharing a chain's book-keeping from one shadow object is well supported.
    About 90% of components fall into the 20 largest chains, and within a chain
    the own records are nearly always one of a few shapes. Many components
    differ only by a variables-layer reference or a cell passed in from the
    parent. So a shared shadow per chain and own-record shape, with a small
    per-instance overlay for the variables layer and the injected cells, would
    cover most of the tree. The fixed per-shadow structures point the same way.
    Every shadow allocates a layerMap, shadowMap, mergeRecords, lastMerge,
    frameworkEffects and scopes, with 57k entries in each of the two maps across
    all shadows. For instances that share a chain, these entries are mostly
    identical.
  - "Provably static" components can't be decided from the definitions alone.
    Every chain contains directives: each view chain has 6–8 (its render cells),
    and even plain fluid.component has one. Only about 2,800 components have
    own records free of references and cells, and even those inherit directives
    from their chain. The static part is the inputs. In a one-shot build,
    {document}, the variables-layer references and the site model never change
    once they resolve. So "static" would have to be something the build
    declares, for example a mode in which reactive roots are frozen, rather than
    something deduced from the definitions.
  - A third lever the census reveals is the page chrome. If the head, footer and
    script tags were rendered once per distinct set of inputs and reused across
    pages, it would remove most of the 63%. That subtree only needs {document}
    for a handful of values. This is narrower than general shadow sharing, but
    probably the larger single saving for this site.

  The census scripts are /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-
  6/0453b3a3-97d2-445d-8bfc-4f99019ddb5a/scratchpad/census.js and
  /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-97d2-445d-8b
  fc-4f99019ddb5a/scratchpad/census2.js. The full per-chain data, including the
  most frequent value of every own key, is in
  /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-97d2-445d-8b
  fc-4f99019ddb5a/scratchpad/census.json. I changed no project files this round.

✻ Baked for 3m 12s · done 13:53

❯ write a report of this census to a-scratch/reports                            

● Write(a-scratch/reports/component-census.md)
  ⎿  Wrote 121 lines to a-scratch/reports/component-census.md
       1 # Census of the components of the ponder build
       3 This census looks at what the components of a full ponder build 
         are, and how they differ from one another. It was
       4 taken to judge two ideas for simplifying components' book-keepin
       5 
       6 - sharing a single shadow per chain of layer definitions (`Defin
       7   inheritance or shared entries in the shadow maps;
       8 - not allocating instances or shadows at all for components that
          are provably static.
      10 ## Method
     … +163 lines (ctrl+o to expand)

● I wrote the census report to a-scratch/reports/component-census.md. It covers
  the same findings as my last reply, plus three things that weren't in it:

  - How the census was taken: one instrumented ponder build, with every
    component grouped by its chain of layer definitions and its own records
    compared.
  - A table of what each component's book-keeping holds, totalled across all
    components. For example, layerMap and shadowMap each hold 57,223 entries,
    and mergeRecords holds 48,102.
  - The correction about the 115,000 figure: it counted reference-resolution
    cells, not components. The build has 6,279 components carrying 259,311
    cells.

  The scripts that took the census are only in this session's scratch folder,
  not in the repository, and the report says so. If you'd like it to be
  re-runnable, I can move them into a-scratch too.

  Nothing is committed.

✻ Baked for 29s · done 13:54

❯ move the census scripts into a-scratch                                        

● Bash(mkdir -p /mnt/outer-source/gits/fluid-infusion-6/a-scratch/census && cd
      /tmp/claude-1000/-mnt-outer-source-gits-fluid-infusion-6/0453b3a3-97d2-445
      d-8bfc-4f99019…)
  ⎿  chainCensus.js
     subtreeCensus.js
  ⎿  Created a-scratch/census/chainCensus.js (+123 -0)
        1 +/* eslint-env node */                                         
        2 +"use strict";                                                 
        3 +// Census of the components of the ponder build, grouped by th
          +eir chains of layer definitions                               
        4 +const path = require("path"), fs = require("fs");             
        5 +const infusionDir = path.resolve(process.argv[2]), siteDir = p
          +ath.resolve(process.argv[3]), outFile = process.argv[5];      
        6 +const fluid = require(infusionDir);                           
        7 +const $m = fluid.metadataSymbol;                              
        8 +                                                              
        9 +let cellsCreated = 0;                                         
       10 +const ids = new WeakMap();                                    
       11 +let nextId = 0;                                               
       12 +const idOf = o => ids.get(o) ?? (ids.set(o, ++nextId), nextId)
          +;                                                             
       13 +const isCell = v => v && typeof v === "object" && "_value" in 
          +v && "_observers" in v;                                       
       14 +// A bounded description of a value, by which values of the sa
          +me shape and content compare equal                            
       15 +const describe = function (value, depth = 0) {                
       16 +    if (isCell(value)) {                                      
       17 +        return "<cell>";                                      
       18 +    } else if (typeof value === "function") {                 
       19 +        return "<fn " + (value.name || "anon") + ">";         
       20 +    } else if (Array.isArray(value)) {                        
       21 +        return depth > 3 ? "<array#" + idOf(value) + ">" : "["
          + + value.map(v => describe(v, depth + 1)).join(",") + "]";    
       22 +    } else if (value && typeof value === "object") {          
       23 +        if (!fluid.isPlainObject(value, true) || depth > 3) { 
       24 +            return "<obj#" + idOf(value) + ">";               
       25 +        }                                                     
       26 +        return "{" + Object.keys(value).map(k => k + ":" + des
          +cribe(value[k], depth + 1)).join(",") + "}";                  
       27 +    } else {                                                  
       28 +        return JSON.stringify(value);                         
       29 +    }                                                         
       30 +};                                                            
       31 +// Classify the leaves of a layer's material - literal, IL ref
          +erence or directive                                           
       32 +const classify = function (value, counts, depth = 0) {        
       33 +    if (typeof value === "string") {                          
       34 +        if (fluid.isILReference(value)) {                     
       35 +            counts.reference++;                               
       36 +        } else if (/^\$\w+:/.test(value)) {                   
       37 +            counts.directive++;                               
       38 +        } else {                                              
       39 +            counts.literal++;                                 
       40 +        }                                                     
     … 83 more lines (ctrl+o to expand)
  ⎿  Created a-scratch/census/subtreeCensus.js (+34 -0)
       1 +/* eslint-env node */                                          
       2 +"use strict";                                                  
       3 +// Counts components by the subtree of their document they lie 
         +in, and their cells by component                               
       4 +const path = require("path"), fs = require("fs");              
       5 +const infusionDir = path.resolve(process.argv[2]), siteDir = pa
         +th.resolve(process.argv[3]), outFile = process.argv[5];        
       6 +const fluid = require(infusionDir);                            
       7 +// Attribute each cell to the component whose path appears in i
         +ts name, where it does                                         
       8 +process.on("exit", () => {                                     
       9 +    const shadows = Object.values(fluid.globalInstantiator.path
         +ToComponent);                                                  
      10 +    const bySubtree = {}, perDoc = {};                         
      11 +    shadows.forEach(shadow => {                                
      12 +        const m = /documents\.(\d+)(?:\.([^.]+))?/.exec(shadow.
         +path);                                                         
      13 +        const subtree = m ? (m[2] || "(document)") : shadow.pat
         +h.replace(/\d+/g, "#");                                        
      14 +        bySubtree[subtree] = (bySubtree[subtree] || 0) + 1;    
      15 +        if (m) {                                               
      16 +            perDoc[m[1]] = (perDoc[m[1]] || 0) + 1;            
      17 +        }                                                      
      18 +    });                                                        
      19 +    const docCounts = Object.values(perDoc).sort((a, b) => a - 
         +b);                                                            
      20 +    // Of the cells attributable to components, those of the pe
         +r-component book-keeping                                       
      21 +    let staticViews = 0;                                       
      22 +    shadows.forEach(shadow => {                                
      23 +        const records = shadow.mergeRecords || [];             
      24 +        const own = records.filter(r => !["def", "defParents"].
         +includes(r.mergeRecordType) && fluid.isPlainObject(r.layer, tru
         +e));                                                           
      25 +        const hasCell = JSON.stringify(own.map(r => Object.valu
         +es(r.layer).map(v => v && v._observers ? "CELL" : typeof v === 
         +"string" && (fluid.isILReference(v) || v.startsWith("$")) ? "DY
         +N" : "")));                                                    
      26 +        if (!/CELL|DYN/.test(hasCell)) {                       
      27 +            staticViews++;                                     
      28 +        }                                                      
      29 +    });                                                        
      30 +    fs.writeFileSync(outFile, JSON.stringify({bySubtree, docume
         +nts: docCounts.length, perDocMin: docCounts[0], perDocMedian: d
         +ocCounts[docCounts.length >> 1],                               
      31 +        perDocMax: docCounts[docCounts.length - 1], ownRecordsF
         +reeOfCellsAndReferences: staticViews}, null, 1));              
      32 +});                                                            
      33 +process.argv = [process.argv[0], path.join(siteDir, "infusion/j
         +s/buildSite.js"), "--infusion", infusionDir, "-o", process.argv
         +[4]];                                                          
      34 +require(path.join(siteDir, "infusion/js/buildSite.js"));       

● Copied. Now I'm tidying them to the house style and adding usage notes.
● Update(a-scratch/census/chainCensus.js)
  ⎿  Added 6 lines, removed 1 line
       1  /* eslint-env node */
       2  "use strict";
       3 -// Census of the components of the ponder build, grouped by the
         -ir chains of layer definitions                                 
       3 +// Census of the components of the ponder build, grouped by the
         +ir chains of layer definitions - see                           
       4 +// a-scratch/reports/component-census.md                       
       5 +//                                                             
       6 +// Usage: node a-scratch/census/chainCensus.js <infusionDir> <p
         +onderDir> <outDir> <reportFile>                                
       7 +// e.g. node a-scratch/census/chainCensus.js . ../ponder-infusi
         +on /tmp/census-out census.json                                 
       8 +// The site is built into <outDir>, and the census written as J
         +SON to <reportFile>                                            
       9  const path = require("path"), fs = require("fs");
      10  const infusionDir = path.resolve(process.argv[2]), siteDir = pa
          th.resolve(process.argv[3]), outFile = process.argv[5];
      11  const fluid = require(infusionDir);

● Update(a-scratch/census/chainCensus.js)
  ⎿  Added 45 lines, removed 12 lines
      11  const fluid = require(infusionDir);
      12  const $m = fluid.metadataSymbol;
      13  
      14 -let cellsCreated = 0;                                          
      14  const ids = new WeakMap();
      15  let nextId = 0;
      17 -const idOf = o => ids.get(o) ?? (ids.set(o, ++nextId), nextId);
      18 -const isCell = v => v && typeof v === "object" && "_value" in v
         - && "_observers" in v;                                         
      19 -// A bounded description of a value, by which values of the sam
         -e shape and content compare equal                              
      16 +                                                               
      17 +/**                                                            
      18 + * Allocate, or retrieve, a stable numeric id for an object    
      19 + * @param {Object} o - The object                              
      20 + * @return {Number} Its id                                     
      21 + */                                                            
      22 +const idOf = function (o) {                                    
      23 +    if (!ids.has(o)) {                                         
      24 +        ids.set(o, ++nextId);                                  
      25 +    }                                                          
      26 +    return ids.get(o);                                         
      27 +};                                                             
      28 +                                                               
      29 +/**                                                            
      30 + * Determine whether a value is a `fluid.cell`                 
      31 + * @param {Any} v - The value                                  
      32 + * @return {Boolean} `true` if it is a cell                    
      33 + */                                                            
      34 +const isCell = v => !!v && typeof v === "object" && "_value" in
         + v && "_observers" in v;                                       
      35 +                                                               
      36 +/**                                                            
      37 + * Describe a value to a bounded depth, so that values of the s
         +ame shape and content compare equal. Cells, functions and      
      38 + * objects beyond the depth are described by kind or identity  
      39 + * @param {Any} value - The value                              
      40 + * @param {Number} [depth=0] - The depth reached               
      41 + * @return {String} The description                            
      42 + */                                                            
      43  const describe = function (value, depth = 0) {
      44 +    let togo;                                                  
      45      if (isCell(value)) {
      22 -        return "<cell>";                                       
      46 +        togo = "<cell>";                                       
      47      } else if (typeof value === "function") {
      24 -        return "<fn " + (value.name || "anon") + ">";          
      48 +        togo = "<fn " + (value.name || "anon") + ">";          
      49      } else if (Array.isArray(value)) {
      26 -        return depth > 3 ? "<array#" + idOf(value) + ">" : "[" 
         -+ value.map(v => describe(v, depth + 1)).join(",") + "]";      
      50 +        togo = depth > 3 ? "<array#" + idOf(value) + ">" : "[" 
         ++ value.map(v => describe(v, depth + 1)).join(",") + "]";      
      51      } else if (value && typeof value === "object") {
      28 -        if (!fluid.isPlainObject(value, true) || depth > 3) {  
      29 -            return "<obj#" + idOf(value) + ">";                
      52 +        if (fluid.isPlainObject(value, true) && depth <= 3) {  
      53 +            togo = "{" + Object.keys(value).map(k => k + ":" + 
         +describe(value[k], depth + 1)).join(",") + "}";                
      54 +        } else {                                               
      55 +            togo = "<obj#" + idOf(value) + ">";                
      56          }
      31 -        return "{" + Object.keys(value).map(k => k + ":" + desc
         -ribe(value[k], depth + 1)).join(",") + "}";                    
      57      } else {
      33 -        return JSON.stringify(value);                          
      58 +        togo = JSON.stringify(value);                          
      59      }
      60 +    return togo;                                               
      61  };
      36 -// Classify the leaves of a layer's material - literal, IL refe
         -rence or directive                                             
      62 +                                                               
      63 +/**                                                            
      64 + * Classify the leaves of a layer's material as literals, IL re
         +ferences, directives or reactive roots                         
      65 + * @param {Any} value - The material                           
      66 + * @param {Object<String, Number>} counts - The counts of each 
         +class, incremented in place                                    
      67 + * @param {Number} [depth=0] - The depth reached               
      68 + * @return {Object<String, Number>} The counts                 
      69 + */                                                            
      70  const classify = function (value, counts, depth = 0) {
      71      if (typeof value === "string") {
      72          if (fluid.isILReference(value)) {

● Update(a-scratch/census/chainCensus.js)
  ⎿  Added 1 line, removed 1 line
      84                  counts.directive++;
      85              }
      86          } else {
      87 -            Object.keys(value).forEach(k => k === "$layers" || 
         -k === "$variety" ? null : classify(value[k], counts, depth + 1)
         -);                                                             
      87 +            Object.keys(value).filter(k => k !== "$layers" && k
         + !== "$variety").forEach(k => classify(value[k], counts, depth 
         ++ 1));                                                         
      88          }
      89      } else if (Array.isArray(value)) {
      90          value.forEach(v => classify(v, counts, depth + 1));

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      import re…)
  ⎿  /mnt/outer-source/gits/fluid-infusion-6/a-scratch/census/chainCensus.j
     s
       12:7  error  '$m' is assigned a value but never used  no-unused-vars
     … +4 lines (ctrl+o to expand)
  ⎿  Updated a-scratch/census/subtreeCensus.js (+7 -3)
       1  /* eslint-env node */
       2  "use strict";
       3 -// Counts components by the subtree of their document they lie 
         -in, and their cells by component                               
       3 +// Census of the components of the ponder build, counted by the
         + subtree of their page in which they lie - see                 
       4 +// a-scratch/reports/component-census.md                       
       5 +//                                                             
       6 +// Usage: node a-scratch/census/subtreeCensus.js <infusionDir> 
         +<ponderDir> <outDir> <reportFile>                              
       7 +// e.g. node a-scratch/census/subtreeCensus.js . ../ponder-infu
         +sion /tmp/census-out subtrees.json                             
       8 +// The site is built into <outDir>, and the census written as J
         +SON to <reportFile>                                            
       9  const path = require("path"), fs = require("fs");
      10  const infusionDir = path.resolve(process.argv[2]), siteDir = pa
          th.resolve(process.argv[3]), outFile = process.argv[5];
      11  const fluid = require(infusionDir);
       7 -// Attribute each cell to the component whose path appears in i
         -ts name, where it does                                         
      12  process.on("exit", () => {
      13      const shadows = Object.values(fluid.globalInstantiator.path
          ToComponent);
      14      const bySubtree = {}, perDoc = {};
     ...
      21          }
      22      });
      23      const docCounts = Object.values(perDoc).sort((a, b) => a - 
          b);
      20 -    // Of the cells attributable to components, those of the pe
         -r-component book-keeping                                       
      24 +    // The components none of whose own records hold a cell or 
         +an IL reference or directive at their top level                
      25      let staticViews = 0;
      26      shadows.forEach(shadow => {
      27          const records = shadow.mergeRecords || [];
  ⎿  Updated a-scratch/census/chainCensus.js (+15 -1)
       94      return counts;
       95  };
       96  const freshCounts = () => ({literal: 0, reference: 0, directiv
           e: 0, reactiveRoot: 0});
       97 -const sizeOf = v => v instanceof Map || v instanceof Set ? v.s
          -ize : v && typeof v === "object" && !isCell(v) ? Object.keys(v
          -).length : 0;                                                 
       97  
       98 +/**                                                           
       99 + * Determine the number of entries held in a field of a shadow
      100 + * @param {Any} v - The value of the field                    
      101 + * @return {Number} The size of a Map or Set, the number of ke
          +ys of any other object which is not a cell, otherwise 0       
      102 + */                                                           
      103 +const sizeOf = function (v) {                                 
      104 +    let togo = 0;                                             
      105 +    if (v instanceof Map || v instanceof Set) {               
      106 +        togo = v.size;                                        
      107 +    } else if (v && typeof v === "object" && !isCell(v)) {    
      108 +        togo = Object.keys(v).length;                         
      109 +    }                                                         
      110 +    return togo;                                              
      111 +};                                                            
      112 +                                                              
      113  process.on("exit", () => {
      114      const shadows = Object.values(fluid.globalInstantiator.pat
           hToComponent);
      115      const chains = new Map();

● Bash(sed -i '/^const \$m = fluid.metadataSymbol;$/d'
      a-scratch/census/chainCensus.js && npx eslint --no-ignore
      a-scratch/census/*.js && echo lint ok && (node a-scrat…)
  ⎿  lint ok
     census written 6279 components 46 chains 259311 cells
     identical
  ⎿  Updated a-scratch/census/chainCensus.js (+0 -1)
       9  const path = require("path"), fs = require("fs");
      10  const infusionDir = path.resolve(process.argv[2]), siteDir = pa
          th.resolve(process.argv[3]), outFile = process.argv[5];
      11  const fluid = require(infusionDir);
      12 -const $m = fluid.metadataSymbol;                               
      12  
      13  const ids = new WeakMap();
      14  let nextId = 0;
  ⎿  (timeout 6m 40s)

● Bash(python3 - <<'EOF'
      p = "a-scratch/reports/component-census.md"…)
  ⎿  21:The census is taken by two scripts in `a-scratch/census`. Each buil
     ds the site into a directory of its own and writes
     31:node a-scratch/census/chainCensus.js . ../ponder-infusion /tmp/cens
     … +3 lines (ctrl+o to expand)
  ⎿  Updated a-scratch/reports/component-census.md (+13 -1)
      18    content compare equal, and its leaves were classified as lite
          rals, IL references, directives or reactive roots.
      19  - **Subtree:** the component's path, with numbers replaced, sho
          ws which part of its page it lies in.
      20  
      21 -The scripts were kept in a temporary session folder and are not
         - in the repository.                                            
      21 +The census is taken by two scripts in `a-scratch/census`. Each 
         +builds the site into a directory of its own and writes         
      22 +its results as JSON:                                           
      23  
      24 +- `chainCensus.js` groups components by chain and gives the lea
         +f classes, the distinct own records, the most frequent         
      25 +  values of each own key, and the sizes of the shadow fields.  
      26 +- `subtreeCensus.js` gives the counts by page subtree and per p
         +age.                                                           
      27 +                                                               
      28 +For example, from the Infusion checkout:                       
      29 +                                                               
      30 +```                                                            
      31 +node a-scratch/census/chainCensus.js . ../ponder-infusion /tmp/
         +census-out census.json                                         
      32 +node a-scratch/census/subtreeCensus.js . ../ponder-infusion /tm
         +p/census-out subtrees.json                                     
      33 +```                                                            
      34 +                                                               
      35  ## Totals
      36  
      37  | | |

● Bash(sed -i 's/Each builds the site into a directory of its own and
      writes$/Each builds the site into the directory it is given and writes/'
      a-scratch/reports/compon…)
  ⎿  The census is taken by two scripts in `a-scratch/census`. Each builds
     the site into the directory it is given and writes
     its results as JSON:
  ⎿  Updated a-scratch/reports/component-census.md (+1 -1)
      18    content compare equal, and its leaves were classified as lite
          rals, IL references, directives or reactive roots.
      19  - **Subtree:** the component's path, with numbers replaced, sho
          ws which part of its page it lies in.
      20  
      21 -The census is taken by two scripts in `a-scratch/census`. Each 
         -builds the site into a directory of its own and writes         
      21 +The census is taken by two scripts in `a-scratch/census`. Each 
         +builds the site into the directory it is given and writes      
      22  its results as JSON:
      23  
      24  - `chainCensus.js` groups components by chain and gives the lea
          f classes, the distinct own records, the most frequent

● I've moved the census scripts into a-scratch/census/. They pass lint and still
  give exactly the same results as the original census.

  - chainCensus.js (was census.js) groups components by chain of layer
    definitions.
  - subtreeCensus.js (was census2.js) counts components by where they sit in
    each page.

  Run from the Infusion checkout, each one builds the site into the directory
  you give it and writes its results as JSON:

  node a-scratch/census/chainCensus.js . ../ponder-infusion /tmp/census-out 
  census.json
  node a-scratch/census/subtreeCensus.js . ../ponder-infusion /tmp/census-out 
  subtrees.json

  While moving them I added a usage header to each, brought them into the house
  style (JSDocs, no early returns or one-line conditionals), and removed an
  unused variable and a stale comment. Each script's output file matches the
  original byte for byte.

  I also updated the method section of a-scratch/reports/component-census.md to
  point to the scripts and give these commands.

  Nothing is committed.

✻ Churned for 2m 11s · done 13:57

❯ Try to implement a scheme for economising on as many Shadow contents as is    
  practical, keyed by the DefinitionChain object where these can be determined  
  to be identical across component instances                                    

  Listed 1 directory, ran 4 shell commands (ctrl+o to expand)

● I've identified that the def merge records, defParents record, and layer-map
  subtrees are pure functions of the definition chain; next I'll check the scope
  structures.

  Ran 3 shell commands (ctrl+o to expand)

● The baseline build retains 449 MB of heap, about 71 KB per component. To see
  which shadow contents account for it, I'll drop each field from every shadow
  at exit and measure how much heap is freed.

  Ran 2 shell commands (ctrl+o to expand)

● Memory breakdown shows layerMap (21MB), shadowMap (16.6MB), sitedRefMap
  (10.3MB), lastMerge (7.4MB), and ownScope (5.5MB), with most of the remaining
  ~380MB in cells and documents. I'll focus on layerMap, merge records, and
  scope records since these scale with the chain.

  Ran 1 shell command (ctrl+o to expand)

● Since fluid.upgradeDynamicLayers mutates definition records in place, I'll
  need to replace them with copies before sharing. I'll start by implementing
  this for the shared definition records in HierarchyResolver.resolve.

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "Fluid.js"…)
  ⎿  2466:    fluid.upgradeDynamicLayers = function (resolvedMergeRecords,
     dynamicMergeRecord) {
     2524:            const mergeInputs = [potentia, dynamicMergeRecord, ..
     … +3 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/Fluid.js (+51 -14)
      2844          return togo;
      2845      };
      2846  
      2847 +    // The merge records of resolved chains of layer definiti
           +ons, keyed by the strongest definition of the chain - see    
      2848 +    // fluid.definitionMergeRecords                          
      2849 +    /** @type {WeakMap<LayerDef, DefinitionRecords[]>} */    
      2850 +    fluid.definitionRecordsCache = new WeakMap();            
      2851 +                                                             
      2852      /**
      2853 +     * @typedef {Object} DefinitionRecords                   
      2854 +     * @property {String[]} order - The names of the layers o
           +f the chain, weakest first                                   
      2855 +     * @property {LayerDef[]} layers - Their definitions     
      2856 +     * @property {MergeRecord[]} mergeRecords - The merge rec
           +ords of the definitions, followed by that of the resolved    
      2857 +     * `$layers` member                                      
      2858 +     */                                                      
      2859 +                                                             
      2860 +    /**                                                      
      2861 +     * Find, or else allocate, the merge records of a resolve
           +d chain of layer definitions. Since a layer definition is    
      2862 +     * immutable, every component resolving the same chain of
           + the same definitions shares the same records, and the same  
      2863 +     * array of them - the resolved `$layers` member of each 
           +is the same array, `order`. A record is never modified once  
      2864 +     * allocated - see `fluid.upgradeDynamicLayers`.         
      2865 +     * @param {String[]} order - The names of the layers of t
           +he chain, weakest first                                      
      2866 +     * @param {Object<String, LayerDef>} flatDefs - The defin
           +itions of the layers, keyed by name                          
      2867 +     * @return {MergeRecord[]} The merge records of the chain
      2868 +     */                                                      
      2869 +    fluid.definitionMergeRecords = function (order, flatDefs)
           + {                                                           
      2870 +        const layers = order.map(layerName => flatDefs[layerN
           +ame]);                                                       
      2871 +        const strongest = layers[layers.length - 1];         
      2872 +        const entries = fluid.definitionRecordsCache.get(stro
           +ngest) || [];                                                
      2873 +        let entry = entries.find(entry => fluid.arrayEqual(en
           +try.order, order) && fluid.arrayEqual(entry.layers, layers));
      2874 +        if (!entry) {                                        
      2875 +            const mergeRecords = order.map((oneLayerName, i) 
           +=> ({                                                        
      2876 +                mergeRecordType: "def",                      
      2877 +                mergeRecordName: oneLayerName,               
      2878 +                // Towards the right of here, stronger record
           +s                                                            
      2879 +                priority: fluid.mergeRecordTypes.def - i,    
      2880 +                layer: layers[i]                             
      2881 +            })).concat({                                     
      2882 +                // Definition just holding the resolved $laye
           +rs member, overriding all previous entries                   
      2883 +                mergeRecordType: "defParents",               
     … 40 more lines (ctrl+o to expand)

  Ran 1 shell command (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "FluidIL.js"…)
  ⎿  ok
  ⎿  Updated src/framework/core/js/FluidIL.js (+8 -7)
      2462      };
      2463  
      2464      // The user will be expecting the priority of any layers 
            supplied dynamically to be high, and in particular to beat
      2465 -    // any definitions arriving as a result of a subcomponent
           - declaration                                                 
      2465 +    // any definitions arriving as a result of a subcomponent
           + declaration. The records of definitions are shared by all   
      2466 +    // components resolving the same chain - see fluid.defini
           +tionMergeRecords - and so an upgraded record replaces its    
      2467 +    // definition's record in the component's own array rathe
           +r than modifying it                                          
      2468      fluid.upgradeDynamicLayers = function (resolvedMergeRecor
            ds, dynamicMergeRecord) {
      2469          const dynamicLayers = dynamicMergeRecord.layer.$layer
            s;
      2470          if (dynamicLayers) {
      2469 -            resolvedMergeRecords.forEach(mergeRecord => {    
      2471 +            resolvedMergeRecords.forEach((mergeRecord, i) => 
           +{                                                            
      2472                  if (mergeRecord.mergeRecordType === "def" && 
            dynamicLayers.includes(mergeRecord.mergeRecordName)) {
      2471 -                    mergeRecord.mergeRecordType = "dynamicLay
           -ers";                                                        
      2472 -                    mergeRecord.priority = fluid.mergeRecordT
           -ypes.dynamicLayers;                                          
      2473 +                    resolvedMergeRecords[i] = {...mergeRecord
           +, mergeRecordType: "dynamicLayers", priority: fluid.mergeReco
           +rdTypes.dynamicLayers};                                      
      2474                  }
      2475              });
      2476          }
     ...
      2521              // Our merge is a pure function of these inputs -
             if they are unchanged, e.g. because we have been reevaluated
      2522              // only through our parent turning over, our prev
            ious merge is returned so that we do not turn over ourselves.
      2523              // Note that the resolution above must still run 
            on every evaluation since its reads of the layer registry
      2523 -            // are our dependencies on the definitions of our
           - layers                                                      
      2524 -            const mergeInputs = [potentia, dynamicMergeRecord
           -, ...resolved.mergeRecords.map(mergeRecord =>                
      2525 -                mergeRecord.mergeRecordType === "defParents" 
           -? mergeRecord.layer.$layers.join(",") : mergeRecord.layer)]; 
      2524 +            // are our dependencies on the definitions of our
           + layers. The resolved records are the same array whenever    
      2525 +            // the same chain of the same definitions is reso
           +lved - see fluid.definitionMergeRecords                      
      2526 +            const mergeInputs = [potentia, dynamicMergeRecord
           +, resolved.mergeRecords];                                    
      2527              const previous = shadow.lastMerge;
      2528              if (previous && fluid.arrayEqual(previous.mergeIn
            puts, mergeInputs)) {
      2529                  shadow.mergeRecords = previous.layers;

● Now the layer map: members to which only definitions contribute will share the
  chain's layer-map subtree, including its reactive-root markers and links,
  instead of grafting a copy into each instance.

  Searched for 1 pattern (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "Fluid.js"…)
  ⎿  14:06:26.590:   fq:  All tests concluded: 311/311 total passed in 1344
     ms - PASS
  ⎿  Updated src/framework/core/js/Fluid.js (+91 -48)
      2265       * @typedef {Object} DefinitionChainMerge
      2266       * @property {Object[]} layers - The layer definitions of
             the chain, weakest first
      2267       * @property {String[]} names - The names of their merge 
            records
      2268 +     * @property {MergeRecord[]} mergeRecords - Merge records
           + naming each definition, as consumed by `fluid.mergeLayerKey`
      2269 +     * @property {Boolean[]} plainLayers - For each definitio
           +n, `true`, since only plain definitions form a chain         
      2270       * @property {String[]} keys - The keys of the members of
             the chain, as found by `fluid.mergedKeys`
      2271       * @property {Set<String>} keySet - The same keys, as a s
            et
      2272       * @property {Object} target - The object holding the mer
            ged members of the chain which have been demanded
      2271 -     * @property {LayerMap} layerMap - The provenance of thos
           -e merged members                                             
      2273 +     * @property {LayerMap} layerMap - The layer map of those
           + merged members - their provenance, and any reactive roots   
      2274 +     * within them together with their links - each of whose 
           +members is shared by the layer maps of the chain's instances 
      2275       */
      2276  
      2277      /**
     ...
      2286          let entry = entries.find(entry => fluid.arrayEqual(en
            try.layers, layers) && fluid.arrayEqual(entry.names, names));
      2287          if (!entry) {
      2288              const keys = fluid.mergedKeys(layers);
      2286 -            entry = {layers, names, keys, keySet: new Set(key
           -s), target: fluid.makeLayer("definitions", null), layerMap: O
           -bject.create(null)};                                         
      2289 +            entry = {layers, names, keys, keySet: new Set(key
           +s),                                                          
      2290 +                mergeRecords: names.map(mergeRecordName => ({
           +mergeRecordType: "def", mergeRecordName})),                  
      2291 +                plainLayers: layers.map(() => true),         
      2292 +                target: fluid.makeLayer("definitions", null),
           + layerMap: Object.create(null)};                             
      2293              entries.push(entry);
      2294              fluid.definitionChainCache.set(strongest, entries
            );
      2295          }
     ...
      2297      };
      2298  
      2299      /**
      2294 -     * Merge the layers of a component - see `fluid.mergeLaye
           -rs`. Many components are instances of the same few chains    
      2295 -     * of layer definitions, e.g. the components of a site re
           -ndered as one tree, each adding a few members of its own,    
      2296 -     * e.g. from its parent's subcomponent record. A member t
           -o which only layer definitions contribute merges to the same 
      2297 -     * value for every instance of the chain - it is merged o
           -nce, and the merged value shared by each instance, whose     
      2298 -     * layer map receives its provenance. Other members are m
           -erged afresh from all the layers.                            
      2299 -     * @param {Object} target - The root object where merged 
           -results will be stored.                                      
      2300 -     * @param {LayerMap} layerMap - The layer map of the root
           - being merged                                                
      2300 +     * Merge, if it has not been already, the member of a cha
           +in of layer definitions at a key, as it is merged for each of
      2301 +     * the chain's instances to which only the chain's defini
           +tions contribute it - see `fluid.mergeLayerRecords`          
      2302 +     * @param {DefinitionChainMerge} chain - The record of me
           +rges of the chain's members                                  
      2303 +     * @param {String} key - The key of the member           
      2304 +     * @return {LayerMap} The layer map of the merged member,
           + held at `chain.layerMap[key]`                               
     … 157 more lines (ctrl+o to expand)
  ⎿  (timeout 3m 20s)

● IL tests pass. Now the ponder build: checking the output is unchanged and
  measuring.

  Ran 1 shell command (ctrl+o to expand)

● Output is byte-identical and retained heap dropped 449 → 431 MB. The cell
  count also fell by 635, which I didn't expect, so I'm checking which cells
  disappeared before going further.

  Ran 6 shell commands (ctrl+o to expand)
● I'm still tracking down why 635 fewer cells are created; my first counting
  hook missed most cells, so I'm counting them from the cell prototype instead.

  Ran 1 shell command (ctrl+o to expand)

● The baseline varies run-to-run (259,311 vs 258,942 cells) due to timing
  differences in async SFC loading for "Imports awaited" cells. I'll re-measure
  the shadow fields on the current code to get a fresh comparison.

  Ran 1 shell command (ctrl+o to expand)

● layerMap is down from 21 MB to 7.5 MB, and lastMerge from 7.4 MB to 4.5 MB.
  The next largest are shadowMap, sitedRefMap, ownScope and oldShadowMap.
  Looking at how those are used:

  Ran 1 shell command (ctrl+o to expand)

● I'll cache ownScope per resolved $layers array since it only depends on the
  chain, while keeping oldShadowMap, shadowMap, and sitedRefMap per-instance. I
  also found that chains with unavailable layer definitions get fresh stand-in
  objects each time, causing unbounded cache growth, so I'll mark those
  stand-ins and exclude such chains from both caches.

  Ran 1 shell command (ctrl+o to expand)

● Bash(cd /mnt/outer-source/gits/fluid-infusion-6/src/framework/core/js &&
      python3 - <<'EOF'
      p = "Fluid.js"…)
  ⎿       * @property {Shadow} value - The component shadow associated with
      this key.
          * @property {Integer} priority - The priority bitmask indicating
     … +16 lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/Fluid.js (+41 -9)
      2275       */
      2276  
      2277      /**
      2278 -     * Find, or else allocate, the record of merges of the me
           -mbers of a chain of layer definitions                        
      2278 +     * Find, or else allocate, the record of merges of the me
           +mbers of a chain of layer definitions. A chain which cannot  
      2279 +     * be shared - see `fluid.isShareableChain` - receives a 
           +fresh record.                                                
      2280       * @param {Object[]} layers - The layer definitions of th
            e chain, weakest first
      2281       * @param {String[]} names - The names of their merge rec
            ords
      2282       * @return {DefinitionChainMerge} The record of merges of
             the chain's members
      2283       */
      2284      fluid.definitionChainMerge = function (layers, names) {
      2285 +        const shareable = fluid.isShareableChain(layers);    
      2286          const strongest = layers[layers.length - 1];
      2285 -        const entries = fluid.definitionChainCache.get(strong
           -est) || [];                                                  
      2287 +        const entries = shareable && fluid.definitionChainCac
           +he.get(strongest) || [];                                     
      2288          let entry = entries.find(entry => fluid.arrayEqual(en
            try.layers, layers) && fluid.arrayEqual(entry.names, names));
      2289          if (!entry) {
      2290              const keys = fluid.mergedKeys(layers);
     ...
      2292                  mergeRecords: names.map(mergeRecordName => ({
            mergeRecordType: "def", mergeRecordName})),
      2293                  plainLayers: layers.map(() => true),
      2294                  target: fluid.makeLayer("definitions", null),
             layerMap: Object.create(null)};
      2293 -            entries.push(entry);                             
      2294 -            fluid.definitionChainCache.set(strongest, entries
           -);                                                           
      2295 +            if (shareable) {                                 
      2296 +                entries.push(entry);                         
      2297 +                fluid.definitionChainCache.set(strongest, ent
           +ries);                                                       
      2298 +            }                                                
      2299          }
      2300          return entry;
      2301      };
     ...
      2891          return togo;
      2892      };
      2893  
      2894 +    // Layers standing in for definitions which are unavailab
           +le during a resolution - see fluid.placeholderLayer          
      2895 +    /** @type {WeakSet<LayerDef>} */                         
      2896 +    fluid.placeholderLayers = new WeakSet();                 
      2897 +                                                             
      2898 +    /**                                                      
      2899 +     * Allocate an empty layer standing in for a definition w
           +hich is unavailable, or circularly referenced, during the    
      2900 +     * resolution of a component's layers. Each is fresh, and
           + a chain holding one is never shared between components,     
     … 59 more lines (ctrl+o to expand)
  ⎿  Updated src/framework/core/js/FluidIL.js (+48 -12)
      281       */
      282      fluid.layerNamesToScope = function (targetScope, layerName
           s, shadow) {
      283          fluid.clear(targetScope);
      284 -        fluid.each(layerNames, function (layerName) {         
      285 -            if (!fluid.isReferenceOrExpander(layerName)) {    
      286 -                const def = fluid.readLayer(layerName)._value.
          -raw;                                                          
      287 -                if (def && def.$variety !== "framework") {    
      288 -                    const rec = {value: shadow, priority: flui
          -d.contextName};                                               
      289 -                    targetScope[layerName] = rec;             
      290 -                    targetScope[fluid.computeNickName(layerNam
          -e)] = rec;                                                    
      284 +        const {contextNames, resolveRoot} = fluid.layerScopeNa
          +mes(layerNames);                                              
      285 +        if (contextNames.length > 0) {                        
      286 +            // A single record serves for all of the names - r
          +ecords in a scope are replaced, never modified                
      287 +            const rec = {value: shadow, priority: fluid.contex
          +tName};                                                       
      288 +            contextNames.forEach(contextName => targetScope[co
          +ntextName] = rec);                                            
      289 +        }                                                     
      290 +        if (resolveRoot) {                                    
      291 +            shadow.resolveRoot = true;                        
      292 +        }                                                     
      293 +        return targetScope;                                   
      294 +    };                                                        
      295 +                                                              
      296 +    // The context names of resolved lists of layer names, as 
          +found by fluid.layerScopeNames                                
      297 +    /** @type {WeakMap<String[], LayerScopeNames>} */         
      298 +    fluid.layerScopeNamesCache = new WeakMap();               
      299 +                                                              
      300 +    /**                                                       
      301 +     * @typedef {Object} LayerScopeNames                      
      302 +     * @property {String[]} contextNames - The context names u
          +nder which a component with the layers is placed in scope     
      303 +     * @property {Boolean} resolveRoot - `true` if one of the 
          +layers is `fluid.resolveRoot`                                 
      304 +     */                                                       
      305 +                                                              
      306 +    /**                                                       
      307 +     * Determine the context names contributed by a list of la
          +yer names - each name of a layer which is not of the          
      308 +     * framework's variety, together with its nickname. A comp
          +onent's resolved `$layers` member is the same array for       
      309 +     * every component resolving the same chain of the same de
          +finitions - see `fluid.definitionMergeRecords` - and so       
      310 +     * these are found once for each such chain.              
      311 +     * @param {String[]} layerNames - The layer names         
      312 +     * @return {LayerScopeNames} The context names, and whethe
          +r the layers include `fluid.resolveRoot`                      
      313 +     */                                                       
     … 28 more lines (ctrl+o to expand)

  Ran 2 shell commands (ctrl+o to expand)

● The caches are hit. Running the full suite and the ponder build:

  Searched for 1 pattern, ran 2 shell commands (ctrl+o to expand)

● All pass: 1849/1849, both server tests and the 20 browser demo steps. Next,
  ponder output under Node 18 and Node 16.6.2:

  Ran 1 shell command (ctrl+o to expand)

● Output is identical under both Node versions. Now the per-field breakdown,
  then alternating timing runs against the pre-change copy:

  Ran 2 shell commands (ctrl+o to expand)

● Heap usage dropped from 449 to 430 MB across runs, with wall/CPU time about
  5-6% faster (though noisy), confirming most of ownScope's memory footprint is
  the scope objects themselves rather than per-instance records. Now I'll add
  tests, starting by reviewing how existing tests set up reactive roots.

  Ran 3 shell commands (ctrl+o to expand)

● Bash(python3 - <<'EOF'
      p = "FluidILTests.js"…)
  ⎿  14:23:31.809:   fq:  FAIL: Module "Fluid IL Tests" Test name "Layer ma
     p of a reactive root merged only from definitions is shared by instanc
     es of the chain" - Message: Layer map of the reactive root shared by i
     … +19 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidILTests.js (+78 -0)
      106      [plain, shaped].forEach(that => that.destroy());
      107  });
      108  
      109 +fluid.def("fluid.tests.sharedRootSource", {                   
      110 +    $layers: "fluid.component",                               
      111 +    text: "First"                                             
      112 +});                                                           
      113 +                                                              
      114 +fluid.def("fluid.tests.sharedRoot", {                         
      115 +    $layers: "fluid.component",                               
      116 +    source: {                                                 
      117 +        $component: {                                         
      118 +            $layers: "fluid.tests.sharedRootSource"           
      119 +        }                                                     
      120 +    },                                                        
      121 +    state: {                                                  
      122 +        $reactiveRoot: {                                      
      123 +            colour: "red"                                     
      124 +        },                                                    
      125 +        prompt: "{source}.text"                               
      126 +    }                                                         
      127 +});                                                           
      128 +                                                              
      129 +QUnit.test("Layer map of a reactive root merged only from defi
          +nitions is shared by instances of the chain", function (assert
          +) {                                                           
      130 +    const shadowOf = that => that[fluid.proxySymbol].shadow;  
      131 +    const first = fluid.tests.sharedRoot();                   
      132 +    const second = fluid.tests.sharedRoot({source: {$component
          +: {text: "Second"}}});                                        
      133 +    fluid.cell.stabilize();                                   
      134 +    const firstMap = shadowOf(first).layerMap, secondMap = sha
          +dowOf(second).layerMap;                                       
      135 +    assert.strictEqual(firstMap.state, secondMap.state, "Layer
          + map of the reactive root shared by instances");              
      136 +    assert.notStrictEqual(firstMap.source, secondMap.source, "
          +Layer map of a member supplied by a user record not shared"); 
      137 +    assert.equal(firstMap.state[fluid.metadataSymbol].reactive
          +Links.length, 1, "Link of the reactive root recorded in the sh
          +ared map");                                                   
      138 +    assert.equal(first.state.prompt, "First", "Link resolved a
          +gainst the first instance");                                  
      139 +    assert.equal(second.state.prompt, "Second", "Link resolved
          + against the second instance");                               
      140 +                                                              
      141 +    first.state.colour = "blue";                              
      142 +    first.source.text = "Changed";                            
      143 +    fluid.cell.stabilize();                                   
      144 +    assert.deepEqual(fluid.unwrapProxy(first.state), {colour: 
          +"blue", prompt: "Changed"}, "Reactive root of the first instan
          +ce written, and its link followed");                          
      145 +    assert.deepEqual(fluid.unwrapProxy(second.state), {colour:
          + "red", prompt: "Second"}, "Reactive root of the second instan
          +ce unaffected");                                              
     … 44 more lines (ctrl+o to expand)
  ⎿  (timeout 3m 20s)

  Ran 2 shell commands (ctrl+o to expand)

● I confirmed the reactive root correctly isn't shared since its value gets
  written into the component's own layer on creation. I'll update the test to
  check a nested plain member for sharing instead, while keeping the existing
  reactive-root transition checks.

● Bash(cd /mnt/outer-source/gits/fluid-infusion-6/tests/framework-tests/core/js
      && python3 - <<'EOF'
      p = "FluidILTests.js"…)
  ⎿  14:24:20.567:   fq:  FAIL: Module "Fluid IL Tests" Test name "Layer ma
     ps of members merged only from definitions are shared by instances of
     the chain" - Message: Provenance held in the shared map
     … +17 lines (ctrl+o to expand)
  ⎿  Updated tests/framework-tests/core/js/FluidILTests.js (+10 -3)
      118              $layers: "fluid.tests.sharedRootSource"
      119          }
      120      },
      121 +    settings: {                                               
      122 +        size: {width: 10}                                     
      123 +    },                                                        
      124      state: {
      125          $reactiveRoot: {
      126              colour: "red"
     ...
      129      }
      130  });
      131  
      129 -QUnit.test("Layer map of a reactive root merged only from defi
          -nitions is shared by instances of the chain", function (assert
          -) {                                                           
      132 +// A reactive root is first merged from the chain's shared lay
          +er map - once its value is written into the live layer of     
      133 +// each instance, as it is on creation, it is merged afresh fo
          +r each                                                        
      134 +QUnit.test("Layer maps of members merged only from definitions
          + are shared by instances of the chain", function (assert) {   
      135      const shadowOf = that => that[fluid.proxySymbol].shadow;
      136      const first = fluid.tests.sharedRoot();
      137      const second = fluid.tests.sharedRoot({source: {$component
           : {text: "Second"}}});
      138      fluid.cell.stabilize();
      139      const firstMap = shadowOf(first).layerMap, secondMap = sha
           dowOf(second).layerMap;
      135 -    assert.strictEqual(firstMap.state, secondMap.state, "Layer
          - map of the reactive root shared by instances");              
      140 +    assert.strictEqual(firstMap.settings, secondMap.settings, 
          +"Layer map of a member merged only from definitions shared by 
          +instances");                                                  
      141 +    assert.equal(fluid.get(firstMap, ["settings", "size", "wid
          +th", fluid.metadataSymbol, "source"]), "fluid.tests.sharedRoot
          +", "Provenance held in the shared map");                      
      142      assert.notStrictEqual(firstMap.source, secondMap.source, "
           Layer map of a member supplied by a user record not shared");
      137 -    assert.equal(firstMap.state[fluid.metadataSymbol].reactive
          -Links.length, 1, "Link of the reactive root recorded in the sh
          -ared map");                                                   
      143 +    assert.notStrictEqual(firstMap.state, secondMap.state, "La
          +yer map of a reactive root held in the live layer not shared")
          +;                                                             
      144 +    assert.equal(firstMap.state[fluid.metadataSymbol].reactive
          +Links.length, 1, "Link of the reactive root recorded");       
      145      assert.equal(first.state.prompt, "First", "Link resolved a
           gainst the first instance");
      146      assert.equal(second.state.prompt, "Second", "Link resolved
            against the second instance");
      147  
  ⎿  (timeout 3m 20s)

● The provenance check was my mistake: settings comes from a single layer, so
  its provenance is recorded at settings itself, not beneath it.

● Bash(sed -i 's/    assert.equal(fluid.get(firstMap, \["settings", "size",
      "width", fluid.metadataSymbol, "source"\]), "fluid.tests.sharedRoot",
      "Provenance held in t…)
  ⎿  14:24:33.693:   fq:  All tests concluded: 326/326 total passed in 1738
     ms - PASS
  ⎿  Updated tests/framework-tests/core/js/FluidILTests.js (+1 -1)
      138      fluid.cell.stabilize();
      139      const firstMap = shadowOf(first).layerMap, secondMap = sha
           dowOf(second).layerMap;
      140      assert.strictEqual(firstMap.settings, secondMap.settings, 
           "Layer map of a member merged only from definitions shared by 
           instances");
      141 -    assert.equal(fluid.get(firstMap, ["settings", "size", "wid
          -th", fluid.metadataSymbol, "source"]), "fluid.tests.sharedRoot
          -", "Provenance held in the shared map");                      
      141 +    assert.equal(fluid.get(firstMap, ["settings", fluid.metada
          +taSymbol, "source"]), "fluid.tests.sharedRoot", "Provenance he
          +ld in the shared map");                                       
      142      assert.notStrictEqual(firstMap.source, secondMap.source, "
           Layer map of a member supplied by a user record not shared");
      143      assert.notStrictEqual(firstMap.state, secondMap.state, "La
           yer map of a reactive root held in the live layer not shared")
           ;
      144      assert.equal(firstMap.state[fluid.metadataSymbol].reactive
           Links.length, 1, "Link of the reactive root recorded");
  ⎿  (timeout 3m 20s)

● All 326 IL tests pass. Next I'm checking that the merge-records test catches
  the bug it guards against, using a scratch copy where upgradeDynamicLayers
  mutates the shared records again.

  Ran 1 shell command (ctrl+o to expand)

● The test fails on the mutant as intended. Final full-suite run:

  Ran 1 shell command (ctrl+o to expand)

● I made three shadow contents shareable across instances of the same definition
  chain. The gain is modest, because most of what a shadow holds differs per
  instance:

  - Memory: retained heap after a ponder build fell from 449 to 430 MB (about
    4%), the same in every run.
  - Speed: about 5–6% faster. Over five alternating pairs, the median wall time
    went from 26.3 s to 24.6 s and CPU from 26.9 s to 25.6 s, though the runs
    are noisy.
  - Correctness: the output is byte-for-byte identical under Node 18 and Node
    16.6.2. The full suite passes (1864/1864), as do both server tests and the
    20 browser demo steps.

  Nothing is committed.

  What is now shared

  1. Layer maps, 21 → 7.5 MB. A member that only definitions contribute to is
     merged once per chain, and now every instance's layer map points at the
     chain's subtree for it. Before, provenance was copied into each instance.
     This is in fluid.chainMember and fluid.planRootMerge in Fluid.js.
     - Reactive roots don't benefit in practice: on creation each instance
       writes its reactive root's value into its live layer, so from then on
       it's the instance's own member. Only the first merge, before that write,
       takes the shared path.
  2. Definition merge records, and the resolved $layers array. Components that
     resolve the same chain from the same definitions now share one set of
     records (fluid.definitionMergeRecords). The check for whether a component
     needs re-merging now compares that one shared array instead of building a
     per-instance list of inputs. lastMerge fell from 7.4 to 4.5 MB.
     - This required one behaviour change: fluid.upgradeDynamicLayers used to
       modify definition records in place. It now replaces them with copies in
       the component's own array, so one instance can't change another's
       priorities.
  3. Context names for scopes. The names a component's layers contribute are
     worked out once per resolved $layers array (fluid.layerScopeNames), and
     each instance uses one scope record for all of them. This saves little
     memory: ownScope stays at about 5.4 MB, because the scope objects
     themselves account for most of it.

  A leak fixed along the way

  A definition that was unavailable during resolution used to be stood in for by
  a fresh empty layer each time. A chain containing one could never match its
  earlier cache entries, so both chain caches kept growing under its strongest
  layer. These stand-ins are now marked (fluid.placeholderLayer), and chains
  containing one are kept out of the caches. There is no test for this.

  What can't be shared by chain

  These shadow contents hold per-instance signals, references or component
  pointers:

  ┌─────────────────────┬─────────┐
  │        Field        │  Size   │
  ├─────────────────────┼─────────┤
  │ shadowMap           │ 16.6 MB │
  ├─────────────────────┼─────────┤
  │ sitedRefMap         │ 10.3 MB │
  ├─────────────────────┼─────────┤
  │ oldShadowMap        │ 4.5 MB  │
  ├─────────────────────┼─────────┤
  │ contextReferenceMap │ 1.6 MB  │
  └─────────────────────┴─────────┘

  Together with ownScope, the shadow fields now hold about 50 MB. Most of the
  remaining ~380 MB is the 259k cells and the rendered documents. To go further:

  - oldShadowMap: it could probably be released once effects have been
    reconciled after each turnover. That would save 4.5 MB regardless of chains,
    but the timing around effect allocation needs care.
  - ownScope: it would need restructuring so that one scope shared by a chain
    resolves to a placeholder for "the component itself", instead of holding
    each instance's own record.
  - The cell count: this is the larger prize, but sharing alone won't reduce it.

  New tests in FluidILTests.js

  - "Layer maps of members merged only from definitions are shared by instances 
    of the chain" checks that a nested member's layer map is shared along with
    its provenance. It also checks that members from a user record and reactive
    roots are not shared, and that each instance's links and writes stay its
    own.
  - "Merge records of definitions shared by components resolving the same chain"
    fails on a scratch copy where upgradeDynamicLayers modifies the shared
    records again, as the old code did.

✻ Brewed for 27m 12s · done 14:25

※ recap: You asked me to share shadow contents across components built from the same definition chain; that's done, saving about 4% of heap and 5% of time with identical output and passing tests. Next is your review, since nothing is committed. (disable recaps in /config)
  ⎿  Referenced file tests/framework-tests/core/js/FluidILTests.js
  ⎿  Read a-scratch/reports/component-census.md (134 lines)
  ⎿  Read a-scratch/census/chainCensus.js (175 lines)
  ⎿  Read a-scratch/reports/non-associative-merging.md (99 lines)  ⎿  Referenced file tests/framework-tests/core/js/FluidSignalsTests.js

● Compacted while idle, before the prompt cache expired · turn off with 
  "idleCompaction": false in settings.json

❯ Any reason for this diff?         const openFits =                            
  [...fluid.cell.CurrentFits].filter(fit => !fit.staticFit).map(fit =>          
  fit.fitId);                                                                   

  Ran 2 shell commands (ctrl+o to expand)

● Yes, the change is needed. fluid.cell.CurrentFits used to be an array, and it
  is now a Set (src/framework/core/js/FluidSignals.js:254). I made that change
  during the observer-removal hotspot fix. Ending a fit used to call
  fluid.removeArrayElement, which costs time proportional to the number of open
  fits. With a Set, it is now CurrentFits.delete(fit), which takes constant
  time.

  A Set has no .filter, so the old line in
  tests/test-core/qunit/js/qunit-fluid.js:157 would now throw. Spreading the set
  into an array first, [...fluid.cell.CurrentFits], fixes that. I changed the
  other places that read the collection in the same way, including
  fluid.cell.isQuiescent at FluidSignals.js:1397.

  The same diff also shows qunit-fluid.js changing from mode 100644 to 100755. I
  didn't make that change on purpose. It's probably the vboxsf mount reporting
  every file as executable, which would also explain why so many unrelated files
  show as modified in git status. Running git config core.fileMode false would
  hide these mode-only changes, but that's a git setting, so I've left it for
  you to decide.

✻ Brewed for 29s · done 16:08

※ recap: We've been cutting the ponder build's memory and time in Infusion, and per-chain shadow sharing is done with all tests passing. Next, you could review the uncommitted changes and decide whether to set `core.fileMode false` to hide the mode-only diffs. (disable recaps in /config)