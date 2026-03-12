import { useState, useEffect } from 'react';
import { Search, Image as ImageIcon, X, Loader, Check, Trash2, Wand2 } from 'lucide-react';
import { uploadAPI } from '../../services/api';

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

interface MediaFile {
  key: string;
  url: string;
  size?: number;
  lastModified?: Date;
}

interface MediaGalleryProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

const MediaGallery = ({ onSelect, onClose }: MediaGalleryProps) => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [optimizing, setOptimizing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const itemsPerPage = 12;

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const data = await uploadAPI.listFiles();
      setFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load media:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${key.split('/').pop()}"? This cannot be undone.`)) return;

    setDeleting(key);
    try {
      await uploadAPI.deleteFile(key);
      setFiles((prev) => prev.filter((f) => f.key !== key));
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete file.');
    } finally {
      setDeleting(null);
    }
  };

  const handleOptimizeAll = async () => {
    if (!window.confirm('Optimize all large images? This may take a few minutes.')) return;

    setOptimizing(true);
    try {
      const data = await uploadAPI.optimizeAll();
      alert(data?.message || 'Optimization complete');
      fetchFiles();
    } catch (error) {
      console.error('Optimize failed:', error);
      alert('Optimization failed.');
    } finally {
      setOptimizing(false);
    }
  };

  const filteredFiles = files.filter((f) =>
    f.key.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / itemsPerPage));
  const currentFiles = filteredFiles.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const largeFiles = files.filter(
    (f) =>
      (f.size || 0) > 500 * 1024 &&
      /\.(jpg|jpeg|png|gif|tiff|bmp)$/i.test(f.key)
  ).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <ImageIcon className="text-blue-600" />
            <h3 className="font-bold text-lg text-gray-800">Media Library</h3>
            <span className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-600">
              {files.length} items
            </span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              {formatFileSize(totalSize)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b bg-white flex justify-between items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search filenames..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleOptimizeAll}
            disabled={optimizing || largeFiles === 0}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
          >
            {optimizing ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {optimizing ? 'Optimizing...' : `Optimize (${largeFiles})`}
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-100/50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Loader className="w-8 h-8 animate-spin mb-2" />
              <p>Loading media...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
              <ImageIcon className="w-16 h-16 mb-4" />
              <p>No media found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {currentFiles.map((file) => (
                <div
                  key={file.key}
                  onClick={() => onSelect(file.url)}
                  className="group relative aspect-square bg-gray-100 rounded-lg overflow-hidden border hover:border-blue-500 cursor-pointer transition-all hover:shadow-md"
                >
                  {file.url.match(/\.(mp4|webm)$/i) ? (
                    <video
                      src={file.url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={file.url}
                      alt={file.key}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}

                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-end">
                    <div className="p-2 w-full bg-gradient-to-t from-black/80 to-transparent text-white opacity-0 group-hover:opacity-100 transition-all">
                      <p className="text-[10px] truncate">{file.key.split('/').pop()}</p>
                      <p className="text-[9px] text-gray-300">
                        {formatFileSize(file.size || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="absolute top-2 right-2 bg-blue-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all transform scale-0 group-hover:scale-100 shadow-sm">
                    <Check size={12} />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDelete(file.key, e)}
                    disabled={deleting === file.key}
                    className="absolute top-2 left-2 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all transform scale-0 group-hover:scale-100 shadow-sm hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting === file.key ? (
                      <Loader size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer / Pagination */}
        <div className="p-4 border-t bg-white flex justify-between items-center">
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaGallery;
