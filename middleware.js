// Remove Next.js dependency
export async function middleware(request) {
  try {
    // HARDCODED VALUES - V3 FIX
    const supabaseUrl = "https://ikbnuqabgdgikorhipnm.supabase.co";
    // Hardcode the anon key as well since environment variables aren't working
    const supabaseKey =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrb251cWFiZ2RnaWtvcmhpcG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDczNDM5NjgsImV4cCI6MjAyMjkxOTk2OH0.7puLpOsSlPIWn6OhMd-wLxtlGhXFTZdmwWhNazjVvzk";

    console.log("[MIDDLEWARE V3] Using hardcoded URL and key");

    // Log detailed information about what we're receiving
    console.log("[MIDDLEWARE V3] Using hardcoded values:", {
      urlExists: !!supabaseUrl,
      keyExists: !!supabaseKey,
      urlType: typeof supabaseUrl,
      keyType: typeof supabaseKey,
      urlLength: supabaseUrl?.length,
      keyLength: supabaseKey?.length,
    });

    // Return both values but with clear source identification
    const envConfig = `  
      console.log("Middleware V3 executed at ${new Date().toISOString()}");
      window.SUPABASE_URL = "${supabaseUrl}";
      window.SUPABASE_ANON_KEY = "${supabaseKey}";
      window.MIDDLEWARE_VERSION = "V3";
      window.MIDDLEWARE_TIMESTAMP = "${new Date().toISOString()}";
      console.log("Environment config loaded from middleware V3 at " + window.MIDDLEWARE_TIMESTAMP);
    `;

    return new Response(envConfig, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[MIDDLEWARE V3] Error:", error);
    return new Response(
      `console.error("Middleware V3 error: ${error.message}");`,
      {
        status: 500,
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }
}

export const config = {
  matcher: "/env-config.js", // This defines the URL where the middleware is applied
};
