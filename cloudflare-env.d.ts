declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
interface CloudflareEnv {
  DB: D1Database;
  TRIP_CODE_HASH: string;
  SESSION_SECRET: string;
}
