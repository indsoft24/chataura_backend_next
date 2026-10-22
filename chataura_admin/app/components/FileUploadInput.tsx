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

  const kind = isVideo ? 'Looping video' : isAnimation ? 'Lottie / SVGA animation' : value ? 'Current asset' : '';

  return (
    <div className="ad-upload">
      <span className="ad-upload-label">
        {label} {required && <span className="tone-red">*</span>}
      </span>
      <div className={`ad-upload-box ${error ? 'has-error' : ''}`}>
        <div className="ad-upload-thumb" aria-hidden>
          {isVideo ? (
            <video src={value} muted loop autoPlay playsInline />
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ) : isAnimation ? (
            <span>✨</span>
          ) : value ? (
            <span>📎</span>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
          )}
        </div>
        <div className="ad-upload-main">
          <div className="ad-upload-row">
            <input ref={fileInputRef} type="file" accept={accept} onChange={handleFileChange} style={{ display: 'none' }} disabled={uploading} />
            <button type="button" className="ad-btn ad-btn-accent" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : value ? 'Replace' : 'Upload file'}
            </button>
            <span className="ad-upload-status">
              {uploading ? `Uploading ${fileName}…` : fileName ? fileName : kind || 'or paste a URL below'}
            </span>
            {value && (
              <button type="button" className="ad-btn ad-btn-danger-soft ad-icon-btn" onClick={handleClear} aria-label="Clear file" title="Clear">
                ✕
              </button>
            )}
          </div>
          <input type="text" className="ad-upload-url" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        </div>
      </div>
      {error ? <div className="ad-upload-error">{error}</div> : helpText ? <div className="ad-field-hint">{helpText}</div> : null}
    </div>
  );
}
