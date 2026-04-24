"use strict";

fluid.vizReactive.annotations.push({
    testName: "preact-signals: Should drop A->B->A updates",
    notesSequence: [{
        sequencePoint: 2,
        cellNotes: {
            a: `We've constructed an isolated cell a with an initial value of 2, and next we will set up a related cell\
            b with a relation computing its value as one less than a's value. Note that this is different to the widespread\
            style of reactive frameworks such as <a href="https://preactjs.com/guide/v10/signals">preact-signals</a>,\
            <a href="https://docs.solidjs.com/concepts/signals">solid-signals</a>, etc. which insist that a cell is committed\
            at the point of creation to being either a computed or a plain signal.`
        }
    }, {
        sequencePoint: 3,
        cellNotes: {
            b: `Note that although a relation has already been set up which will compute b's value as 1 = 2 - 1, \
            it is currently unevaluated because no read or effect has so far demanded its value.
            It is however marked as red indicating that its value is stale and needs to be evaluated.
            This follows the lazy evaluation model of modern reactive systems.`
        }
    }, {
        sequencePoint: 6,
        cellNotes: {
            d: `The full reactive network is now set up, but b, c and d are still unevaluated since their\
            values have not been demanded. The next statement will now issue a read of d, triggering an evaluation\
            of the whole reactive network.`
        }
    }, {
        sequencePoint: 7,
        cellNotes: {
            b: `The first reactive step C7, coloured in purple, executes as part of honouring the demand for d. Forward\
            execution of the host program will pause until the demand for d is satisfied.
            This is the first point at which a <a href="https://ponder.org.uk/term/glitch/">glitch</a> may have occurred\
            in evaluating the dataflow graph. Faced with a choice of ordering, it is essential that the system evalutes\
            cell b before it evaluates c, which implies that a purely push-based reactive system runs the risk of glitching.
            Modern hybrid <a href="https://dev.to/playfulprogramming/derivations-in-reactivity-4fo1">push-pull</a>\
            systems efficiently avoid this risk.
            Since we are now in a reactive computation, the visualisation will highlight the path to the original\
            cause of the update, the initial value of a, in a glowing red path, using fluid.cell's\
            <a href="https://ponder.org.uk/docs/fluid-signals/#fluidfindcausecell">findCause</a> API. This\
            is a new capability in fluid.cell above other reactive systems.`
        }
    }, {
        sequencePoint: 8,
        cellNotes: {
            c: `Now that the values of a and b are fresh, we can proceed to compute the value of c as\
            2 = 1 + 1 in a glitch-free way.`
        }
    }, {
        sequencePoint: 10,
        cellNotes: {
            d: `The entire reactive network is now clean, and we have delivered the finally computed value of\
            "d: 3" to the client code. Note that as a side-effect, the compute function for d increments a global\
            value reporting that it has just executed once, as a result of the propagation of dataflow round\
            two paths in the network. This verifies another important property of glitch-freedom, that a single\
            data update does not cause extra notifications at the head of a graph where there are multiple\
            paths of propagation.`
        }
    }, {
        sequencePoint: 13,
        cellNotes: {
            a: `We have now pushed a fresh update of the value of a to the root of the network, and the network is\
            now in one of the more interesting states, corresponding to some of the diagrams in Milo Mighdoll's\
            guide to his own reactive system, <a href="https://milomg.dev/2022-12-01/reactivity#reactively">Reactively</a>,\
            on which fluid.cell's implementation is based.`,
            d: `Note that cell d now has the special green state known as "Check", meaning that it has been potentially\
            invalidated by the update of a, but not definitively so. Intermediate evaluation of b and c may end up\
            showing that d need not be evaluated at all. The use of this special "Check" state is one of the sophisticated\
            ways Milo's algorithm avoids expensively retraversing the reactive graph in the case where there are several\
            updates upstream in the graph but no intervening pull of the derived data.`
        }
    }, {
        sequencePoint: 15,
        cellNotes: {
            d: `Having refreshed c and observing that its value has indeed changed, note that the reactive algorithm\
            has updated the state of d from green "Check" to red "Dirty" meaning that it will definitely need to be reevaluated.`
        }
    }, {
        sequencePoint: 16,
        cellNotes: {
            d: `During the final update of d, note that the path of glowing red nodes computed using\
            fluid.cell's\ <a href="https://ponder.org.uk/docs/fluid-signals/#fluidfindcausecell">findCause</a> API\
            stretches all the way back to a, allowing the user to understand why d's value has changed. This\
            information is typically thrown away in reactive systems.`
        }
    }, {
        sequencePoint: 18,
        cellNotes: {
            d: `The graph is clean once more, the final value of d has been computed and delivered,\
            and the test fixture is <a href="https://www.youtube.com/watch?v=ChqHDVhAxp8&t=33s">finished</a>.`
        }
    }
    ]
}, {
    testName: "Bidirectional tests - Temperature conversion with two nodes",
    notesSequence: [{
        sequencePoint: 2,
        cellNotes: {
            C: `This test will set up two cells, C and F, to hold temperatures in Fahrenheit and Centigrade. The cells will\
            initially be isolated, with C given an initial value of 15, and F not given an initial value. By step 20, we will\
            have set up two computed arcs pointing backward and forward between them, allowing updates in one temperature\
            to be converted to updates to the other.`
        }
    }, {
        sequencePoint: 11,
        cellNotes: {
            F: `Because we have set up two\
            <a href="https://ponder.org.uk/docs/fluid-signals/#fluidcelleffectfn-staticsources-props">effects</a> which\
            actively pull values from C and F, and log them to sequences cSeq and fSeq, as soon as we set up the computed relation\
            computing F from C on this line, the computation executes and evalutes F to 59. Without the effect, F would have\
            remained stale as in the previous A->B->A example.`
        }
    }, {
        sequencePoint: 14,
        cellNotes: {
            F: `At this point, we set up a backward arc from F to C, allowing both cells to respond to updates to the other.\
            This is not possible in contemporary JavaScript reactive frameworks since their APIs and engines do not permit it,\
            but some older systems have allowed it.\
            See my <a href="https://ponder.org.uk/post/2026-02-20-reactivity-for-malleability/">posting</a> for more details.`
        }
    }, {
        sequencePoint: 18,
        cellNotes: {
            F: `We reset the test fixture and update the value of the C temperature. This will activate the forward arc, computing\
            the corresponding value of 68F and making the graph clean once more.`
        }
    }, {
        sequencePoint: 23,
        cellNotes: {
            F: `Now we propagate an update in the other direction - by setting F to 212, we activate the second arc\
            computing C as 100.`
        }
    }, {
        sequencePoint: 27,
        cellNotes: {
            F: `Now we will tear down the arc which leads from C to F, leaving only a unidirectional relationship which can\
            compute F from C. Again this is not possible in a traditional reactive library, where the lifetime of a computed\
            relationship must be the same as that of the cell it computes.`
        }
    }, {
        sequencePoint: 31,
        cellNotes: {
            F: `Because the C->F arc is gone, the value of F does not update here and stays as it was from the update on line 40.`
        }
    }, {
        sequencePoint: 34,
        cellNotes: {
            C: `However, the F->C arc remains, and because the effect pulling C's value is still active, the compute arc is now activated to\
            compute the value of 15C`
        }
    }, {
        sequencePoint: 41,
        cellNotes: {
            C: `Because we have now disposed of the effects pulling the values of F and C, after the update of F, the C cell\
            remains stale, as shown in red, because its value is no longer demanded and the remaining F->C arc is not activated.`
        }
    }
    ]
});
