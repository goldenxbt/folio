import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const up = "#3dbe7a";
const down = "#f0524a";

function Candle({
  x,
  y,
  body,
  above,
  below,
  width,
  color,
}: {
  x: number;
  y: number;
  body: number;
  above: number;
  below: number;
  width: number;
  color: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height: above + body + below,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ width: 2, height: above, background: color }} />
      <div style={{ width, height: body, background: color, borderRadius: 1 }} />
      <div style={{ width: 2, height: below, background: color }} />
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#121418",
          borderRadius: 8,
          display: "flex",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 23,
            width: 24,
            height: 1,
            background: "rgba(255,255,255,0.16)",
          }}
        />
        <Candle x={5} y={15} above={2} body={6} below={3} width={5} color={down} />
        <Candle x={15} y={4} above={3} body={13} below={3} width={8} color={up} />
      </div>
    ),
    { ...size },
  );
}
