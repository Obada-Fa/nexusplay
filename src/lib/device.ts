const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|webOS|BlackBerry|Opera Mini|IEMobile/i;

// iPadOS reports a desktop Mac user agent, so only touch points give it away.
export function isController(userAgent: string, touchPoints: number): boolean {
  return MOBILE_UA.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
}

export function entryRoute(userAgent: string, touchPoints: number): "/join" | "/host" {
  return isController(userAgent, touchPoints) ? "/join" : "/host";
}

// Server side has no touch info: only answer when the headers are sure it's a phone or tablet.
export function isControllerRequest(userAgent: string | null, chMobile: string | null): boolean {
  return chMobile === "?1" || MOBILE_UA.test(userAgent ?? "");
}

// `/host?as=host` lets a tablet deliberately act as the shared screen.
export const FORCE_HOST_PARAM = "as";
