"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, CheckCircle, Shield } from "lucide-react";

interface Project {
  id: string;
  name: string;
  targetUrl: string;
}

interface StartScanFormProps {
  projects: Project[];
}

type FormState = "idle" | "starting" | "started" | "error";

export function StartScanForm({ projects }: StartScanFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [targetUrlOverride, setTargetUrlOverride] = useState<string>("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [optimisticScan, setOptimisticScan] = useState<{
    projectName: string;
    targetUrl: string;
  } | null>(null);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const isLoading = formState === "starting" || isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !selectedProject) {
      setError("Please select a project");
      return;
    }

    // Optimistic update - show starting state immediately
    setFormState("starting");
    setError(null);
    setOptimisticScan({
      projectName: selectedProject.name,
      targetUrl: targetUrlOverride || selectedProject.targetUrl,
    });

    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          targetUrl: targetUrlOverride || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start scan");
      }

      const scan = await response.json();

      // Show success state briefly before redirecting
      setFormState("started");

      // Navigate with transition for smoother UX
      startTransition(() => {
        router.push(`/dashboard/scans/${scan.id}`);
      });
    } catch (err) {
      setFormState("error");
      setOptimisticScan(null);
      setError(err instanceof Error ? err.message : "Failed to start scan");
    }
  };

  // Show optimistic success state
  if (formState === "started" && optimisticScan) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-green-800">Scan Started</h3>
            <p className="text-sm text-green-700">
              Scanning {optimisticScan.projectName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-green-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Redirecting to scan progress...
        </div>
      </div>
    );
  }

  // Show optimistic starting state
  if (formState === "starting" && optimisticScan) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <Shield className="h-6 w-6 text-indigo-600 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-indigo-800">
              Starting Security Scan
            </h3>
            <p className="text-sm text-indigo-700">
              {optimisticScan.projectName}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-indigo-600">
            Target: {optimisticScan.targetUrl}
          </p>
          <div className="flex items-center gap-2 text-sm text-indigo-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Initializing scan workflow...
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setFormState("idle");
            }}
            className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
          >
            Try again
          </button>
        </div>
      )}

      <div>
        <label
          htmlFor="project"
          className="block text-sm font-medium text-gray-700"
        >
          Project
        </label>
        <select
          id="project"
          value={selectedProjectId}
          onChange={(e) => {
            setSelectedProjectId(e.target.value);
            setTargetUrlOverride("");
            setError(null);
          }}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          disabled={isLoading}
        >
          <option value="">Select a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProject && (
        <div>
          <label
            htmlFor="targetUrl"
            className="block text-sm font-medium text-gray-700"
          >
            Target URL
            <span className="ml-1 text-gray-400 font-normal">(optional override)</span>
          </label>
          <input
            type="url"
            id="targetUrl"
            value={targetUrlOverride}
            onChange={(e) => setTargetUrlOverride(e.target.value)}
            placeholder={selectedProject.targetUrl}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
            disabled={isLoading}
          />
          <p className="mt-1 text-sm text-gray-500">
            Leave empty to use project default: {selectedProject.targetUrl}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!selectedProjectId || isLoading}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start Scan
            </>
          )}
        </button>
      </div>
    </form>
  );
}
