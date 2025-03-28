export default async function middleware(req) {
  const envConfig = `
    window.SUPABASE_URL = '${process.env.SUPABASE_URL}';
    window.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY}';
  `;

  return new Response(envConfig, {
    headers: { "Content-Type": "application/javascript" },
  });
}

export const config = {
  matcher: "/env-config.js",
};
