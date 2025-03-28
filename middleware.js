export default async function middleware(req) {
  const response = await fetch("/env-config.js");
  let text = await response.text();

  text = text.replace("{{SUPABASE_URL}}", process.env.SUPABASE_URL);
  text = text.replace("{{SUPABASE_ANON_KEY}}", process.env.SUPABASE_ANON_KEY);

  return new Response(text, {
    headers: { "Content-Type": "application/javascript" },
  });
}
