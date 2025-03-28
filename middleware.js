// Remove Next.js dependency
export async function middleware(request) {
  try {
    // Check if the environment variables exist
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    console.log("Middleware accessed with env vars:", {
      url: typeof supabaseUrl === "string" ? "URL exists" : "URL missing",
      key: typeof supabaseKey === "string" ? "Key exists" : "Key missing",
    });

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing required environment variables");
      return new Response('console.error("Missing Supabase configuration");', {
        status: 500,
        headers: { "Content-Type": "application/javascript" },
      });
    }

    // Double-check that the variables don't contain template placeholders
    if (supabaseUrl.includes("{{") || supabaseKey.includes("{{")) {
      console.error("Environment variables contain template placeholders");
      return new Response(
        'console.error("Environment variables contain template placeholders. Please set actual values in Vercel.");',
        {
          status: 500,
          headers: { "Content-Type": "application/javascript" },
        }
      );
    }

    const envConfig = `
      window.SUPABASE_URL = "${supabaseUrl}";
      window.SUPABASE_ANON_KEY = "${supabaseKey}";
      console.log("Environment config loaded successfully:", {
        urlType: typeof window.SUPABASE_URL, 
        keyType: typeof window.SUPABASE_ANON_KEY,
        urlLength: window.SUPABASE_URL ? window.SUPABASE_URL.length : 0
      });
    `;

    return new Response(envConfig, {
      headers: { "Content-Type": "application/javascript" },
    });
  } catch (error) {
    console.error("Middleware error:", error);
    return new Response(
      'console.error("Failed to load environment config: ' +
        error.message +
        '");',
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
