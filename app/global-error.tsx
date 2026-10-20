"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          alignItems: "center",
          background: "#f8fafc",
          color: "#172033",
          display: "flex",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100vh",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "420px", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", margin: 0 }}>页面暂时无法显示</h1>
          <p style={{ color: "#64748b", fontSize: "14px", lineHeight: 1.7, margin: "12px 0 24px" }}>
            页面加载遇到问题，请刷新后重试。
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
              window.location.reload();
            }}
            style={{
              background: "#2563eb",
              border: 0,
              borderRadius: "6px",
              color: "white",
              cursor: "pointer",
              fontSize: "14px",
              padding: "10px 18px",
            }}
          >
            刷新页面
          </button>
        </main>
      </body>
    </html>
  );
}
