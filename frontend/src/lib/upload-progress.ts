export interface HttpUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export function percentFromBytes(loaded: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
}

/** Overall average speed so far — stable like Drive/YouTube remaining-time. */
export function estimateRemainingSeconds(
  loaded: number,
  total: number,
  startedAt: number,
  now = Date.now(),
): number | null {
  if (!(total > 0) || loaded <= 0) return null;
  if (loaded >= total) return 0;
  const elapsedSec = (now - startedAt) / 1000;
  if (elapsedSec < 0.6 || loaded < 8 * 1024) return null;
  const speed = loaded / elapsedSec;
  if (speed < 64) return null;
  return Math.max(1, Math.round((total - loaded) / speed));
}

export function formatUploadEta(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds <= 2) return "a few seconds left";
  if (seconds < 60) return `${seconds} seconds left`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) {
    if (minutes < 10 && rem > 0) {
      return `${minutes}:${String(rem).padStart(2, "0")} left`;
    }
    return minutes === 1 ? "about 1 minute left" : `about ${minutes} minutes left`;
  }
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  if (restMin === 0) {
    return hours === 1 ? "about 1 hour left" : `about ${hours} hours left`;
  }
  return `${hours}h ${restMin}m left`;
}

export function formatElapsedClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}:${String(sec).padStart(2, "0")}`;
  const hours = Math.floor(min / 60);
  return `${hours}h ${min % 60}m`;
}
