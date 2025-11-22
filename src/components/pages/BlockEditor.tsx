import React, { useState } from 'react';
import { FaMagic } from 'react-icons/fa';
import {
  HeroBlockEditor,
  TextBlockEditor,
  ImageBlockEditor,
  TextImageBlockEditor,
  FeaturesBlockEditor,
  CTABlockEditor,
  FAQAccordionBlockEditor,
} from './BlockEditors';

interface BlockEditorProps {
  block: {
    blockId: string;
    blockType: string;
    enabled: boolean;
    order: number;
    data: any;
  };
  onChange: (data: any) => void;
  onGenerateAI?: (blockType: string, existingData: any) => Promise<any>;
}

const BlockEditor: React.FC<BlockEditorProps> = ({ block, onChange, onGenerateAI }) => {
  const [generating, setGenerating] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleGenerateAI = async () => {
    if (!onGenerateAI) {
      alert('AI generation is not available');
      return;
    }

    setGenerating(true);
    try {
      const generated = await onGenerateAI(block.blockType, block.data);
      if (generated) {
        onChange({ ...block.data, ...generated });
        setShowAIModal(false);
        setCustomPrompt('');
        alert('Content generated successfully!');
      }
    } catch (error: any) {
      console.error('Error generating content:', error);
      alert(error.response?.data?.message || error.message || 'Failed to generate content');
    } finally {
      setGenerating(false);
    }
  };

  const renderEditor = () => {
    const editorProps = {
      data: block.data || {},
      onChange: (newData: any) => onChange(newData),
      pageId: block.blockId,
    };

    switch (block.blockType) {
      case 'hero':
        return <HeroBlockEditor {...editorProps} />;
      case 'text':
        return <TextBlockEditor {...editorProps} />;
      case 'image':
        return <ImageBlockEditor {...editorProps} />;
      case 'text-image':
        return <TextImageBlockEditor {...editorProps} />;
      case 'features':
        return <FeaturesBlockEditor {...editorProps} />;
      case 'cta':
        return <CTABlockEditor {...editorProps} />;
      case 'faq-accordion':
        return <FAQAccordionBlockEditor {...editorProps} />;
      default:
        return (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Block Data (JSON)</label>
            <textarea
              value={JSON.stringify(block.data || {}, null, 2)}
              onChange={(e) => {
                try {
                  const data = JSON.parse(e.target.value);
                  onChange(data);
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-md font-semibold text-gray-800 capitalize">{block.blockType} Block Editor</h4>
        {onGenerateAI && (
          <button
            type="button"
            onClick={() => setShowAIModal(true)}
            className="flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
          >
            <FaMagic /> Generate with AI
          </button>
        )}
      </div>
      {renderEditor()}

      {/* AI Generation Modal */}
      {showAIModal && onGenerateAI && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Generate Content with AI</h3>
              <button
                onClick={() => {
                  setShowAIModal(false);
                  setCustomPrompt('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
                disabled={generating}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Prompt (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={4}
                  placeholder="Enter a custom prompt for content generation. Leave empty to use default context-based prompt."
                  disabled={generating}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAIModal(false);
                  setCustomPrompt('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={generating}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateAI}
                disabled={generating}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <FaMagic /> Generate Content
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockEditor;

