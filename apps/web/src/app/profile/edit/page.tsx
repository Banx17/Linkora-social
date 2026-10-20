'use client';

/**
 * Profile edit page.
 *
 * The Server Action is wired directly to ProfileForm via its `action` prop —
 * this page only needs to pass the wallet address so the action can identify
 * the user.  No `onSubmit` handler, no client-side fetch.
 */

import { ProfileForm } from '@/components/forms/ProfileForm';
import { useWallet } from '@/hooks/useWallet';

export default function ProfileEditPage() {
  const { address, connected } = useWallet();

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
      <ProfileForm address={address} />
    </div>
  );
}
