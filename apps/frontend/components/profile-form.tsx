"use client";
import { AccountProfile } from "./profile-preview";
import { Guard } from "./feedback/states";
export function ProfileForm() {
  return (
    <Guard>
      <AccountProfile />
    </Guard>
  );
}
