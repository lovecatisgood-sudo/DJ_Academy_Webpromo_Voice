"use client";

import { translateAdminText } from "./AdminLocalizer";

type ConfirmSubmitButtonProps = {
  message: string;
  children: React.ReactNode;
  className: string;
};

export function ConfirmSubmitButton({ message, children, className }: ConfirmSubmitButtonProps) {
  return (
    <button
      className={className}
      onClick={(event) => {
        const prompt = window.localStorage.getItem("djai-admin-locale") === "en" ? message : translateAdminText(message);
        if (!window.confirm(prompt)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
