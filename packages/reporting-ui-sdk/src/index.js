import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PlaceholderCard({ title, description, actions }) {
    return (_jsxs("div", { style: {
            border: "1px solid rgba(148, 163, 184, 0.4)",
            borderRadius: "16px",
            padding: "24px",
            background: "rgba(15, 23, 42, 0.65)",
            color: "#e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            maxWidth: "480px",
        }, children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0, fontSize: "20px", fontWeight: 600 }, children: title }), description ? (_jsx("p", { style: { margin: "8px 0 0", lineHeight: 1.6, color: "rgba(226, 232, 240, 0.75)" }, children: description })) : null] }), actions ? _jsx("div", { style: { marginTop: "12px" }, children: actions }) : null] }));
}
