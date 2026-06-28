"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button
      className="secondary-action"
      type="button"
      onClick={() => void signOut({ redirectTo: "/signin" })}
    >
      <LogOut aria-hidden="true" size={18} />
      Sair
    </button>
  );
}
