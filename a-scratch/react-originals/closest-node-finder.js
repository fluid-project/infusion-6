/**
 * Closest Note Finder
 * ===================
 *
 * Finds the closest sticky note to this widget and displays its text content with distance
 *
 * Changelog:
 * v3: Documented the code
 * v2: Implemented closest sticky note finder
 * v1: Widget created
 */

import React, { useState, useEffect } from 'react';
import { useEditor } from 'tldraw';

export function Widget({ shape }) {
    const editor = useEditor();
    const [closestNoteText, setClosestNoteText] = useState('');
    const [closestDistance, setClosestDistance] = useState(null);

    useEffect(() => {
        const updateClosestNote = () => {
            const allShapesOnCanvas = editor.getCurrentPageShapes();

            const stickyNotes = allShapesOnCanvas.filter(currentShape =>
                currentShape.type === 'note' && currentShape.id !== shape.id
            );

            if (stickyNotes.length === 0) {
                setClosestNoteText('No sticky notes found');
                setClosestDistance(null);
                return;
            }

            let closestNote = null;
            let minimumDistanceFound = Infinity;

            for (const note of stickyNotes) {
                const horizontalDelta = note.x - shape.x;
                const verticalDelta = note.y - shape.y;

                // Euclidean distance: √(Δx² + Δy²)
                const distanceToNote = Math.sqrt(
                    horizontalDelta * horizontalDelta +
                    verticalDelta * verticalDelta
                );

                if (distanceToNote < minimumDistanceFound) {
                    minimumDistanceFound = distanceToNote;
                    closestNote = note;
                }
            }

            if (closestNote) {
                const displayDistance = Math.round(minimumDistanceFound);
                setClosestDistance(displayDistance);

                // tldraw stores note text in richText.content as nested paragraph/text blocks
                let extractedText = '';
                const richTextContent = closestNote.props?.richText?.content;

                if (richTextContent) {
                    for (const block of richTextContent) {
                        if (block.content) {
                            for (const inlineElement of block.content) {
                                if (inlineElement.text) {
                                    extractedText += inlineElement.text;
                                }
                            }
                        }
                    }
                }

                setClosestNoteText(extractedText || 'Empty note');
            }
        };

        updateClosestNote();

        // Listen to all document changes to update when shapes move/change
        const unsubscribeFromStore = editor.store.listen(
            updateClosestNote,
            { scope: 'document' }
        );

        return () => {
            unsubscribeFromStore();
        };
    }, [editor, shape.x, shape.y, shape.id]);

    return (
        <div style={{
            padding: '16px',
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#fffde7',
            fontFamily: 'sans-serif'
        }}>
            <h3 style={{
                margin: '0 0 12px 0',
                fontSize: '14px',
                color: '#666'
            }}>
                Closest Sticky Note
            </h3>

            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#333',
                textAlign: 'center'
            }}>
                {closestNoteText}
            </div>

            {closestDistance !== null && (
                <div style={{
                    fontSize: '12px',
                    color: '#888',
                    textAlign: 'center',
                    marginTop: '8px'
                }}>
                    Distance: {closestDistance}px
                </div>
            )}
        </div>
    );
}
