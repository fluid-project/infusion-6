"use strict";

// The machinery by which an assistant converses with an AI model on the user's behalf, free of what it converses
// about: the services and models offered - the IFM proxy, the Inference Cooperative's models, and a local service whose
// key is found beside the page - calling them, estimating the tokens, energy and emissions of each call, and the loop
// of a conversation's exchange, in which an assistant (see AIAssistant, below) supplies the system prompt and
// interprets each reply, e.g. as text for the user or as changes to a workspace, reporting problems back to the AI for
// repair. Used by the "Ask me anything" panel, fluid-askAnything.vue beside this file, whose host supplies the assistant
// - e.g. Infusion's tldraw demo, whose assistant reflects on and alters the widgets on its canvas.
// See FLUID-7022

fluid.registerNamespace("fluid.ai");

/**
 * @typedef {Object} LocalService
 * @property {String} name - The service's name, for display
 * @property {String} endpoint - The URL of the service's chat completions endpoint
 * @property {String} key - The key presented to the service
 * @property {String[]} models - The models offered by the service which can converse, sorted by name
 * @property {String} defaultModel - The model chosen unless the user chooses another
 */

/**
 * @typedef {Object} ChatMessage
 * @property {String} role - One of "system", "user" or "assistant"
 * @property {String} content - The text of the message
 * @property {String} [reasoning] - For an assistant message, the reasoning which the model produced with it. This is
 * sent back verbatim as part of the conversation's history, which some models (e.g. IFM's) require.
 */

/**
 * The messages of one exchange of a conversation - the user's direction, followed by each of the AI's replies, and
 * between them any problems with its replies which were reported back to it for repair
 * @typedef {ChatMessage[]} ChatExchange
 */

/**
 * @typedef {Object} AIReply
 * @property {String} content - The content of the AI's reply
 * @property {String} [reasoning] - Any reasoning which the model reported separately from its content
 * @property {TokenUsage} [usage] - The numbers of tokens consumed by the request, if the endpoint reported them. This
 * is not part of the conversation, and is not retained in its history
 * @property {Boolean} [truncated] - `true` if the reply was cut off on reaching `fluid.ai.maxOutputTokens`. Like
 * `usage`, this is not retained in the conversation's history
 * @property {ImpactEstimate} [impact] - The energy and emissions of the request as its provider measured them, if the
 * endpoint reported them. Like `usage`, this is not retained in the conversation's history
 */

/**
 * @typedef {Object} TokenUsage
 * @property {Number} inputTokens - The number of tokens in the request's messages
 * @property {Number} outputTokens - The number of tokens in the reply, including any reasoning
 * @property {Number} [reasoningTokens] - The number of the output tokens spent on reasoning, if reported
 * @property {Number} [cachedTokens] - The number of the input tokens which the endpoint served from its cache, if reported
 */

// A password-protected proxy which swaps a token derived from the password for the real key of the IFM endpoint - a
// Cloudflare Worker, see workers/ifm-proxy/proxy.mjs in the imerss-cloudflare repository
fluid.ai.endpoint = "https://ifm-proxy.imerss.workers.dev/v1/chat/completions";

// The proxy only forwards POSTs, so the models it offers cannot be listed - the panel displays this model read-only
fluid.ai.defaultModel = "IFM/K2-Horizon-375B-A23B";

// The Inference Cooperative's models, reached through a relay which adds the co-op's key, so that they are always
// available, needing no password - a Cloudflare Worker, see workers/inference-proxy/proxy.mjs in the imerss-cloudflare
// repository. The relay accepts only these models.
fluid.ai.coopService = {
    name: "Inference Co-op",
    endpoint: "https://inference-proxy.imerss.workers.dev/v1/chat/completions",
    models: [
        "greenpt/glm-5.3-flash",
        "greenpt/deepseek-v4.1-flash",
        "regolo/gemma4-31b",
        "regolo/mistral-small-4-119b"
    ],
    // The providers serving models from renewable energy, by the prefix of the ids of their models - such models are
    // marked with a leaf where models are offered, see fluid.ai.renewableProvider
    renewableProviders: {
        "greenpt/": "GreenPT",
        "regolo/": "Regolo"
    },
    // How the co-op is credited whilst one of its models is in use - see fluid.askAnything.attribution
    attribution: {
        // PROVISIONAL wording, to be replaced by that agreed with the co-op
        text: "AI models provided by the Inference Cooperative, a member-owned and member-governed AI service.",
        linkText: "Terms of Service",
        url: "https://git.inference.coop/co-op/docs/src/branch/main/governance/terms-of-service.md#4-acceptable-use"
    }
};

