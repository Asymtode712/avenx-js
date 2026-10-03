import { logger } from '../../core/runtime/AvenxLogger.js';
import { BuildError } from '../errors/BuildError.js';
import { formatCodeFrame } from '../errors/CompilerError.js';

/**
 * How many {@link withWarningsSuppressed} calls are currently running. While
 * it is above zero, {@link reportWarning} reports nothing.
 * @type {number}
 */
let suppressionDepth = 0;

/**
 * Runs `fn` without reporting any compiler warning it raises.
 *
 * For a second pass over source that has already been compiled and reported
 * once, such as `avenx stats` re-parsing each template to measure its size.
 * Without this, every diagnostic from the first pass was printed again.
 * @template T
 * @param {() => T} fn - The work to run.
 * @returns {T} Whatever `fn` returns.
 */
export function withWarningsSuppressed(fn) {
  suppressionDepth++;
  try {
    return fn();
  } finally {
    suppressionDepth--;
  }
}

/**
 * Reports a compiler warning according to configured warning severities.
 * @param {string} code - Avenx error/warning code (e.g. 'AVX_W03').
 * @param {string|Error} errOrMessage - An Error object or formatted warning message string.
 * @param {object} [config] - The application configuration object containing `warnings` overrides.
 * @param {object} [location] - Location metadata { line, column, source, filename, index, length }.
 */
export function reportWarning(code, errOrMessage, config = {}, location = null) {
  if (suppressionDepth > 0) {
    return;
  }

  const warnings = (config && config.warnings) || {};
  const rawSeverity = warnings[code];
  const severity = typeof rawSeverity === 'string' ? rawSeverity.trim().toLowerCase() : 'warn';

  if (severity === 'off' || severity === 'ignore') {
    return;
  }

  let errorObj = null;
  if (errOrMessage instanceof Error) {
    errorObj = errOrMessage;
    if (location && typeof errorObj.setLocation === 'function' && !errorObj.frame) {
      errorObj.setLocation(location);
    }
  }

  let message = String(errOrMessage);
  if (errorObj && errorObj.message) {
    message = errorObj.message;
  } else if (typeof errOrMessage === 'string') {
    message = errOrMessage;
    if (location && location.source && location.line && location.column) {
      const frame = formatCodeFrame(location.source, location.line, location.column, location);
      if (frame && !message.includes(frame)) {
        message += `\n\n${frame}`;
      }
    }
  }

  if (severity === 'error') {
    if (errorObj) {
      throw errorObj;
    }
    const buildErr = new BuildError(code, message);
    if (location) {
      buildErr.setLocation(location);
    }
    throw buildErr;
  }

  logger.warn(message);
}

export default reportWarning;

