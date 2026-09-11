export const dynamic = 'force-dynamic';

/** Readiness for the combined deployment; no credentials or database data returned. */
export async function GET(): Promise<Response> {
  if (process.env.SINGLE_APP !== 'true') {
    return Response.json({ status: 'ok' });
  }

  try {
    const response = await fetch('http://127.0.0.1:4732/auth/me', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    // Nest only begins listening after its initial MongoDB connection succeeds.
    if (response.status === 401) {
      return Response.json({ status: 'ok' });
    }
  } catch {
    // A starting or unavailable API must not report ready.
  }
  return Response.json({ status: 'unavailable' }, { status: 503 });
}
