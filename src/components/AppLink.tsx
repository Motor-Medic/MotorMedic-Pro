import React from "react";
import { navigateApp } from "../navigation";

type AppLinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
  id?: string;
  title?: string;
  onClick?: () => void;
};

/**
 * SPA equivalent of Next.js <Link> — updates the URL and App tab state via popstate.
 */
export default function AppLink({ href, className, children, id, title, onClick }: AppLinkProps) {
  return (
    <a
      href={href}
      id={id}
      title={title}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
        navigateApp(href);
      }}
    >
      {children}
    </a>
  );
}
