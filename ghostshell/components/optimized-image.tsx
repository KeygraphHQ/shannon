"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

interface OptimizedImageProps extends Omit<ImageProps, "onLoad" | "onError"> {
  /** Fallback image URL when loading fails */
  fallbackSrc?: string;
  /** Show a placeholder while loading */
  showPlaceholder?: boolean;
  /** Aspect ratio for the container (e.g., "16/9", "1/1", "4/3") */
  aspectRatio?: string;
  /** Enable blur placeholder (requires blurDataURL or a static import) */
  enableBlur?: boolean;
}

// Default placeholder SVG (blurred gray)
const DEFAULT_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2UyZThlYyIvPjwvc3ZnPg==";

// Default fallback image (gray placeholder)
const DEFAULT_FALLBACK =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2UyZThlYyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyMCIgZmlsbD0iIzk0YTNiOCI+SW1hZ2U8L3RleHQ+PC9zdmc+";

/**
 * OptimizedImage - Next.js Image component with additional features
 *
 * Features:
 * - Automatic lazy loading (native behavior from Next.js Image)
 * - Error handling with fallback image
 * - Loading state with placeholder
 * - Aspect ratio container
 * - Blur-up placeholder support
 *
 * Usage:
 *   <OptimizedImage
 *     src="/image.jpg"
 *     alt="Description"
 *     width={400}
 *     height={300}
 *     aspectRatio="4/3"
 *   />
 */
export function OptimizedImage({
  src,
  alt,
  fallbackSrc = DEFAULT_FALLBACK,
  showPlaceholder = true,
  aspectRatio,
  enableBlur = true,
  className = "",
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setError(true);
    setIsLoading(false);
  };

  const imageSrc = error ? fallbackSrc : src;

  // Determine placeholder type
  const placeholderProps =
    enableBlur && !error
      ? {
          placeholder: "blur" as const,
          blurDataURL:
            typeof src === "string" ? DEFAULT_BLUR_DATA_URL : undefined,
        }
      : {};

  const imageElement = (
    <Image
      src={imageSrc}
      alt={alt}
      className={`transition-opacity duration-300 ${
        isLoading && showPlaceholder ? "opacity-0" : "opacity-100"
      } ${className}`}
      onLoad={handleLoad}
      onError={handleError}
      {...placeholderProps}
      {...props}
    />
  );

  // If aspect ratio is specified, wrap in a container
  if (aspectRatio) {
    return (
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio }}
      >
        {imageElement}
      </div>
    );
  }

  return imageElement;
}

/**
 * Avatar - Optimized circular image for user avatars
 */
export function Avatar({
  src,
  alt,
  size = 40,
  fallbackInitial,
  className = "",
}: {
  src?: string | null;
  alt: string;
  size?: number;
  fallbackInitial?: string;
  className?: string;
}) {
  const [error, setError] = useState(false);

  // Show initials if no src or error
  if (!src || error) {
    const initial =
      fallbackInitial ||
      alt
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

    return (
      <div
        className={`flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-medium ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-label={alt}
      >
        {initial}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      onError={() => setError(true)}
    />
  );
}

/**
 * Logo - Optimized logo image with fallback
 */
export function Logo({
  src,
  alt,
  width = 120,
  height = 40,
  fallbackText,
  className = "",
}: {
  src?: string | null;
  alt: string;
  width?: number;
  height?: number;
  fallbackText?: string;
  className?: string;
}) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 rounded text-gray-600 font-semibold ${className}`}
        style={{ width, height }}
        aria-label={alt}
      >
        {fallbackText || alt.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={`object-contain ${className}`}
      onError={() => setError(true)}
      priority // Logos are typically above the fold
    />
  );
}

/**
 * BackgroundImage - Optimized background image with overlay
 */
export function BackgroundImage({
  src,
  alt,
  overlay = "bg-black/40",
  className = "",
  children,
}: {
  src: string;
  alt: string;
  overlay?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        priority={false}
      />
      {overlay && <div className={`absolute inset-0 ${overlay}`} />}
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
}
