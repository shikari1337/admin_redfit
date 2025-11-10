import React from 'react';
import { FaUpload, FaTimes, FaPlus } from 'react-icons/fa';

interface ProductVideosProps {
  videos: string[];
  newVideos: File[];
  uploading: boolean;
  onVideosChange: (videos: string[]) => void;
  onNewVideosChange: (files: File[]) => void;
  onVideoUpload: () => Promise<void>;
  onAddVideoUrl: () => void;
  onRemoveVideo: (index: number) => void;
  error?: string;
}

const ProductVideos: React.FC<ProductVideosProps> = ({
  videos,
  newVideos,
  uploading,
  onVideosChange,
  onNewVideosChange,
  onVideoUpload,
  onAddVideoUrl,
  onRemoveVideo,
  error,
}) => {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const videoFiles: File[] = [];
      const invalidFiles: string[] = [];
      const oversizedFiles: string[] = [];

      Array.from(files).forEach((file) => {
        if (!file.type.startsWith('video/')) {
          invalidFiles.push(file.name);
          return;
        }
        if (file.size > 100 * 1024 * 1024) {
          oversizedFiles.push(file.name);
          return;
        }
        videoFiles.push(file);
      });

      if (invalidFiles.length > 0) {
        alert(`Invalid files (not video): ${invalidFiles.join(', ')}`);
      }
      if (oversizedFiles.length > 0) {
        alert(`Files too large (max 100MB): ${oversizedFiles.join(', ')}`);
      }

      if (videoFiles.length > 0) {
        onNewVideosChange([...newVideos, ...videoFiles]);
      }
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Videos</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Upload Video Files</label>
          <input
            type="file"
            accept="video/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id="video-upload"
            disabled={uploading}
          />
          <label
            htmlFor="video-upload"
            className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer ${
              uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <FaUpload className="mr-2" size={14} />
            Select Videos
          </label>
          <p className="mt-1 text-xs text-gray-500">Supports MP4, MOV, AVI up to 100MB each</p>
        </div>

        {newVideos.length > 0 && (
          <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
            <p className="text-sm font-medium text-gray-700 mb-2">
              {newVideos.length} video{newVideos.length > 1 ? 's' : ''} ready to upload
            </p>
            <ul className="text-xs text-gray-600 mb-3 space-y-1">
              {newVideos.map((file, index) => (
                <li key={index} className="flex items-center justify-between">
                  <span>{file.name}</span>
                  <span className="text-gray-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={onVideoUpload}
                disabled={uploading}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? `Uploading ${newVideos.length} videos...` : `Upload ${newVideos.length} Video${newVideos.length > 1 ? 's' : ''}`}
              </button>
              <button
                type="button"
                onClick={() => onNewVideosChange([])}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Video URLs</label>
            <button
              type="button"
              onClick={onAddVideoUrl}
              className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              <FaPlus className="mr-1" size={12} />
              Add URL
            </button>
          </div>
          {videos.length > 0 && (
            <div className="space-y-2">
              {videos.map((video, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                  <input
                    type="text"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md"
                    value={video}
                    onChange={(e) => {
                      const newVideos = [...videos];
                      newVideos[index] = e.target.value;
                      onVideosChange(newVideos);
                    }}
                    placeholder="Video URL"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveVideo(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <FaTimes size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {videos.length === 0 && (
            <p className="text-sm text-gray-500">No videos added. Upload files or add URLs above.</p>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
};

export default ProductVideos;

