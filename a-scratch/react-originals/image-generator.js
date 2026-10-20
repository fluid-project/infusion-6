/**
 * Image Generator Widget
 * Generates AI images from text prompts and places them on the canvas.
 * Uses: generateImageAsset(prompt, {width, height}), editor.createShape(), shape prop for positioning
 *
 * Changelog:
 * v3: Documented the code
 * v2: Implemented image generation
 * v1: Widget created
 */

import React, { useState } from 'react';
import { useEditor } from 'tldraw';
import { generateImageAsset } from '#Agents .widget-helpers';

export function Widget({ shape }) {
    // State: prompt (user input), isGenerating (loading flag), error (error message)
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);
    const editor = useEditor();

    /** Generates image from prompt and creates shape on canvas */
    async function handleGenerate() {
        if (!prompt.trim()) { setError('Please enter a prompt'); return; }
        setIsGenerating(true);
        setError(null);

        try {
            const assetId = await generateImageAsset(prompt, { width: 1024, height: 1024 });
            const imagePosition = calculateImagePosition(shape);
            editor.createShape({
                type: 'image',
                x: imagePosition.x,
                y: imagePosition.y,
                props: { assetId, w: 1024, h: 1024 },
            });
            setPrompt('');
        } catch (err) {
            setError('Failed to generate image. Please try again.');
            console.error('Image generation error:', err);
        } finally {
            setIsGenerating(false);
        }
    }

    /** Returns {x, y} position to the right of widget, or viewport center as fallback */
    function calculateImagePosition(widgetShape) {
        if (widgetShape) {
            const widgetWidth = widgetShape.props.w || 300;
            return { x: widgetShape.x + widgetWidth + 20, y: widgetShape.y };
        }
        const viewport = editor.getViewportPageBounds();
        return { x: viewport.x + (viewport.w / 2) - 512, y: viewport.y + (viewport.h / 2) - 512 };
    }

    function handleKeyPress(event) {
        if (event.key === 'Enter' && !isGenerating) handleGenerate();
    }

    return (
        <div style={containerStyle}>
            <h3 style={titleStyle}>Image Generator</h3>
            <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Describe the image you want..."
                disabled={isGenerating}
                style={inputStyle}
            />
            <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                style={{
                    ...buttonStyle,
                    backgroundColor: (isGenerating || !prompt.trim()) ? '#999' : '#4a90d9',
                    cursor: (isGenerating || !prompt.trim()) ? 'not-allowed' : 'pointer',
                }}
            >
                {isGenerating ? 'Generating...' : 'Generate Image'}
            </button>
            {error && <p style={errorStyle}>{error}</p>}
            {isGenerating && <p style={loadingStyle}>Creating your image... This may take a moment.</p>}
        </div>
    );
}

const containerStyle = {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    padding: '16px', boxSizing: 'border-box', backgroundColor: '#f5f5f5',
    fontFamily: 'system-ui, -apple-system, sans-serif',
};
const titleStyle = { margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#333' };
const inputStyle = {
    width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #ccc',
    boxSizing: 'border-box', marginBottom: '12px', outline: 'none',
};
const buttonStyle = {
    padding: '10px 16px', fontSize: '14px', fontWeight: '500', color: '#fff',
    border: 'none', transition: 'background-color 0.2s',
};
const errorStyle = { marginTop: '12px', color: '#d32f2f', fontSize: '13px' };
const loadingStyle = { marginTop: '12px', color: '#666', fontSize: '13px' };
