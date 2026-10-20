/**
 * Changelog:
 * v3: Added image generation feature that appears when all sentences are short:
 *     - Integrated useEditor, generateImageAsset for canvas image creation
 *     - Added celebratory section with text input and Generate Image button
 *     - Images are placed to the right of the widget on the canvas
 *     - Kid-friendly styling with soft colors and rounded corners
 * v2: Created kid-friendly story writing widget with:
 *     - Large text area for typing stories
 *     - Real-time highlighting of long sentences (>10 words) in pink
 *     - Smiley face indicator showing sentence quality
 *     - Cheerful, kid-friendly design
 * v1: Widget created
 */

import React, { useState, useMemo } from 'react';
import { useEditor } from 'tldraw';
import { generateImageAsset, convertAndValidateShapes } from '#Agents .widget-helpers';

export function Widget({ shape }) {
    const [text, setText] = useState('');
    const [imagePrompt, setImagePrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [imageError, setImageError] = useState(null);

    const editor = useEditor();

    // Parse sentences and analyze them
    const analysis = useMemo(() => {
        if (!text.trim()) {
            return { sentences: [], longCount: 0, totalCount: 0 };
        }

        // Split by sentence-ending punctuation, keeping the punctuation
        const sentenceRegex = /[^.!?]*[.!?]+/g;
        const matches = text.match(sentenceRegex) || [];

        const sentences = matches.map(sentence => {
            const trimmed = sentence.trim();
            const words = trimmed.split(/\s+/).filter(w => w.length > 0);
            const wordCount = words.length;
            const isTooLong = wordCount > 10;
            return { text: trimmed, wordCount, isTooLong };
        });

        const longCount = sentences.filter(s => s.isTooLong).length;
        const totalCount = sentences.length;

        return { sentences, longCount, totalCount };
    }, [text]);

    const handleGenerate = async () => {
        if (!imagePrompt.trim()) return;

        setIsGenerating(true);
        setImageError(null);

        try {
            const assetId = await generateImageAsset(imagePrompt, { width: 1024, height: 1024 });

            // Calculate position: to the right of this widget, or viewport center as fallback
            let posX, posY;
            try {
                const widgetShape = editor.getShape(shape.id);
                if (widgetShape) {
                    posX = widgetShape.x + (widgetShape.props.w || 700) + 50;
                    posY = widgetShape.y;
                } else {
                    const viewport = editor.getViewportPageCenter();
                    posX = viewport.x;
                    posY = viewport.y;
                }
            } catch (e) {
                const viewport = editor.getViewportPageCenter();
                posX = viewport.x;
                posY = viewport.y;
            }

            const shapeDraft = {
                type: 'image',
                x: posX,
                y: posY,
                props: {
                    assetId: assetId,
                    w: 512,
                    h: 512,
                },
            };

            const { validatedShapes, errors } = convertAndValidateShapes([shapeDraft]);
            if (errors.length > 0) {
                throw new Error(errors.join('; '));
            }
            editor.createShapes(validatedShapes);

            setImagePrompt('');
        } catch (err) {
            setImageError(err.message || 'Failed to generate image.');
        } finally {
            setIsGenerating(false);
        }
    };

    // Determine smiley based on sentence analysis
    const getSmiley = () => {
        const { longCount, totalCount } = analysis;

        if (totalCount === 0) {
            return { emoji: '😊', color: '#4CAF50', label: 'Start writing!' };
        }

        const longRatio = longCount / totalCount;

        if (longRatio <= 0.2) {
            return { emoji: '😊', color: '#4CAF50', label: 'Great job!' };
        } else if (longRatio <= 0.5) {
            return { emoji: '😐', color: '#FFC107', label: 'Some sentences are long' };
        } else {
            return { emoji: '😟', color: '#FF5722', label: 'Try shorter sentences' };
        }
    };

    const smiley = getSmiley();

    // Create highlighted text display
    const renderHighlightedText = () => {
        if (!text.trim()) return null;

        let remaining = text;
        const elements = [];
        let key = 0;

        for (const sentence of analysis.sentences) {
            const idx = remaining.indexOf(sentence.text);
            if (idx > 0) {
                // Add any text before this sentence (whitespace, etc.)
                elements.push(<span key={key++}>{remaining.substring(0, idx)}</span>);
            }

            const style = sentence.isTooLong ? {
                backgroundColor: '#FFB6C1',
                borderRadius: '3px',
                padding: '0 2px'
            } : {};

            elements.push(
                <span key={key++} style={style} title={sentence.isTooLong ? `${sentence.wordCount} words - try making it shorter!` : `${sentence.wordCount} words - good length!`}>
                    {sentence.text}
                </span>
            );

            remaining = remaining.substring(idx + sentence.text.length);
        }

        // Add any remaining text
        if (remaining) {
            elements.push(<span key={key++}>{remaining}</span>);
        }

        return elements;
    };

    const containerStyle = {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
        backgroundColor: '#E8F5E9',
        padding: '16px',
        boxSizing: 'border-box',
        overflow: 'hidden'
    };

    const headerStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        flexShrink: 0
    };

    const titleStyle = {
        fontSize: '28px',
        fontWeight: 'bold',
        color: '#2E7D32',
        margin: 0,
        textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
    };

    const smileyContainerStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: '8px 16px',
        border: `3px solid ${smiley.color}`,
        minWidth: '120px'
    };

    const smileyStyle = {
        fontSize: '40px',
        lineHeight: 1
    };

    const smileyLabelStyle = {
        fontSize: '12px',
        color: smiley.color,
        fontWeight: 'bold',
        marginTop: '4px',
        textAlign: 'center'
    };

    const editorContainerStyle = {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'white',
        border: '3px solid #81C784',
        overflow: 'hidden',
        position: 'relative',
        minHeight: 0
    };

    const textAreaStyle = {
        width: '100%',
        height: '100%',
        padding: '16px',
        fontSize: '20px',
        lineHeight: '1.8',
        fontFamily: 'inherit',
        border: 'none',
        outline: 'none',
        resize: 'none',
        backgroundColor: 'transparent',
        boxSizing: 'border-box',
        color: 'transparent',
        caretColor: '#333',
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 2
    };

    const highlightLayerStyle = {
        width: '100%',
        height: '100%',
        padding: '16px',
        fontSize: '20px',
        lineHeight: '1.8',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        color: '#333',
        overflow: 'auto',
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1
    };

    const statsStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: '#C8E6C9',
        fontSize: '14px',
        color: '#2E7D32',
        fontWeight: 'bold',
        flexShrink: 0
    };

    const tipStyle = {
        marginTop: '8px',
        padding: '8px 12px',
        backgroundColor: '#FFF9C4',
        border: '2px dashed #FBC02D',
        fontSize: '14px',
        color: '#F57F17',
        textAlign: 'center',
        flexShrink: 0
    };

    const imageGenSectionStyle = {
        marginTop: '10px',
        padding: '12px 16px',
        backgroundColor: '#E3F2FD',
        border: '2px solid #90CAF9',
        borderRadius: '12px',
        flexShrink: 0
    };

    const imageGenHeaderStyle = {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1565C0',
        marginBottom: '8px',
        textAlign: 'center'
    };

    const imageGenInputRowStyle = {
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
    };

    const imageGenInputStyle = {
        flex: 1,
        padding: '8px 12px',
        fontSize: '15px',
        fontFamily: 'inherit',
        border: '2px solid #90CAF9',
        borderRadius: '8px',
        outline: 'none',
        backgroundColor: 'white',
        boxSizing: 'border-box'
    };

    const imageGenButtonStyle = {
        padding: '8px 16px',
        fontSize: '15px',
        fontFamily: 'inherit',
        fontWeight: 'bold',
        color: 'white',
        backgroundColor: isGenerating ? '#90CAF9' : '#42A5F5',
        border: 'none',
        borderRadius: '8px',
        cursor: isGenerating ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0
    };

    const imageGenErrorStyle = {
        marginTop: '6px',
        fontSize: '13px',
        color: '#D32F2F',
        textAlign: 'center'
    };

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <h1 style={titleStyle}>📝 My Story Time! 📝</h1>
                <div style={smileyContainerStyle}>
                    <span style={smileyStyle}>{smiley.emoji}</span>
                    <span style={smileyLabelStyle}>{smiley.label}</span>
                </div>
            </div>

            <div style={editorContainerStyle}>
                <div style={highlightLayerStyle}>
                    {renderHighlightedText()}
                </div>
                <textarea
                    style={textAreaStyle}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Start writing your story here... 🌟"
                />
            </div>

            <div style={statsStyle}>
                <span>📖 Sentences: {analysis.totalCount}</span>
                <span>✨ Good sentences: {analysis.totalCount - analysis.longCount}</span>
                <span style={{ color: analysis.longCount > 0 ? '#E53935' : '#2E7D32' }}>
                    📏 Long sentences: {analysis.longCount}
                </span>
            </div>

            {analysis.longCount === 0 && analysis.totalCount > 0 && (
                <div style={imageGenSectionStyle}>
                    <div style={imageGenHeaderStyle}>
                        🎨 Great writing! Generate an illustration:
                    </div>
                    <div style={imageGenInputRowStyle}>
                        <input
                            type="text"
                            style={imageGenInputStyle}
                            placeholder="Describe your illustration... 🖌️"
                            value={imagePrompt}
                            onChange={(e) => setImagePrompt(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
                            disabled={isGenerating}
                        />
                        <button
                            style={imageGenButtonStyle}
                            onClick={handleGenerate}
                            disabled={isGenerating}
                        >
                            {isGenerating ? 'Generating...' : 'Generate Image'}
                        </button>
                    </div>
                    {imageError && (
                        <div style={imageGenErrorStyle}>⚠️ {imageError}</div>
                    )}
                </div>
            )}

            <div style={tipStyle}>
                💡 <strong>Tip:</strong> Try to keep your sentences short and sweet!
                Sentences with more than 10 words will turn pink.
                Can you make them shorter?
            </div>
        </div>
    );
}
