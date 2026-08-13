export class DesktopInitializationError extends Error {
  constructor(message = 'Desktop initialization failed') {
    super(message);
    this.name = 'DesktopInitializationError';
  }
}
export class BackendConnectionError extends Error {
  constructor(message = 'Backend connection failed') {
    super(message);
    this.name = 'BackendConnectionError';
  }
}
export class IPCValidationError extends Error {
  constructor(message = 'IPC validation failed') {
    super(message);
    this.name = 'IPCValidationError';
  }
}
export class IPCPermissionError extends Error {
  constructor(message = 'IPC permission denied') {
    super(message);
    this.name = 'IPCPermissionError';
  }
}
export class BackendUnavailableError extends Error {
  constructor(message = 'Backend unavailable') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}
export class RendererInitializationError extends Error {
  constructor(message = 'Renderer initialization failed') {
    super(message);
    this.name = 'RendererInitializationError';
  }
}
export class ConfigurationError extends Error {
  constructor(message = 'Configuration invalid') {
    super(message);
    this.name = 'ConfigurationError';
  }
}
