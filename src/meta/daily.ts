import { formatTime } from "../config";

const KEY = "kart-daily-meta-v1";

export type DailyMeta = {
  day: string;
  races: number;
  bestLap: number;
};

/** Calendar day in America/Sao_Paulo (BRT/BRST). */
export function brtDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function empty(day = brtDayKey()): DailyMeta {
  return { day, races: 0, bestLap: Infinity };
}

export function loadDailyMeta(): DailyMeta {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<DailyMeta>;
    const day = brtDayKey();
    if (parsed.day !== day) return empty(day);
    return {
      day,
      races: typeof parsed.races === "number" && parsed.races >= 0 ? parsed.races : 0,
      bestLap:
        typeof parsed.bestLap === "number" && Number.isFinite(parsed.bestLap) && parsed.bestLap > 0
          ? parsed.bestLap
          : Infinity,
    };
  } catch {
    return empty();
  }
}

export function saveDailyMeta(meta: DailyMeta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* private mode / quota */
  }
}

/** Record one finished race; returns updated meta + whether best lap improved. */
export function recordRaceFinish(playerBestLap: number): { meta: DailyMeta; newBest: boolean } {
  const meta = loadDailyMeta();
  meta.races += 1;
  let newBest = false;
  if (Number.isFinite(playerBestLap) && playerBestLap > 0 && playerBestLap < meta.bestLap) {
    meta.bestLap = playerBestLap;
    newBest = true;
  }
  saveDailyMeta(meta);
  return { meta, newBest };
}

/** Soft PT-BR line for title / podium. */
export function dailyMetaLine(meta: DailyMeta = loadDailyMeta()): string {
  const races =
    meta.races === 0 ? "nenhuma corrida ainda" : meta.races === 1 ? "1 corrida" : `${meta.races} corridas`;
  if (!Number.isFinite(meta.bestLap)) {
    return `Hoje · ${races}`;
  }
  return `Hoje · ${races} · melhor volta ${formatTime(meta.bestLap)}`;
}
