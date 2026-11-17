import { connection } from "next/server";
import { getQuotes } from "@/lib/market";

export async function GET() {
  await connection();
  try {
    const result = await getQuotes();
    return Response.json(
      { updatedAt: Date.now(), source: result.source, quotes: result.quotes },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Market data is temporarily unavailable." },
      { status: 503 },
    );
  }
}
