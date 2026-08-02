import React, { useState } from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';
import IconPicker from '../IconPicker';
import ImageInputWithActions from '../common/ImageInputWithActions';
import { FieldGroup, Field, Segmented, fieldInputCls } from './FormField';

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
  // Presentation-only: which icon input each row shows (library icon vs custom
  // image URL). Defaults from the data — a row with an iconUrl shows the image
  // input. Values are still written through the SAME updateInstruction handler.
  const [iconSourceOverride, setIconSourceOverride] = useState<Record<number, 'library' | 'image'>>({});
  const iconSourceFor = (index: number, instruction: WashCareInstruction): 'library' | 'image' =>
    iconSourceOverride[index] ?? (instruction.iconUrl ? 'image' : 'library');

  const addInstruction = () => {
    onInstructionsChange([...instructions, { text: '', iconUrl: '', iconName: '' }]);
  };

  const removeInstruction = (index: number) => {
    onInstructionsChange(instructions.filter((_, i) => i !== index));
    // Indices shift after a removal — drop the display overrides and re-derive.
    setIconSourceOverride({});
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
    <FieldGroup title="Wash care instructions"
      description="Care steps shown on the product page — each one gets a small icon."
      actions={
        <button
          type="button"
          onClick={addInstruction}
          className="flex items-center px-3 h-8 text-[13px] bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <FaPlus className="mr-1.5" size={11} />
          Add instruction
        </button>
      }>
      <div className="space-y-3">
        {instructions.map((instruction, index) => {
          const iconSource = iconSourceFor(index, instruction);
          return (
            <div key={index} className="relative p-4 border border-gray-200 rounded-lg bg-gray-50/50 space-y-3">
              <button
                type="button"
                onClick={() => removeInstruction(index)}
                aria-label={`Remove instruction ${index + 1}`}
                className="absolute top-3 right-3 text-gray-300 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded p-1"
              >
                <FaTrash size={13} />
              </button>

              <Field label="Instruction" htmlFor={`washCareText${index}`}
                help="One short care step, e.g. “Machine wash cold”.">
                <input
                  id={`washCareText${index}`}
                  type="text"
                  className={`${fieldInputCls} pr-10`}
                  value={instruction.text}
                  onChange={(e) => updateInstruction(index, 'text', e.target.value)}
                  placeholder="Machine wash cold (30°C)"
                />
              </Field>

              <div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[13px] font-medium text-gray-700">Icon</span>
                  <Segmented
                    value={iconSource}
                    onChange={v => setIconSourceOverride(prev => ({ ...prev, [index]: v as 'library' | 'image' }))}
                    options={[
                      { value: 'library', label: 'Pick an icon' },
                      { value: 'image', label: 'Own image' },
                    ]}
                    ariaLabel={`Icon source for instruction ${index + 1}`}
                  />
                </div>
                {iconSource === 'library' ? (
                  <IconPicker
                    label=""
                    value={instruction.iconName || ''}
                    onChange={(iconName) => updateInstruction(index, 'iconName', iconName)}
                  />
                ) : (
                  <ImageInputWithActions
                    value={instruction.iconUrl || ''}
                    onChange={(url) => updateInstruction(index, 'iconUrl', url)}
                    label=""
                    placeholder="Paste or upload a custom icon image URL"
                    productId={productId}
                    sectionId="washCare"
                    fieldPath={`instructions.${index}.iconUrl`}
                    contextData={productName ? { productName, itemTitle: instruction.text } : undefined}
                    className="text-xs"
                  />
                )}
                <p className="text-xs text-gray-400 mt-1">Choosing one clears the other — an instruction shows a single icon.</p>
              </div>
            </div>
          );
        })}
        {instructions.length === 0 && (
          <button type="button" onClick={addInstruction}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-red-300 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
            + Add your first care instruction
          </button>
        )}
      </div>
    </FieldGroup>
  );
};

export default ProductWashCare;