/**
 * Find the provider serving a model from renewable energy, by the prefixes of `fluid.ai.coopService.renewableProviders`
 * @param {String} model - The model's id, e.g. "greenpt/glm-5.3-flash"
 * @return {String|null} The provider's name, e.g. "GreenPT", or null if the model is not known to be so served
 */
fluid.ai.renewableProvider = function (model) {
    const prefix = Object.keys(fluid.ai.coopService.renewableProviders).find(oneprefix => model.startsWith(oneprefix));
    return prefix ? fluid.ai.coopService.renewableProviders[prefix] : null;
};

/**
 * Determine whether a model is served from renewable energy
 * @param {String} model - The model's id
 * @return {Boolean} `true` if it is - see `fluid.ai.renewableProvider`
 */
fluid.ai.isRenewable = model => fluid.ai.renewableProvider(model) !== null;

// An OpenAI-compatible service which is used in place of the IFM proxy if a key for it is found beside the page, as
// it is when the demo is served locally - the key's file is gitignored, so that it is never committed or deployed.
// Unlike the proxy, it lists the models it offers, from which the user chooses.
fluid.ai.localService = {
    name: "CAVI",
    // Relative to the page, holding JSON of the form {"key": "<key>"} - or null for a host offering no local service
    keyUrl: "cavi-key.json",
    endpoint: "https://ai.cavi.au.dk/v1/chat/completions",
    modelsUrl: "https://ai.cavi.au.dk/v1/models",
    // Chosen unless the user has chosen another, if the service offers it
    defaultModel: "natai/glm"
};

// Factors by which the energy and emissions of a reply of one of the Inference Co-op's models are estimated from the
// number of tokens it produced, as the co-op estimates them for its dashboards - see
// https://git.inference.coop/code/member-portal/src/branch/main/docs/energy-metrics.md (fitted 2026-10-28). They are
// used only where the response carries no measured `impact` - see fluid.ai.impactFromPayload - as GreenPT's
// responses do, passed on by the co-op's gateway. Each is matched by the model's id
// beginning with `prefix`, the first match winning. Input tokens are not counted, so they understate the compute used.
fluid.ai.coopImpactFactors = [
    // Fitted to the energy which GreenPT reports for its own requests, at the intensity of its grid
    {prefix: "greenpt/deepseek-v4.1-flash", whPerKiloToken: 0.3641, gramsPerKwh: 193.0, provenance: "measured"},
    {prefix: "greenpt/glm-5.3-flash", whPerKiloToken: 1.0782, gramsPerKwh: 193.0, provenance: "measured"},
    // An order of magnitude, at the EU grid's average intensity - an upper bound for Regolo, which uses renewable energy
    {prefix: "", whPerKiloToken: 0.5, gramsPerKwh: 250.0, provenance: "rough"}
];

/**
 * @typedef {Object} ImpactEstimate
 * @property {Number} energyWh - The estimated energy used, in watt-hours
 * @property {Number} emissionsGrams - The estimated emissions, in grams of CO2 equivalent
 * @property {String} provenance - "reported" if the provider measured the request itself, "measured" if the factors
 * were fitted to the provider's measurements, or "rough" if they are an order of magnitude
 */

// The factors converting the units in which a response's `impact` reports energy, to watt-hours, and emissions, to
// grams of CO2 equivalent - "Wms" is watt-milliseconds, i.e. millijoules, 3.6 million of which make a watt-hour
fluid.ai.impactUnits = {
    energy: {"Wms": 1 / 3600000, "Ws": 1 / 3600, "J": 1 / 3600, "mWh": 1 / 1000, "Wh": 1, "kWh": 1000},
    emissions: {"ugCO2e": 1 / 1000000, "mgCO2e": 1 / 1000, "gCO2e": 1, "kgCO2e": 1000}
};

