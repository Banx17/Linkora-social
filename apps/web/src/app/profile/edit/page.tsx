"use client";

import { useCallback, useEffect, useState } from "react";
import { ProfileForm, ProfileFormValues } from "@/components/forms/ProfileForm";
import { ProfileImageUploader } from "@/components/profile/ProfileImageUploader";
import { useWallet } from "@/hooks/useWallet";
import { fetchUploadConfig } from "@/lib/api";
import {
  getProfileAvatar,
  getProfileCover,
  saveProfileAvatar,
  saveProfileCover,
} from "@/lib/profileMedia";

export default function ProfileEditPage() {
  const { address, connected } = useWallet();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!address) return;
    setAvatarUrl(getProfileAvatar(address));
    setCoverUrl(getProfileCover(address));
  }, [address]);

  useEffect(() => {
    let active = true;
    fetchUploadConfig().then((config) => {
      if (active) setMaxUploadBytes(config.max_upload_bytes);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleAvatarChange = useCallback(
    (url: string | null) => {
      setAvatarUrl(url);
      if (address) saveProfileAvatar(address, url);
    },
    [address]
  );

  const handleCoverChange = useCallback(
    (url: string | null) => {
      setCoverUrl(url);
      if (address) saveProfileCover(address, url);
    },
    [address]
  );

  async function handleSubmit(values: ProfileFormValues) {
    if (!address) return;
    // TODO: call contract set_profile(address, values.username, values.creatorToken || address)
    console.log("set_profile", { address, ...values, avatarUrl, coverUrl });
  }

  if (!connected || !address) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md">
        <p className="text-gray-600">Connect your wallet to create or edit your profile.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>

      <section aria-label="Profile images" className="mb-6 space-y-6">
        <ProfileImageUploader
          kind="avatar"
          value={avatarUrl}
          onChange={handleAvatarChange}
          maxUploadBytes={maxUploadBytes}
          alt="Profile photo preview"
        />
        <ProfileImageUploader
          kind="cover"
          value={coverUrl}
          onChange={handleCoverChange}
          maxUploadBytes={maxUploadBytes}
          alt="Cover image preview"
        />
      </section>

      <ProfileForm onSubmit={handleSubmit} />
    </div>
  );
}
