import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#161616",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 3,
          padding: "6px 7px",
        }}
      >
        <div style={{ width: 4, height: 12, background: "#1faf6a" }} />
        <div style={{ width: 4, height: 20, background: "#ff5d52" }} />
        <div style={{ width: 4, height: 9, background: "#1faf6a" }} />
      </div>
    ),
    { ...size },
  );
}