/**
 * Read the energy and emissions of a request as its provider measured them, from the `impact` member of the response
 * of an OpenAI-compatible endpoint, as GreenPT reports it, e.g. `{energy: {total: 32252, unit: "Wms"}, emissions:
 * {total: 865, unit: "ugCO2e"}, ...}`
 * @param {Object} payload - The parsed body of the response
 * @return {ImpactEstimate|undefined} The measured impact, or `undefined` if the response did not report it in units
 * which are understood
 */
fluid.ai.impactFromPayload = function (payload) {
    const impact = payload.impact;
    const units = fluid.ai.impactUnits;
    const energyFactor = units.energy[impact?.energy?.unit];
    const emissionsFactor = units.emissions[impact?.emissions?.unit];
    return typeof(impact?.energy?.total) === "number" && typeof(impact.emissions?.total) === "number"
        && energyFactor && emissionsFactor ? {
            energyWh: impact.energy.total * energyFactor,
            emissionsGrams: impact.emissions.total * emissionsFactor,
            provenance: "reported"
        } : undefined;
};

/**
 * Estimate the energy and emissions of a reply from the number of tokens it produced, by the factors of
 * `fluid.ai.coopImpactFactors` - for a model of the Inference Co-op only, since no factors are known for others
 * @param {String} model - The model which replied
 * @param {Number} outputTokens - The number of tokens it produced, including reasoning
 * @return {ImpactEstimate|null} The estimate, or `null` if the model is not one of the Inference Co-op's
 */
fluid.ai.estimateImpact = function (model, outputTokens) {
    let togo = null;
    if (fluid.ai.coopService.models.includes(model) && typeof(outputTokens) === "number") {
        const factors = fluid.ai.coopImpactFactors.find(factor => model.startsWith(factor.prefix));
        const energyWh = outputTokens / 1000 * factors.whPerKiloToken;
        togo = {
            energyWh,
            emissionsGrams: energyWh / 1000 * factors.gramsPerKwh,
            provenance: factors.provenance
        };
    }
    return togo;
};

// Parameters for deriving the proxy token from the password, which must agree with those used to configure the proxy.
// The salt names the proxy's former home, kept so that the token is unchanged.
fluid.ai.tokenDerivation = {
    salt: "live.ponder.org.uk/ifm",
    iterations: 600000,
    bytes: 32
};

// The number of times a response which could not be applied is reported back to the AI for it to correct
fluid.ai.maxRepairs = 2;

// The most messages of earlier exchanges of the conversation which are sent along with each fresh direction - only
// whole exchanges are sent, so that fewer may be - see fluid.ai.recentExchanges
fluid.ai.maxHistory = 8;

// The number of tokens, including reasoning, which the AI may produce in one reply. Without this, the endpoint cuts off
// replies at 8192 tokens, which a reply reasoning at length about a composition may exceed before it begins its document
fluid.ai.maxOutputTokens = 32768;

/**
 * Derive the token presented to the proxy from a typed password, as lowercase hex of PBKDF2-HMAC-SHA256
 * @param {String} password - The password as typed by the user
 * @return {Promise<String>} A promise for the token
 */
fluid.ai.deriveToken = async function (password) {
    const {salt, iterations, bytes} = fluid.ai.tokenDerivation;
    // The browser provides Web Crypto only to a secure context - a page served over https, or from localhost
    if (!window.crypto?.subtle) {
        throw new Error("the browser provides no Web Crypto to this page, since it is not a secure context - serve it " +
            "over https, or open it at http://localhost rather than " + window.location.host);
    }
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt: encoder.encode(salt),
        iterations
    }, key, bytes * 8);
    return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

/**
 * Fetch the key of `fluid.ai.localService`, if one is held beside the page
 * @return {Promise<String|null>} A promise for the key, or `null` if none could be found
 */
