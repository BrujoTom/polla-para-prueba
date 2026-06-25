export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache corto: evita golpear el límite de football-data.org (10 req/min)
  // cuando varios usuarios de la polla refrescan al mismo tiempo,
  // pero sigue siendo casi en tiempo real (15s).
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');

  const TOKEN = process.env.FBD_TOKEN || 'dc3d5ee6bd31409989b550363926cfaa';

  // ── Ventana de fechas: hoy ± 1 día (zona horaria UTC) ──
  // Esto asegura que capturamos partidos en vivo/recién terminados
  // sin depender de la ventana por defecto de la API (que puede no
  // incluir el día de hoy si solo se pide /matches sin filtros).
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setUTCDate(hoy.getUTCDate() - 1);
  const manana = new Date(hoy);
  manana.setUTCDate(hoy.getUTCDate() + 1);

  const fmt = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD
  const dateFrom = fmt(ayer);
  const dateTo = fmt(manana);

  const url = `https://api.football-data.org/v4/competitions/WC/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;

  try {
    const upstream = await fetch(url, {
      headers: { 'X-Auth-Token': TOKEN },
      cache: 'no-store',
    });

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
        debug: { url, dateFrom, dateTo },
      });
    }

    // Log resumido para debug en Vercel Functions
    const relevantes = (data.matches || []).filter(m => m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED');
    const enVivo = (data.matches || []).filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
    console.log(`[scores proxy] OK — ${data.matches?.length ?? 0} partidos en ventana ${dateFrom}/${dateTo}, ${relevantes.length} finalizados/en vivo, ${enVivo.length} EN VIVO`);
    if (enVivo.length > 0) {
      console.log('[scores proxy] EN VIVO:', enVivo.map(m => `${m.homeTeam?.name} ${m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0}-${m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0} ${m.awayTeam?.name} (${m.status})`).join(' | '));
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('[scores proxy] exception:', err.message);
    return res.status(200).json({ matches: [], error: err.message, debug: { url, dateFrom, dateTo } });
  }
}
