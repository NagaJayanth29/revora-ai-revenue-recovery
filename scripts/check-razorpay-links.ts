import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.log("No credentials found");
    return;
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  const data = await res.json();
  console.log("Payment Links Count:", data.payment_links?.length);
  if (data.payment_links) {
    for (const pl of data.payment_links) {
      console.log({
        id: pl.id,
        amount: pl.amount,
        currency: pl.currency,
        status: pl.status,
        reference_id: pl.reference_id,
        short_url: pl.short_url,
        notes: pl.notes,
        created_at: pl.created_at,
      });
    }
  }
}

main().catch(console.error);
