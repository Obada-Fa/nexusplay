export function entryRoute(userAgent: string, touchPoints: number): "/join" | "/host" {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1) ? "/join" : "/host";
}