fluid.ai.fetchLocalKey = async function () {
    let togo = null;
    // A host offering no local service, e.g. a published site, which holds no key beside its pages, names no keyUrl
    if (fluid.ai.localService.keyUrl) {
        try {
            const response = await fetch(fluid.ai.localService.keyUrl, {cache: "no-store"});
            if (response.ok) {
                const parsed = await response.json();
                togo = typeof(parsed?.key) === "string" && parsed.key.trim() ? parsed.key.trim() : null;
            }
        } catch (e) {
            // A missing key, or unparseable JSON, simply leaves the IFM proxy in use
            togo = null;
        }
    }
    return togo;
};

/**
 * Determine whether a model listed by an OpenAI-compatible endpoint can converse - those whose mode is not "chat",
 * e.g. for speech, are excluded, as are those whose names show them to be embedding models, which are listed as "chat"
 * @param {Object} model - The model's record as listed by the endpoint
 * @return {Boolean} `true` if the model can converse
 */
fluid.ai.isChatModel = function (model) {
    return (model.mode === undefined || model.mode === "chat") && !/embed/i.test(model.id);
};

/**
 * List the models offered by an OpenAI-compatible endpoint which can converse
 * @param {String} modelsUrl - The URL of the endpoint's model listing
 * @param {String} key - The key presented to the endpoint
 * @return {Promise<String[]>} A promise for the ids of the models, sorted
 */
fluid.ai.fetchModels = async function (modelsUrl, key) {
    const response = await fetch(modelsUrl, {
        headers: {"Authorization": "Bearer " + key}
    });
    let togo;
    if (response.ok) {
        const payload = await response.json();
        togo = (payload.data || []).filter(fluid.ai.isChatModel).map(model => model.id).sort();
    } else {
        throw new Error(`Failed to list models from ${modelsUrl}: ${response.status} ${response.statusText}`);
    }
    return togo;
};

/**
 * Look for a key for `fluid.ai.localService` beside the page, and if one is found, list the models it offers
 * @return {Promise<LocalService|null>} A promise for the service, or `null` if no key was found or its models could
 * not be listed
 */
fluid.ai.findLocalService = async function () {
    const service = fluid.ai.localService;
    const key = await fluid.ai.fetchLocalKey();
    let togo = null;
    if (key) {
        try {
            const models = await fluid.ai.fetchModels(service.modelsUrl, key);
            if (models.length > 0) {
                togo = {
                    name: service.name,
                    endpoint: service.endpoint,
                    key,
                    models,
                    defaultModel: models.includes(service.defaultModel) ? service.defaultModel : models[0]
                };
            } else {
                console.log(`${service.name} offers no models which can converse - using the IFM proxy`);
            }
        } catch (e) {
            console.log(`Found a key for ${service.name} but could not list its models - using the IFM proxy: `, e);
        }
    }
    return togo;
};

/**
 * Read the numbers of tokens consumed by a request from the response of an OpenAI-compatible endpoint
 * @param {Object} payload - The parsed body of the response
 * @return {TokenUsage|undefined} The numbers of tokens, or `undefined` if the response did not report them
 */
fluid.ai.usageFromPayload = function (payload) {
    const usage = payload.usage;
    const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
    const cachedTokens = usage?.prompt_tokens_details?.cached_tokens;
    return typeof(usage?.prompt_tokens) === "number" && typeof(usage.completion_tokens) === "number" ? {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        ...(typeof(reasoningTokens) === "number" ? {reasoningTokens} : {}),
        ...(typeof(cachedTokens) === "number" ? {cachedTokens} : {})
    } : undefined;
};

// The average number of characters per token, by which token counts are estimated where they were not reported
fluid.ai.charsPerToken = 4;

/**
 * Estimate the number of tokens in some texts, for use where an endpoint does not report them
 * @param {String[]} texts - The texts
 * @return {Number} The estimated number of tokens
 */
fluid.ai.estimateTokens = function (texts) {
    return Math.ceil(texts.reduce((total, text) => total + (text || "").length, 0) / fluid.ai.charsPerToken);
};

