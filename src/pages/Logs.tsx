import React, { useState, useEffect } from 'react';
import { logsAPI } from '../services/api';
import { FaFileAlt, FaFilter, FaSync, FaExclamationTriangle, FaInfoCircle, FaBug } from 'react-icons/fa';

interface LogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  stack?: string;
  [key: string]: any;
}

interface LogFile {
  files: string[];
  filesByType: {
    error: string[];
    combined: string[];
    exceptions: string[];
    rejections: string[];
  };
  total: number;
}

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFiles, setLogFiles] = useState<LogFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [logType, setLogType] = useState<'error' | 'combined' | 'exceptions' | 'rejections'>('combined');
  const [logLevel, setLogLevel] = useState<string>('all');
  const [date, setDate] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);
  const [selectedFile, setSelectedFile] = useState<string>('');

  useEffect(() => {
    fetchLogFiles();
  }, []);

  useEffect(() => {
    if (selectedFile || logType) {
      fetchLogs();
    }
  }, [logType, logLevel, date, limit, selectedFile]);

  const fetchLogFiles = async () => {
    try {
      const response = await logsAPI.getLogFiles();
      if (response.success && response.data) {
        setLogFiles(response.data);
        // Auto-select today's file for the selected type
        const today = new Date().toISOString().split('T')[0];
        const todayFile = `${logType}-${today}.log`;
        if (response.data.files.includes(todayFile)) {
          setSelectedFile(todayFile);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch log files');
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        type: logType,
        limit,
      };
      
      if (date) {
        params.date = date;
      }
      
      if (logLevel !== 'all') {
        params.level = logLevel;
      }

      const response = await logsAPI.getLogs(params);
      if (response.success && response.data) {
        setLogs(response.data.logs || []);
      } else {
        setError('Failed to fetch logs');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const getLevelColor = (level?: string) => {
    switch (level?.toLowerCase()) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warn':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'http':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'debug':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getLevelIcon = (level?: string) => {
    switch (level?.toLowerCase()) {
      case 'error':
        return <FaExclamationTriangle className="text-red-500" />;
      case 'warn':
        return <FaExclamationTriangle className="text-yellow-500" />;
      case 'info':
        return <FaInfoCircle className="text-blue-500" />;
      case 'debug':
        return <FaBug className="text-gray-500" />;
      default:
        return <FaInfoCircle className="text-gray-500" />;
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'N/A';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">System Logs</h1>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FaSync className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <FaFilter className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Log Type
            </label>
            <select
              value={logType}
              onChange={(e) => setLogType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="combined">Combined</option>
              <option value="error">Error</option>
              <option value="exceptions">Exceptions</option>
              <option value="rejections">Rejections</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Log Level
            </label>
            <select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Levels</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="http">HTTP</option>
              <option value="debug">Debug</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date (YYYY-MM-DD)
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {date && (
              <button
                onClick={() => setDate('')}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Clear date filter
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Limit
            </label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
              min={1}
              max={1000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Log Files Info */}
      {logFiles && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <FaFileAlt className="text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Available Log Files</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Total Files</p>
              <p className="text-2xl font-bold text-gray-900">{logFiles.total}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Error Logs</p>
              <p className="text-2xl font-bold text-red-600">{logFiles.filesByType.error.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Combined Logs</p>
              <p className="text-2xl font-bold text-blue-600">{logFiles.filesByType.combined.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Exceptions</p>
              <p className="text-2xl font-bold text-orange-600">{logFiles.filesByType.exceptions.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Logs List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Logs ({logs.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-600">No logs found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`p-4 hover:bg-gray-50 transition-colors ${getLevelColor(log.level)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getLevelIcon(log.level)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase px-2 py-1 rounded bg-white/50">
                        {log.level || 'INFO'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 break-words">
                      {log.message || JSON.stringify(log)}
                    </p>
                    {log.stack && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                          Stack Trace
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto">
                          {log.stack}
                        </pre>
                      </details>
                    )}
                    {Object.keys(log).filter(key => !['timestamp', 'level', 'message', 'stack'].includes(key)).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                          Additional Data
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-x-auto">
                          {JSON.stringify(
                            Object.fromEntries(
                              Object.entries(log).filter(([key]) => !['timestamp', 'level', 'message', 'stack'].includes(key))
                            ),
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Logs;

