import React, { useState, useRef, useEffect } from 'react';
import {
  FaUpload,
  FaFolder,
  FaFolderPlus,
  FaImage,
  FaTrash,
  FaCopy,
  FaFileCsv,
  FaTimes,
  FaCheck,
} from 'react-icons/fa';
import { uploadAPI } from '../services/api';

interface GalleryItem {
  id: string;
  url: string;
  name: string;
  type: 'image' | 'video';
  folder: string;
  uploadedAt: Date;
  size?: number;
}

const Gallery: React.FC = () => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [folders, setFolders] = useState<string[]>(['']);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [urlsText, setUrlsText] = useState('');
  const [showUrlBox, setShowUrlBox] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load items from localStorage on mount
  useEffect(() => {
    const savedItems = localStorage.getItem('gallery_items');
    const savedFolders = localStorage.getItem('gallery_folders');
    if (savedItems) {
      try {
        const parsed = JSON.parse(savedItems);
        setItems(parsed.map((item: any) => ({
          ...item,
          uploadedAt: new Date(item.uploadedAt),
        })));
      } catch (e) {
        console.error('Failed to load gallery items:', e);
      }
    }
    if (savedFolders) {
      try {
        const parsed = JSON.parse(savedFolders);
        setFolders(parsed);
      } catch (e) {
        console.error('Failed to load folders:', e);
      }
    }
  }, []);

  // Save items to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem('gallery_items', JSON.stringify(items));
  }, [items]);

  // Save folders to localStorage whenever folders change
  useEffect(() => {
    localStorage.setItem('gallery_folders', JSON.stringify(folders));
  }, [folders]);

  // Update URLs text when items change
  useEffect(() => {
    const filteredItems = selectedFolder
      ? items.filter((item) => item.folder === selectedFolder)
      : items;
    setUrlsText(filteredItems.map((item) => item.url).join('\n'));
  }, [items, selectedFolder]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    const uploadPromises: Promise<void>[] = [];

    files.forEach((file) => {
      const fileId = `${Date.now()}-${Math.random()}`;
      setUploadProgress((prev) => ({ ...prev, [fileId]: 0 }));

      const uploadPromise = (async () => {
        try {
          const isVideo = file.type.startsWith('video/');
          const isImage = file.type.startsWith('image/');

          if (!isImage && !isVideo) {
            throw new Error(`Unsupported file type: ${file.type}`);
          }

          // Upload file
          const response = isImage
            ? await uploadAPI.uploadSingle(file, selectedFolder || undefined)
            : await uploadAPI.uploadMultiple([file], selectedFolder || undefined);

          const url =
            response?.data?.url ||
            response?.data?.data?.url ||
            response?.url ||
            response?.data?.files?.[0]?.url ||
            (Array.isArray(response?.data?.files) && response?.data?.files[0]?.url);

          if (!url) {
            throw new Error('Upload succeeded but no URL was returned.');
          }

          const newItem: GalleryItem = {
            id: fileId,
            url,
            name: file.name,
            type: isVideo ? 'video' : 'image',
            folder: selectedFolder,
            uploadedAt: new Date(),
            size: file.size,
          };

          setItems((prev) => [...prev, newItem]);
        } catch (error: any) {
          console.error(`Failed to upload ${file.name}:`, error);
          alert(`Failed to upload ${file.name}: ${error?.message || 'Unknown error'}`);
        } finally {
          setUploadProgress((prev) => {
            const updated = { ...prev };
            delete updated[fileId];
            return updated;
          });
        }
      })();

      uploadPromises.push(uploadPromise);
    });

    await Promise.all(uploadPromises);
    setUploading(false);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (confirm(`Delete ${item.name}?`)) {
      // Optionally delete from server
      if (item.url) {
        const key = item.url.split('/').pop() || '';
        uploadAPI.delete(key).catch((err) => {
          console.error('Failed to delete from server:', err);
        });
      }

      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAllUrls = () => {
    const filteredItems = selectedFolder
      ? items.filter((item) => item.folder === selectedFolder)
      : items;
    const allUrls = filteredItems.map((item) => item.url).join('\n');
    navigator.clipboard.writeText(allUrls);
    alert('All URLs copied to clipboard!');
  };

  const handleExportCSV = () => {
    const filteredItems = selectedFolder
      ? items.filter((item) => item.folder === selectedFolder)
      : items;

    const csvHeaders = ['Name', 'URL', 'Type', 'Folder', 'Uploaded At', 'Size (bytes)'];
    const csvRows = filteredItems.map((item) => [
      item.name,
      item.url,
      item.type,
      item.folder || '(root)',
      item.uploadedAt.toISOString(),
      item.size?.toString() || '',
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `gallery-${selectedFolder || 'all'}-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      alert('Please enter a folder name');
      return;
    }

    if (folders.includes(newFolderName.trim())) {
      alert('Folder already exists');
      return;
    }

    setFolders((prev) => [...prev, newFolderName.trim()]);
    setNewFolderName('');
    setShowNewFolderInput(false);
  };

  const handleDeleteFolder = (folderName: string) => {
    if (folderName === '') {
      alert('Cannot delete root folder');
      return;
    }

    const itemsInFolder = items.filter((item) => item.folder === folderName);
    if (itemsInFolder.length > 0) {
      if (
        !confirm(
          `Folder "${folderName}" contains ${itemsInFolder.length} item(s). Delete folder and all its contents?`
        )
      ) {
        return;
      }
      // Move items to root or delete them
      setItems((prev) => prev.filter((item) => item.folder !== folderName));
    }

    setFolders((prev) => prev.filter((f) => f !== folderName));
    if (selectedFolder === folderName) {
      setSelectedFolder('');
    }
  };

  const filteredItems = selectedFolder
    ? items.filter((item) => item.folder === selectedFolder)
    : items;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gallery</h1>
          <p className="text-sm text-gray-500">Manage your images and videos</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUrlBox(!showUrlBox)}
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <FaCopy className="mr-2" />
            {showUrlBox ? 'Hide URLs' : 'Show URLs'}
          </button>
          <button
            onClick={handleCopyAllUrls}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FaCopy className="mr-2" />
            Copy All URLs
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filteredItems.length === 0}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaFileCsv className="mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Folder Management */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Folders</h2>
          <button
            onClick={() => setShowNewFolderInput(true)}
            className="flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
          >
            <FaFolderPlus className="mr-2" />
            New Folder
          </button>
        </div>

        {showNewFolderInput && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Folder name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewFolderInput(false);
                setNewFolderName('');
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedFolder('')}
            className={`flex items-center px-3 py-1.5 rounded-md text-sm transition-colors ${
              selectedFolder === ''
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FaFolder className="mr-2" />
            All ({items.length})
          </button>
          {folders
            .filter((f) => f !== '')
            .map((folder) => {
              const count = items.filter((item) => item.folder === folder).length;
              return (
                <div key={folder} className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedFolder(folder)}
                    className={`flex items-center px-3 py-1.5 rounded-md text-sm transition-colors ${
                      selectedFolder === folder
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <FaFolder className="mr-2" />
                    {folder} ({count})
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(folder)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete folder"
                  >
                    <FaTimes size={12} />
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {/* URL Text Box */}
      {showUrlBox && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold text-gray-900">URLs</h2>
            <button
              onClick={handleCopyAllUrls}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Copy All
            </button>
          </div>
          <textarea
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 font-mono text-sm"
            placeholder="URLs will appear here..."
          />
        </div>
      )}

      {/* Upload Area */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Upload Files</h2>
          <span className="text-sm text-gray-500">
            Selected folder: <strong>{selectedFolder || '(root)'}</strong>
          </span>
        </div>
        <label
          htmlFor="gallery-upload"
          className={`flex flex-col items-center justify-center px-6 py-12 border-2 border-dashed rounded-lg cursor-pointer transition ${
            uploading
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'border-gray-300 hover:border-red-400 hover:bg-red-50'
          }`}
        >
          <FaUpload className="text-4xl text-gray-400 mb-3" />
          <span className="text-lg font-medium text-gray-700 mb-1">
            {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
          </span>
          <span className="text-sm text-gray-500">
            Supports images and videos (multiple files allowed)
          </span>
          <input
            id="gallery-upload"
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {Object.keys(uploadProgress).length > 0 && (
          <div className="mt-4 space-y-2">
            {Object.entries(uploadProgress).map(([id, progress]) => (
              <div key={id} className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gallery Grid */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedFolder ? `Folder: ${selectedFolder}` : 'All Items'} ({filteredItems.length})
          </h2>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FaImage className="text-5xl text-gray-300 mx-auto mb-3" />
            <p>No items in this folder. Upload some files to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="group relative bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
              >
                <div className="aspect-square relative">
                  {item.type === 'image' ? (
                    <img
                      src={item.url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  ) : (
                    <video
                      src={item.url}
                      className="w-full h-full object-cover"
                      controls={false}
                      muted
                    />
                  )}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleCopyUrl(item.url, item.id)}
                      className="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-white text-gray-700 rounded hover:bg-gray-100 transition-all text-sm flex items-center"
                      title="Copy URL"
                    >
                      {copiedId === item.id ? (
                        <>
                          <FaCheck className="mr-1" /> Copied!
                        </>
                      ) : (
                        <>
                          <FaCopy className="mr-1" /> Copy
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-all text-sm"
                      title="Delete"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-xs text-gray-700 truncate" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500">{formatFileSize(item.size)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {item.uploadedAt.toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Gallery;

