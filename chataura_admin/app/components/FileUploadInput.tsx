'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { uploadAdminFile } from '@/lib/api';

interface FileUploadInputProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  helpText?: string;
  placeholder?: string;
  required?: boolean;
}

export default function FileUploadInput({
  label,
  value,
  onChange,
  accept = 'image/*,video/mp4,video/webm,.json,.svga,.svg,.webp,.gif,.png,.jpg,.jpeg,.mp4,.webm',
  helpText = 'Max 50MB. You can upload a local file or paste a direct/CDN URL below.',
  placeholder = 'https://... or uploaded path',
  required = false,
}: FileUploadInputProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setError('File is larger than 50MB. Please choose a smaller file.');
      return;
    }

    setFileName(file.name);
    setError(null);
    setUploading(true);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('ca_admin_token') : null;
      const uploadedUrl = await uploadAdminFile(file, token);
      onChange(uploadedUrl);
    } catch (err: any) {
      setError(err?.message || 'File upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    onChange('');
    setFileName(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const path = value ? value.split(/[?#]/)[0].toLowerCase() : '';
  const isVideo = path.endsWith('.mp4') || path.endsWith('.webm');
  const isAnimation = path.endsWith('.json') || path.endsWith('.svga');

  const isImage =
    value &&
    !isAnimation &&
    !isVideo &&
    (value.startsWith('http') || value.startsWith('/uploads') || value.startsWith('data:image'));

  return (
    <div style={{ marginBottom: '16px', width: '100%' }}>
      <label
        style={{
          display: 'block',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#374151',
          marginBottom: '6px',
          textTransform: 'uppercase',
          letterSpacing: '0.025em',
        }}
      >
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>

      {/* Upload button & File trigger row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: '#f9fafb',
          border: '1px dashed #cbd5e1',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '8px',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={uploading}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: uploading ? '#9ca3af' : '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '7px 14px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: uploading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s',
            flexShrink: 0,
          }}
        >
          {uploading ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  border: '2px solid #fff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              Uploading...
            </>
          ) : (
            <>📁 Choose File</>
          )}
        </button>

        <span
          style={{
            fontSize: '0.82rem',
            color: fileName ? '#1f2937' : '#6b7280',
            fontWeight: fileName ? 500 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {uploading
            ? `Uploading ${fileName}...`
            : fileName
              ? `Selected: ${fileName}`
              : 'No file selected yet'}
        </span>

        {value && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              color: '#b91c1c',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Direct / Fallback URL Input */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '0.85rem',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#ffffff',
            margin: 0,
          }}
        />
      </div>

      {/* Help text */}
      {helpText && (
        <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
          {helpText}
        </p>
      )}

      {/* Error alert */}
      {error && (
        <p
          style={{
            margin: '6px 0 0 0',
            fontSize: '0.78rem',
            color: '#b91c1c',
            backgroundColor: '#fef2f2',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #fca5a5',
          }}
        >
          ⚠️ {error}
        </p>
      )}

      {/* Live Preview */}
      {value && (
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#f8fafc',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
          }}
        >
          {isVideo ? (
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '6px',
                backgroundColor: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <video
                src={value}
                muted
                loop
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : isImage ? (
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                backgroundColor: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src={value}
                alt="Preview"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          ) : isAnimation ? (
            <div
              style={{
                fontSize: '1.5rem',
                backgroundColor: '#e0e7ff',
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ✨
            </div>
          ) : (
            <div
              style={{
                fontSize: '1.5rem',
                backgroundColor: '#f1f5f9',
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              📎
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>
              {isVideo
                ? 'Looping video'
                : isAnimation
                  ? 'Lottie / SVGA Animation Asset'
                  : 'Current Active Asset'}
            </div>
            <div
              style={{
                fontSize: '0.72rem',
                color: '#64748b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {value}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
