export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache corto: evita golpear el límite de football-data.org (10 req/min)
  // cuando varios usuarios de la polla refrescan al mismo tiempo,
  // pero sigue siendo casi en tiempo real (15s).
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');

  const TOKEN = process.env.FBD_TOKEN || 'dc3d5ee6bd31409989b550363926cfaa';

  try {
    const upstream = await fetch(
      'https://api.football-data.org/v4/competitions/WC/matches',
      {
        headers: { 'X-Auth-Token': TOKEN },
        cache: 'no-store',
      }
    );

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { matches: [], error: 'Respuesta no-JSON de football-data.org', raw: text.slice(0, 300) };
    }

    if (!upstream.ok) {
      console.error('[scores proxy] upstream error', upstream.status, text.slice(0, 300));
      return res.status(200).json({
        matches: [],
        error: `football-data ${upstream.status}: ${data?.message || text.slice(0,200)}`,
      });
    }

    // Log resumido para debug en Vercel Functions
    const relevantes = (data.matches || []).filter(m => m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED');
    console.log(`[scores proxy] OK — ${data.matches?.length ?? 0} partidos totales, ${relevantes.length} finalizados/en vivo`);

    return res.status(200).json(data);

  } catch (err) {
    console.error('[scores proxy] exception:', err.message);
    return res.status(200).json({ matches: [], error: err.message });
  }
}
