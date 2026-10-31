// Errores de negocio con código HTTP.
//
// Dentro de una transacción no se puede responder y seguir: la transacción
// haría COMMIT de lo que el error quería impedir, y la respuesta saldría antes
// del COMMIT. Lanzando este error, la transacción hace ROLLBACK y el manejador
// global responde después, con todo ya escrito o deshecho.

export class ErrorHttp extends Error {
  readonly codigo: number;
  readonly extra: Record<string, unknown> | undefined;

  constructor(codigo: number, mensaje: string, extra?: Record<string, unknown>) {
    super(mensaje);
    this.name = 'ErrorHttp';
    this.codigo = codigo;
    this.extra = extra;
  }
}

export const datosIncorrectos = (mensaje: string, extra?: Record<string, unknown>) =>
  new ErrorHttp(400, mensaje, extra);
export const sinSesion = () => new ErrorHttp(401, 'Cal iniciar sessió');
export const prohibido = (mensaje = 'No tens permís per a fer això') => new ErrorHttp(403, mensaje);
export const noEncontrado = (mensaje = 'No existeix') => new ErrorHttp(404, mensaje);
export const conflicto = (mensaje: string) => new ErrorHttp(409, mensaje);
export const demasiados = (mensaje: string) => new ErrorHttp(429, mensaje);
