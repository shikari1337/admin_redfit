import React from 'react';
import Modal from './Modal';

interface UpdateEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
  subject: string;
  content: string;
  onSubjectChange: (value: string) => void;
  onContentChange: (value: string) => void;
}

const UpdateEmailModal: React.FC<UpdateEmailModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  subject,
  content,
  onSubjectChange,
  onContentChange,
}) => {
  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending...' : 'Send Email'}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send Order Update Email" footer={footer} maxWidth="2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Subject *
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Order Update - #ORDER_ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Content (HTML) *
          </label>
            <textarea
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              placeholder="Enter HTML email content. Leave blank to use default template."
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              You can use HTML tags for formatting. Leave blank to use default template.
            </p>
        </div>
      </div>
    </Modal>
  );
};

export default UpdateEmailModal;

