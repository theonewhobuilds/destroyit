// Remove Next.js dependency
export async function middleware(request) {
  try {
    // Check if the environment variables exist
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    // Log detailed information about what we're receiving
    console.log("[MIDDLEWARE] Raw env vars:", {
      urlExists: !!supabaseUrl,
      keyExists: !!supabaseKey,
      urlType: typeof supabaseUrl,
      keyType: typeof supabaseKey,
      urlLength: supabaseUrl?.length,
      urlValue: supabaseUrl
        ? supabaseUrl.substring(0, 10) + "..."
        : "undefined",
    });

    if (!supabaseUrl || !supabaseKey) {
      console.error("[MIDDLEWARE] Missing required environment variables");
      return new Response(
        'console.error("Missing Supabase configuration in middleware");',
        {
          status: 500,
          headers: { "Content-Type": "application/javascript" },
        }
      );
    }

    // Double-check that the variables don't contain template placeholders
    if (supabaseUrl.includes("{{") || supabaseKey.includes("{{")) {
      console.error(
        "[MIDDLEWARE] Environment variables contain template placeholders"
      );
      return new Response(
        'console.error("Environment variables contain template placeholders. Please set actual values in Vercel.");',
        {
          status: 500,
          headers: { "Content-Type": "application/javascript" },
        }
      );
    }

    // Return both values but with clear source identification
    const envConfig = `
      window.SUPABASE_URL = "${supabaseUrl}";
      window.SUPABASE_ANON_KEY = "${supabaseKey}";
      window.MIDDLEWARE_TIMESTAMP = "${new Date().toISOString()}";
      console.log("Environment config loaded from middleware at " + window.MIDDLEWARE_TIMESTAMP);
    `;

    return new Response(envConfig, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store, max-age=0", // Prevent caching
      },
    });
  } catch (error) {
    console.error("[MIDDLEWARE] Error:", error);
    return new Response(
      'console.error("Middleware error: ' + error.message + '");',
      {
        status: 500,
        headers: { "Content-Type": "application/javascript" },
      }
    );
  }
}

export const config = {
  matcher: "/env-config.js",
};
