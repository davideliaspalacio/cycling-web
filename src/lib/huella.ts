import "server-only";

/**
 * Quién y desde dónde aceptó algo. Se guarda junto a la autorización de cobro
 * recurrente porque es lo que un banco pide cuando alguien desconoce un cargo.
 */
export function huellaDe(peticion: Request): {
  ip?: string;
  navegador?: string;
} {
  const reenviada = peticion.headers.get("x-forwarded-for");
  const ip =
    reenviada?.split(",")[0]?.trim() ||
    peticion.headers.get("x-real-ip")?.trim() ||
    undefined;
  return {
    ip,
    navegador: peticion.headers.get("user-agent")?.slice(0, 300) ?? undefined,
  };
}
