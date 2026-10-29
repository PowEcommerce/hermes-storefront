/** Error que se muestra tal cual al usuario (sin stack) y sale con `code`. */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly code = 1,
  ) {
    super(message);
  }
}
