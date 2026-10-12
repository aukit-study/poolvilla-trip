import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createHmac } from "node:crypto";

const secret = process.env.SESSION_SECRET;
if (!secret) {
  console.error("Set SESSION_SECRET first (for example, load it from .env.local with --env-file).");
  process.exit(1);
}

const terminal = createInterface({ input: stdin, output: stdout });
try {
  const code = await terminal.question("Trip code: ");
  const normalized = code.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!normalized || normalized.length > 64) {
    console.error("Enter a valid trip code.");
    process.exitCode = 1;
  } else {
    const hash = createHmac("sha256", secret).update(normalized).digest("base64url");
    console.log(`TRIP_CODE_HASH=${hash}`);
  }
} finally {
  terminal.close();
}
