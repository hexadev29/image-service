export const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export const minutes = (v: number) => {
  const h = Math.floor(v / 60),
    m = Math.round(v % 60),
    hs =
      h >= 1000
        ? new Intl.NumberFormat().format(h)
        : h < 100
          ? String(h).padStart(2, "0")
          : String(h);
  return m ? `${hs}h ${String(m).padStart(2, "0")}m` : `${h}h`;
};
export function ellipsis(ctx: any, s: string, max: number) {
  if (ctx.measureText(s).width <= max) return s;
  while (s && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}
