import type { ReactNode } from "react";

export interface PlaceholderCardProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PlaceholderCard({ title, description, actions }: PlaceholderCardProps) {
  return (
    <div
      style={{
        border: "1px solid rgba(148, 163, 184, 0.4)",
        borderRadius: "16px",
        padding: "24px",
        background: "rgba(15, 23, 42, 0.65)",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        maxWidth: "480px",
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>{title}</h2>
        {description ? (
          <p style={{ margin: "8px 0 0", lineHeight: 1.6, color: "rgba(226, 232, 240, 0.75)" }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div style={{ marginTop: "12px" }}>{actions}</div> : null}
    </div>
  );
}
