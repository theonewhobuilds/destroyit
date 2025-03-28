// Remove Next.js dependency
export async function middleware(request) {
  try {
    // HARDCODED VALUES - V2 FIX
    const supabaseUrl = "https://ikbnuqabgdgikorhipnm.supabase.co";
    const supabaseKey =
      process.env.SUPABASE_ANON_KEY || "{{SUPABASE_ANON_KEY}}";

    console.log("[MIDDLEWARE V2] Using hardcoded URL:", supabaseUrl);

    // Log detailed information about what we're receiving
    console.log("[MIDDLEWARE V2] Raw env vars:", {
      urlExists: !!supabaseUrl,
      keyExists: !!supabaseKey,
      urlType: typeof supabaseUrl,
      keyType: typeof supabaseKey,
      urlLength: supabaseUrl?.length,
      keyLength: supabaseKey?.length,
      urlValue: supabaseUrl,
      keyValue: supabaseKey
        ? "***" + supabaseKey.substring(supabaseKey.length - 4)
        : "undefined",
    });

    if (!supabaseUrl || !supabaseKey) {
      console.error("[MIDDLEWARE V2] Missing required environment variables");
      return new Response(
        'console.error("Missing Supabase configuration in middleware V2");',
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

    // Double-check that the variables don't contain template placeholders
    if (supabaseUrl.includes("{{") || supabaseKey.includes("{{")) {
      console.error(
        "[MIDDLEWARE V2] Environment variables contain template placeholders"
      );
      return new Response(
        'console.error("Environment variables contain template placeholders in middleware V2. Please set actual values in Vercel.");',
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

    // Return both values but with clear source identification
    const envConfig = `  
      console.log("Middleware V2 executed at ${new Date().toISOString()}");
      window.SUPABASE_URL = "${supabaseUrl}";
      window.SUPABASE_ANON_KEY = "${supabaseKey}";
      window.MIDDLEWARE_VERSION = "V2";
      window.MIDDLEWARE_TIMESTAMP = "${new Date().toISOString()}";
      console.log("Environment config loaded from middleware V2 at " + window.MIDDLEWARE_TIMESTAMP);
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
    console.error("[MIDDLEWARE V2] Error:", error);
    return new Response(
      `console.error("Middleware V2 error: ${error.message}");`,
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
