"use client";

import { useState, useTransition, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  Save,
  Trash2,
  ArrowLeft,
  AlertTriangle,
  Clock
} from "lucide-react";
import {
  getOrganization,
  updateOrganization,
  deleteOrganization,
  cancelOrganizationDeletion
} from "@/lib/actions/organizations";
import { OrgLogoUpload } from "@/components/org-logo-upload";
import { DeleteOrgModal } from "@/components/delete-org-modal";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logoUrl: string | null;
  deletedAt: Date | null;
  scheduledDeletionAt: Date | null;
  memberships: {
    id: string;
    role: string;
    user: {
      id: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
    };
  }[];
}

export default function OrgSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userRole, setUserRole] = useState<string>("member");

  // Load organization data
  useEffect(() => {
    async function loadOrg() {
      try {
        const org = await getOrganization(orgId);
        if (!org) {
          router.push("/dashboard");
          return;
        }
        setOrganization(org as Organization);
        setName(org.name);
        // Find user's role (we'll use the first membership for now - in a real app this would come from auth)
        const membership = org.memberships[0];
        if (membership) {
          setUserRole(membership.role);
        }
      } catch (error) {
        console.error("Error loading organization:", error);
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    }
    loadOrg();
  }, [orgId, router]);

  const handleSave = () => {
    if (!name.trim()) {
      setMessage({ type: "error", text: "Organization name is required" });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        await updateOrganization(orgId, { name: name.trim() });
        setMessage({ type: "success", text: "Organization updated successfully" });
        // Refresh organization data
        const org = await getOrganization(orgId);
        if (org) {
          setOrganization(org as Organization);
        }
        router.refresh();
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to update organization"
        });
      }
    });
  };

  const handleLogoChange = async (logoUrl: string | null) => {
    try {
      await updateOrganization(orgId, { logoUrl });
      // Refresh organization data
      const org = await getOrganization(orgId);
      if (org) {
        setOrganization(org as Organization);
      }
      setMessage({ type: "success", text: "Logo updated successfully" });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update logo"
      });
    }
  };

  const handleDelete = async () => {
    startTransition(async () => {
      try {
        await deleteOrganization(orgId);
        setShowDeleteModal(false);
        // Switch to another org or redirect to dashboard
        document.cookie = "current_org=;path=/;max-age=0";
        router.push("/dashboard");
        router.refresh();
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to delete organization"
        });
        setShowDeleteModal(false);
      }
    });
  };

  const handleCancelDeletion = () => {
    startTransition(async () => {
      try {
        await cancelOrganizationDeletion(orgId);
        // Refresh organization data
        const org = await getOrganization(orgId);
        if (org) {
          setOrganization(org as Organization);
        }
        setMessage({ type: "success", text: "Organization deletion cancelled" });
        router.refresh();
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to cancel deletion"
        });
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!organization) {
    return null;
  }

  const canManage = ["owner", "admin"].includes(userRole);
  const isOwner = userRole === "owner";
  const isPendingDeletion = organization.deletedAt !== null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your organization&apos;s details and preferences.
          </p>
        </div>
      </div>

      {/* Pending Deletion Warning */}
      {isPendingDeletion && organization.scheduledDeletionAt && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-800">
                Organization Scheduled for Deletion
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                This organization will be permanently deleted on{" "}
                {new Date(organization.scheduledDeletionAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                . All data including scans, findings, and team members will be removed.
              </p>
              {isOwner && (
                <button
                  onClick={handleCancelDeletion}
                  disabled={isPending}
                  className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {isPending ? "Cancelling..." : "Cancel Deletion"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Organization Details */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">
              General Settings
            </h2>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Organization Logo
            </label>
            <OrgLogoUpload
              currentLogoUrl={organization.logoUrl}
              orgName={organization.name}
              onLogoChange={handleLogoChange}
              disabled={!canManage || isPendingDeletion}
            />
          </div>

          {/* Name */}
          <div>
            <label
              htmlFor="org-name"
              className="block text-sm font-medium text-gray-700"
            >
              Organization Name
            </label>
            <input
              type="text"
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage || isPendingDeletion}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Slug (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Organization URL
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-500">shannon.io/</span>
              <input
                type="text"
                value={organization.slug}
                disabled
                className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 cursor-not-allowed"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Organization URL cannot be changed
            </p>
          </div>

          {/* Plan */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Current Plan
            </label>
            <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1">
              <span className="text-sm font-medium text-indigo-700 capitalize">
                {organization.plan}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Contact sales to upgrade your plan
            </p>
          </div>

          {/* Save Button */}
          {canManage && !isPendingDeletion && (
            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                onClick={handleSave}
                disabled={isPending || name === organization.name}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                {isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Danger Zone */}
      {isOwner && !isPendingDeletion && (
        <section className="rounded-lg border border-red-200 bg-white">
          <div className="border-b border-red-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">Delete Organization</h3>
                <p className="text-sm text-gray-500">
                  Schedule this organization for deletion. You&apos;ll have 30 days to cancel
                  before all data is permanently removed.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete Organization
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Delete Modal */}
      <DeleteOrgModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        orgName={organization.name}
        isPending={isPending}
      />
    </div>
  );
}
