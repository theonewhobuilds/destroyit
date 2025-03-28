import { NextResponse } from "next/server";

export async function middleware(request) {
  try {
    // Check if the environment variables exist
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.error("Missing required environment variables");
      return new NextResponse(
        'console.error("Missing Supabase configuration");',
        {
          status: 500,
          headers: { "Content-Type": "application/javascript" },
        }
      );
    }

    const envConfig = `
      window.SUPABASE_URL = "${process.env.SUPABASE_URL}";
      window.SUPABASE_ANON_KEY = "${process.env.SUPABASE_ANON_KEY}";
      console.log("Environment config loaded successfully");
    `;

    return new NextResponse(envConfig, {
      headers: { "Content-Type": "application/javascript" },
    });
  } catch (error) {
    console.error("Middleware error:", error);
    return new NextResponse(
      'console.error("Failed to load environment config");',
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
