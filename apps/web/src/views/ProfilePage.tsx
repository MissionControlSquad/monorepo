"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { useMutation } from "urql";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Mail, Camera, Loader2, Trash2 } from "lucide-react";
import { getAssetUrl } from "@agentcenter/utils";
import { useAppContext } from "../components/context/AppContext";
import { API_ROUTES } from "@/lib/api-routes";
import { UPDATE_MY_PROFILE } from "../lib/graphql/mutations/profile";
import { Breadcrumbs, Card, Button, PageLayout } from "../components/ui";
import { AvatarCropDialog } from "../components/ui/AvatarCropDialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/shadcn/form";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";

const profileSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  bio: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

export function ProfilePage() {
  const { currentUserProfile } = useAppContext();
  const [{ fetching: saving }, updateProfile] = useMutation(UPDATE_MY_PROFILE);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: "",
      bio: "",
    },
  });

  useEffect(() => {
    if (currentUserProfile) {
      form.reset({
        displayName: currentUserProfile.displayName || "",
        bio: currentUserProfile.bio || "",
      });
      setAvatarUrl(currentUserProfile.avatarUrl || null);
    }
  }, [currentUserProfile, form]);

  const watchedDisplayName = form.watch("displayName");

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = "";

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Avatar must be under 5 MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed");
      return;
    }

    // Create a preview URL and open the cropper
    const objectUrl = URL.createObjectURL(file);
    setCropImageSrc(objectUrl);
  }, []);

  const handleCropCancel = useCallback(() => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
  }, [cropImageSrc]);

  const handleCropConfirm = useCallback(
    async (croppedBlob: Blob) => {
      if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", croppedBlob, "avatar.png");

        const res = await fetch(API_ROUTES.profile.avatar, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }

        const { avatarUrl: newUrl } = await res.json();
        setAvatarUrl(newUrl);
        toast.success("Avatar updated");
      } catch (err) {
        toast.error((err as Error).message || "Failed to upload avatar");
      } finally {
        setUploading(false);
      }
    },
    [cropImageSrc],
  );

  const handleRemoveAvatar = useCallback(async () => {
    setUploading(true);
    try {
      const result = await updateProfile({ avatarUrl: null });
      if (result.error) {
        toast.error("Failed to remove avatar");
        return;
      }
      setAvatarUrl(null);
      toast.success("Avatar removed");
    } catch {
      toast.error("Failed to remove avatar");
    } finally {
      setUploading(false);
    }
  }, [updateProfile]);

  const handleSave = async (values: ProfileValues) => {
    try {
      const result = await updateProfile({
        displayName: values.displayName,
        bio: values.bio || null,
      });

      if (result.error) {
        const msg = result.error.graphQLErrors[0]?.message || result.error.message;
        toast.error(msg);
        return;
      }

      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    }
  };

  return (
    <>
      <PageLayout maxWidth="narrow">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Profile" }]} />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your personal profile information
          </p>
        </div>

        {/* Avatar + identity preview */}
        <Card padding="lg" className="space-y-4">
          <div className="flex items-center gap-4">
            {/* Clickable avatar with upload overlay */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative flex-shrink-0 w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center ring-2 ring-border group cursor-pointer"
            >
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={getAssetUrl(avatarUrl, { public: true }) ?? undefined}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-semibold text-muted-foreground">
                  {watchedDisplayName?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              {/* Overlay: always visible when uploading, hover-only otherwise */}
              <div
                className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${
                  uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground truncate">
                {watchedDisplayName || "Your Name"}
              </p>
              {currentUserProfile?.username && (
                <p className="text-sm text-muted-foreground truncate">
                  @{currentUserProfile.username}
                </p>
              )}
              {currentUserProfile?.user?.email && (
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" />
                  {currentUserProfile.user.email}
                </p>
              )}
            </div>
          </div>
          {uploading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Uploading avatar...
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Click on the avatar to upload a new image (PNG, JPEG, GIF, or WebP, max 5 MB)
              </p>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors ml-2 flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Edit form */}
        <Card padding="lg" className="relative space-y-4">
          {saving && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving profile...
              </div>
            </div>
          )}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">Profile Information</h2>
              <p className="text-sm text-muted-foreground mt-1">Update your display name and bio</p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Display Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="Your display name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Tell us about yourself..." rows={3} {...field} />
                    </FormControl>
                    <FormDescription>A short description visible to others</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                loading={saving}
                disabled={!form.formState.isDirty}
                className="w-full"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </Card>
      </PageLayout>

      {/* Avatar crop dialog */}
      <AvatarCropDialog
        open={!!cropImageSrc}
        onOpenChange={(open) => {
          if (!open) handleCropCancel();
        }}
        imageSrc={cropImageSrc ?? ""}
        onCrop={handleCropConfirm}
      />
    </>
  );
}
