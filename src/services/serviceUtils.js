export class GameServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "GameServiceError";
    this.cause = cause;
  }
}

export async function mockRequest(operation, fallbackMessage = "No pudimos cargar los datos.") {
  try {
    return await Promise.resolve().then(operation);
  } catch (error) {
    throw new GameServiceError(fallbackMessage, error);
  }
}