/**
 * Determine how many of the tokens sent in a request lie in the prefix of the prompt which is common to every request -
 * the part of the system prompt preceding a marker, e.g. the heading of material which changes between requests - and
 * so may be assumed to be cached by the endpoint. Given the
 * number of tokens which the endpoint reported, this is apportioned by the prefix's share of the request's text, and
 * otherwise it is estimated from the prefix's length.
 * @param {ChatMessage[]} messages - The messages sent
 * @param {Number} [inputTokens] - The number of tokens which the endpoint reported for the request, if any
 * @param {String} [prefixMarker] - The text of the system prompt at which its common prefix ends - see
 * `AIAssistant.cachePrefixMarker`
 * @return {Number} The number of tokens assumed to be cached
 */
fluid.ai.cachedTokens = function (messages, inputTokens, prefixMarker) {
    const system = messages.find(message => message.role === "system")?.content || "";
    // With no marker, no part of the prompt is known to be common to every request
    const prefixLength = prefixMarker ? Math.max(0, system.indexOf(prefixMarker)) : 0;
    const totalLength = messages.reduce((total, message) => total + (message.content || "").length, 0);
    return inputTokens === undefined ? Math.floor(prefixLength / fluid.ai.charsPerToken) :
        totalLength === 0 ? 0 : Math.round(inputTokens * prefixLength / totalLength);
};

/**
 * Select the messages of the most recent exchanges of a conversation which are to be sent with a fresh direction - as
 * many whole exchanges as together hold no more than `maxMessages` messages. An exchange is never sent in part, since
 * a reply or a reported problem would make no sense without the direction it answers.
 * @param {ChatExchange[]} history - The earlier exchanges of the conversation
 * @param {Number} [maxMessages] - The most messages to be selected
 * @return {ChatMessage[]} The messages of the selected exchanges, in order
 */
fluid.ai.recentExchanges = function (history, maxMessages = fluid.ai.maxHistory) {
    const selected = [];
    let count = 0;
    let full = false;
    for (let i = history.length - 1; i >= 0 && !full; --i) {
        if (count + history[i].length <= maxMessages) {
            selected.unshift(history[i]);
            count += history[i].length;
        } else {
            // Exchanges are only ever dropped from the start of the conversation, so that those sent are contiguous
            full = true;
        }
    }
    return selected.flat();
};

/**
 * Assemble the messages to be sent for a fresh direction from the user - the system prompt, followed by the most recent
 * exchanges of the conversation, as selected by `fluid.ai.recentExchanges`, and then the direction.
 * @param {String} systemPrompt - The system prompt
 * @param {ChatExchange[]} history - The earlier exchanges of the conversation
 * @param {String} direction - The user's direction
 * @param {String} [preamble] - Text preceding the direction, e.g. reminding the AI of the forms its response may take
 * @return {ChatMessage[]} The messages to be sent
 */
fluid.ai.buildMessages = function (systemPrompt, history, direction, preamble) {
    return [
        {role: "system", content: systemPrompt},
        ...fluid.ai.recentExchanges(history),
        {role: "user", content: (preamble ? preamble + "\n\n" : "") + direction}
    ];
};

/**
 * Call the AI endpoint with a conversation
 * @param {Object} options - The call's options
 * @param {String} [options.endpoint] - The endpoint to be called, by default the IFM proxy at `fluid.ai.endpoint`
 * @param {String} options.token - The token derived from the user's password, or the key of a local service, or an
 * empty string for an endpoint needing none, such as the Inference Co-op's
 * @param {String} options.model - The model to be used
 * @param {ChatMessage[]} options.messages - The messages to be sent
 * @return {Promise<AIReply>} A promise for the AI's reply. On a rejected token, the promise rejects with an error whose
 * `unauthorised` member is `true`
 */
