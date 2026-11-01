// Funciones que se pueden encender o apagar sin tocar el resto del código.

/**
 * Informes generados en el portal (dictado, propuesta, «Confirma»). Apagado de
 * momento (Nando, 01/11): los informes se hacen en Wakyma y se cuelgan en el
 * hilo del caso como adjunto, que es lo que avisa al veterinario. La pestaña
 * «Informes» sale en gris y sin poder pulsarse, y no se cuentan propuestas.
 * El API sigue entero; para encenderlo basta con poner true.
 */
export const INFORMES_ACTIVOS = false;
