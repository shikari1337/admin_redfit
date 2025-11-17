import React from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';
import IconPicker from '../IconPicker';
import ImageInputWithActions from '../common/ImageInputWithActions';

interface WashCareInstruction {
  text: string;
  iconUrl?: string;
  iconName?: string;
}

interface ProductWashCareProps {
  instructions: WashCareInstruction[];
  onInstructionsChange: (instructions: WashCareInstruction[]) => void;
  productId?: string;
  productName?: string;
}

const ProductWashCare: React.FC<ProductWashCareProps> = ({
  instructions,
  onInstructionsChange,
  productId,
  productName,
}) => {
  const addInstruction = () => {
    onInstructionsChange([...instructions, { text: '', iconUrl: '', iconName: '' }]);
  };

  const removeInstruction = (index: number) => {
    onInstructionsChange(instructions.filter((_, i) => i !== index));
  };

  const updateInstruction = (index: number, field: keyof WashCareInstruction, value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = { ...newInstructions[index], [field]: value };
    
    // Clear iconUrl if iconName is set, and vice versa
    if (field === 'iconName' && value) {
      newInstructions[index].iconUrl = undefined;
    } else if (field === 'iconUrl' && value) {
      newInstructions[index].iconName = undefined;
    }
    
    onInstructionsChange(newInstructions);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Wash Care Instructions</h2>
        <button
          type="button"
          onClick={addInstruction}
          className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <FaPlus className="mr-1" size={12} />
          Add Instruction
        </button>
      </div>
      <div className="space-y-3">
        {instructions.map((instruction, index) => (
          <div key={index} className="flex gap-3 p-3 border border-gray-200 rounded-md">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Text</label>
              <input
                type="text"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                value={instruction.text}
                onChange={(e) => updateInstruction(index, 'text', e.target.value)}
                placeholder="Machine wash cold (30°C)"
              />
            </div>
            <div className="flex-1">
              <IconPicker
                label="Icon (React Icon)"
                value={instruction.iconName || ''}
                onChange={(iconName) => updateInstruction(index, 'iconName', iconName)}
              />
            </div>
            <div className="flex-1">
              <ImageInputWithActions
                value={instruction.iconUrl || ''}
                onChange={(url) => updateInstruction(index, 'iconUrl', url)}
                label="Icon URL (Alternative)"
                placeholder="Or use custom icon image URL"
                productId={productId}
                sectionId="washCare"
                fieldPath={`instructions.${index}.iconUrl`}
                contextData={productName ? { productName, itemTitle: instruction.text } : undefined}
                className="text-xs"
              />
              <p className="text-xs text-gray-500 mt-1">Use either React Icon or custom image URL</p>
            </div>
            <button
              type="button"
              onClick={() => removeInstruction(index)}
              className="text-red-600 hover:text-red-800 mt-6"
            >
              <FaTrash size={14} />
            </button>
          </div>
        ))}
        {instructions.length === 0 && (
          <p className="text-sm text-gray-500">No wash care instructions added</p>
        )}
      </div>
    </div>
  );
};

export default ProductWashCare;

