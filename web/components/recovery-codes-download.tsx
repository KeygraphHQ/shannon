"use client";

import { useState } from "react";
import { Download, Copy, Check, AlertTriangle } from "lucide-react";

interface RecoveryCodesDownloadProps {
  codes: string[];
  onComplete: () => void;
}

export function RecoveryCodesDownload({ codes, onComplete }: RecoveryCodesDownloadProps) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleCopy = async () => {
    const text = codes.join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = `Shannon Security - Recovery Codes
Generated: ${new Date().toISOString()}

Keep these codes in a safe place. Each code can only be used once.
If you lose access to your authenticator app, you can use one of these
codes to sign in to your account.

Recovery Codes:
${codes.map((code, i) => `${i + 1}. ${code}`).join("\n")}

IMPORTANT:
- Store these codes securely (password manager, printed copy in safe)
- Each code can only be used once
- Generate new codes if you've used most of them
`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shannon-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const canComplete = (copied || downloaded) && acknowledged;

  return (
    <div className="space-y-6">
      {/* Warning */}
      <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">Save these codes now</p>
          <p className="mt-1">
            You won&apos;t be able to see these codes again. If you lose access to your
            authenticator and don&apos;t have these codes, you&apos;ll lose access to your
            account.
          </p>
        </div>
      </div>

      {/* Codes Grid */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="grid grid-cols-2 gap-2">
          {codes.map((code, index) => (
            <div
              key={index}
              className="rounded bg-white px-3 py-2 font-mono text-sm text-gray-700 border border-gray-100"
            >
              <span className="text-gray-400 mr-2">{index + 1}.</span>
              {code}
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-3">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy codes
            </>
          )}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {downloaded ? (
            <>
              <Check className="h-4 w-4 text-green-600" />
              Downloaded!
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download codes
            </>
          )}
        </button>
      </div>

      {/* Acknowledgment */}
      <div className="border-t border-gray-200 pt-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600">
            I have saved these recovery codes in a secure location
          </span>
        </label>
      </div>

      {/* Continue Button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={onComplete}
          disabled={!canComplete}
          className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue
        </button>
      </div>

      {!canComplete && (
        <p className="text-center text-xs text-gray-500">
          {!copied && !downloaded
            ? "Copy or download your codes"
            : "Confirm you've saved your codes"}{" "}
          to continue
        </p>
      )}
    </div>
  );
}
