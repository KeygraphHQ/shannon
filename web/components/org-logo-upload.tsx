"use client";

import { useState, useRef } from "react";
import { Building2, Upload, X, Loader2 } from "lucide-react";

interface OrgLogoUploadProps {
  currentLogoUrl: string | null;
  orgName: string;
  onLogoChange: (logoUrl: string | null) => Promise<void>;
  disabled?: boolean;
}

export function OrgLogoUpload({
  currentLogoUrl,
  orgName,
  onLogoChange,
  disabled = false,
}: OrgLogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be less than 2MB");
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      // Create a preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // In a real app, you would upload to a storage service here (S3, Cloudinary, etc.)
      // For now, we'll simulate an upload and use a data URL
      // Note: In production, you should use a proper file upload service

      const formData = new FormData();
      formData.append("file", file);

      // Simulate upload delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // For demo purposes, we'll use a data URL
      // In production, replace with actual upload logic
      const dataUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(file);
      });

      await onLogoChange(dataUrl);
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload logo");
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveLogo = async () => {
    setIsUploading(true);
    setError(null);
    try {
      await onLogoChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setIsUploading(false);
    }
  };

  const displayUrl = previewUrl || currentLogoUrl;

  return (
    <div className="flex items-start gap-4">
      {/* Logo Preview */}
      <div className="relative">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={orgName}
            className="h-20 w-20 rounded-lg object-cover border border-gray-200"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
            <Building2 className="h-8 w-8 text-gray-400" />
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        )}
      </div>

      {/* Upload Controls */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={disabled || isUploading}
            className="hidden"
            id="logo-upload"
          />
          <label
            htmlFor="logo-upload"
            className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors ${
              disabled || isUploading
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-gray-50"
            }`}
          >
            <Upload className="h-4 w-4" />
            Upload Logo
          </label>
          {currentLogoUrl && !disabled && (
            <button
              onClick={handleRemoveLogo}
              disabled={isUploading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="h-4 w-4" />
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">
          PNG, JPG or GIF. Max 2MB. Recommended size: 200x200px
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