fluid.ai.callEndpoint = async function ({endpoint = fluid.ai.endpoint, token, model, messages}) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? {"Authorization": "Bearer " + token} : {})
        },
        body: JSON.stringify({model, messages, stream: false, max_tokens: fluid.ai.maxOutputTokens})
    });
    let togo;
    if (response.ok) {
        const payload = await response.json();
        const choice = payload.choices?.[0];
        const message = choice?.message;
        const usage = fluid.ai.usageFromPayload(payload);
        const impact = fluid.ai.impactFromPayload(payload);
        if (typeof(message?.content) === "string") {
            togo = {
                content: message.content,
                ...(typeof(message.reasoning) === "string" ? {reasoning: message.reasoning} : {}),
                ...(usage ? {usage} : {}),
                ...(impact ? {impact} : {}),
                ...(choice.finish_reason === "length" ? {truncated: true} : {})
            };
        } else {
            throw new Error("The AI endpoint returned no message: " + JSON.stringify(payload).substring(0, 500));
        }
    } else {
        const text = await response.text();
        const error = new Error(`The AI endpoint responded ${response.status} ${response.statusText}: ${text.substring(0, 500)}`);
        error.unauthorised = response.status === 401;
        throw error;
    }
    return togo;
};

/**
 * Remove any reasoning which a reasoning model has included in the content of its response
 * @param {String} text - The content of the response
 * @return {String} The content with any reasoning removed
 */
fluid.ai.stripReasoning = function (text) {
    const closeIndex = text.lastIndexOf("</think>");
    // Some models omit the opening tag, so everything up to the last closing tag is discarded
    const afterReasoning = closeIndex === -1 ? text : text.substring(closeIndex + "</think>".length);
    return afterReasoning.trim();
};

/**
 * Describe an error, which may be an unavailable value, as text
 * @param {Error|Unavailable|any} error - The error
 * @return {String} A description of the error
 */
fluid.ai.describeError = function (error) {
    let togo;
    if (fluid.isUnavailable(error)) {
        togo = fluid.unavailableToCauses(fluid.unProxy(error)).map(cause => cause.message).join("; ");
    } else if (error instanceof Error) {
        togo = error.message;
    } else {
        togo = String(error);
    }
    return togo;
};

/**
 * @typedef {Object} ChatEntry
 * @property {String} kind - "assistant" for text addressed to the user by the AI, "change" for a change it made to the
 * host, e.g. to a workspace, "problem" for problems it was asked to correct, or "error" for a failure which ended the exchange
 * @property {String} text - The text of the entry
 * @property {String} [detail] - Further material, e.g. the document from which a change was made
 */

/**
 * Format a list of problems for display to the user
 * @param {String[]} problems - Descriptions of the problems
 * @return {String} The problems, one per line, each preceded by a bullet
 */
fluid.ai.listProblems = function (problems) {
    return problems.map(problem => "\u2022 " + problem).join("\n");
};

// The problem reported to the AI when its reply was cut off on reaching fluid.ai.maxOutputTokens
fluid.ai.truncationProblem = `Your response was cut off on reaching the limit of ${fluid.ai.maxOutputTokens} \
output tokens, before it was complete. Reason more briefly, and send only the parts which are required.`;


/**
 * What an assistant supplies to a conversation - the system prompt, and the interpretation of the AI's replies
 * @typedef {Object} AIAssistant
 * @property {Function} systemPrompt - Returns a {String|Promise<String>} for the system prompt, assembled afresh for
 * each request of an exchange, so that it may reflect changes already made
 * @property {Function} interpret - Accepts the content of a reply and `{model, direction}`, and returns a
 * {Promise<AIInterpretation>} for what it is to the user, and any problems to be reported back to the AI
 * @property {String|Function} [directionPreamble] - Text preceding each direction of the user's, or a function returning
 * it, called once for each direction
 * @property {Function} [repairMessage] - Accepts the {String[]} problems found in a reply, and the {String[]} results of
 * what of it was acted on, and returns the
 * {ChatMessage} reporting them back to the AI - by default, `fluid.ai.repairMessage`
 * @property {String} [cachePrefixMarker] - The text of the system prompt at which its part common to every request
 * ends - see `fluid.ai.cachedTokens`
 * @property {Function} [describeOutcome] - Accepts the content of a reply, and returns a {String} describing what it
 * was, e.g. "text", for the measurements of a call
 * @property {Function} [isReady] - Returns `false` whilst the assistant cannot yet converse, e.g. whilst what it
 * reflects on is not yet available
 */

/**
 * @typedef {Object} AIInterpretation
 * @property {ChatEntry[]} entries - What is to be shown to the user of the reply
 * @property {String[]} problems - Problems found in the reply, to be reported back to the AI for repair
 * @property {String[]} [results] - Descriptions of what of the reply was acted on, reported back with any problems
 */

