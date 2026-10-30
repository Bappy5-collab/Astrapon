"use client";

/** Last-resort boundary when the root layout itself fails; must render its own <html> and avoid the theme. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F5F1E8", color: "#2A261F" }}>
        <main role="alert" style={{ maxWidth: 560, margin: "15vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 28 }}>FieldShift could not load</h1>
          <p>An unexpected error stopped the application from starting. No data was changed.</p>
          {error.digest ? <p style={{ color: "#5C5446" }}>Reference: {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, padding: "10px 20px", borderRadius: 999, border: 0, background: "#1B3A2A", color: "#FBF9F4", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
