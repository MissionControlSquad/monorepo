import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#0a0a0a",
        color: "#fafafa",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 400, padding: 24 }}>
        <h2 style={{ fontSize: 48, fontWeight: 700, marginBottom: 8, color: "#a1a1aa" }}>404</h2>
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Page not found</p>
        <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16 }}>
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          style={{
            color: "#3b82f6",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