/**
 * Assemble the message reporting back to the AI that its response could not be acted on, as an assistant does which
 * supplies no `repairMessage` of its own
 * @param {String[]} problems - Descriptions of what went wrong
 * @return {ChatMessage} The message to be sent
 */
fluid.ai.repairMessage = function (problems) {
    return {
        role: "user",
        content: "Your response could not be acted on:\n\n" + problems.map(problem => "* " + problem).join("\n")
            + "\n\nPlease respond again, correcting these problems."
    };
};

/**
 * Make an assistant which converses in plain text - each reply is shown to the user as it stands. The assistant of the
 * "Ask me anything" panel when its host supplies none
 * @param {String} [systemPrompt] - The system prompt
 * @return {AIAssistant} The assistant
 */
fluid.ai.plainAssistant = function (systemPrompt = "You are a helpful assistant. Answer concisely, in markdown.") {
    return {
        systemPrompt: () => systemPrompt,
        interpret: async content => ({entries: [{kind: "assistant", text: fluid.ai.stripReasoning(content)}], problems: []}),
        describeOutcome: () => "text"
    };
};

/**
 * Carry out one exchange with the AI on the user's direction. Each reply is interpreted by the assistant, and any
 * problems it finds are reported back to the AI for it to correct, up to `fluid.ai.maxRepairs` times. The system
 * prompt is assembled afresh for each request, so that it reflects any changes already made.
 * @param {Object} options - The exchange's options
 * @param {String} options.direction - The user's direction
 * @param {ChatExchange[]} options.history - The earlier exchanges of the conversation
 * @param {String} [options.model] - The id of the model being conversed with
 * @param {AIAssistant} options.assistant - The assistant
 * @param {Function} options.call - Accepts a {ChatMessage[]} and returns a {Promise<AIReply|String>} for the AI's
 * response, a String being taken as its content
 * @param {Function} options.report - Accepts a {ChatEntry} to be shown to the user
 * @return {Promise<ChatExchange[]>} A promise for the conversation's history including this exchange, which rejects if
 * a request fails
 */
fluid.ai.converse = async function ({direction, history, model, assistant, call, report}) {
    const preamble = typeof(assistant.directionPreamble) === "function" ? assistant.directionPreamble() : assistant.directionPreamble;
    const messages = fluid.ai.buildMessages("", history, direction, preamble);
    // The messages of this exchange begin with the direction, following the system prompt and earlier exchanges
    const exchangeStart = messages.length - 1;
    const repairMessage = assistant.repairMessage || fluid.ai.repairMessage;
    let repairs = 0;
    let done = false;
    while (!done) {
        messages[0].content = await assistant.systemPrompt();
        const received = await call(messages);
        // Any token usage or impact is not part of the conversation, and is reported by the caller - see measureCall
        // eslint-disable-next-line no-unused-vars
        const {usage, impact, truncated, ...reply} = typeof(received) === "string" ? {content: received} : received;
        // The reply is retained verbatim, together with any reasoning, since some models reject a history in which
        // their earlier turns have been altered
        messages.push({role: "assistant", ...reply});
        // A reply which was cut off is neither a complete answer nor a complete document, and may hold nothing but the
        // AI's reasoning, so it is never shown to the user as an answer
        const {entries, problems, results = []} = truncated ? {entries: [], problems: [fluid.ai.truncationProblem]} :
            await assistant.interpret(reply.content, {model, direction});
        entries.forEach(report);
        if (problems.length === 0) {
            done = true;
        } else if (repairs < fluid.ai.maxRepairs) {
            ++repairs;
            report({kind: "problem", text: `Asking the AI to correct its response (attempt ${repairs} of ${fluid.ai.maxRepairs}):\n`
                + fluid.ai.listProblems(problems)});
            messages.push(repairMessage(problems, results));
        } else {
            report({kind: "error", text: "The AI's response could not be fully applied:\n" + fluid.ai.listProblems(problems)});
            done = true;
        }
    }
    return [...history, messages.slice(exchangeStart)];
};
