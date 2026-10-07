import { createPromptSession, promptQuestion } from './utils.js';
import { bold, cyan, red } from './colors.js';
import { getClosestKey } from '../lib/config.js'; // Caso getClosestKey esteja em lib/config.js

const VALID_LAYOUTS = ['blank', 'routing'];
const VALID_STYLES = ['none', 'sass', 'less', 'postcss'];

/**
 * Parses a flag value from CLI args (supports `--flag value` and `--flag=value`).
 * @param {string[]} args
 * @param {string} flagName
 * @returns {string | null}
 */
function parseFlagValue(args, flagName) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === `--${flagName}`) {
      return args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : null;
    }
    if (arg.startsWith(`--${flagName}=`)) {
      return arg.split('=')[1] || null;
    }
  }
  return null;
}

/**
 * Validates a flag value against allowed options. Exits if invalid.
 * @param {string} flagName
 * @param {string} value
 * @param {string[]} validOptions
 */
function validateOption(flagName, value, validOptions) {
  if (!validOptions.includes(value)) {
    let errorMsg = `Invalid --${flagName} '${value}'. Accepted values: ${validOptions.join(', ')}.`;
    
    // Try suggesting a similar alternative if getClosestKey is available.
    if (typeof getClosestKey === 'function') {
      const closest = getClosestKey(value, validOptions);
      if (closest) {
        errorMsg += ` Did you mean '${closest}'?`;
      }
    }

    console.error(red(errorMsg));
    process.exit(1);
  }
}

/**
 * Runs the interactive project wizard prompts if interactive mode is enabled.
 * @param {string[]} [args] - CLI arguments.
 * @returns {Promise<{stylePreprocessor: string, layoutTemplate: string, isInteractive: boolean}>}
 */
export async function runWizard(args = []) {
  const cliLayout = parseFlagValue(args, 'layout');
  const cliStyle = parseFlagValue(args, 'style');

  if (cliLayout) {
    validateOption('layout', cliLayout, VALID_LAYOUTS);
  }
  if (cliStyle) {
    validateOption('style', cliStyle, VALID_STYLES);
  }

  const isInteractive =
    (process.stdin.isTTY && process.stdout.isTTY && !args.includes('-y') && !args.includes('--yes')) ||
    args.includes('--interactive') ||
    args.includes('-i') ||
    process.env.AVENX_FORCE_INTERACTIVE === 'true';

  let stylePreprocessor = cliStyle || 'none';
  let layoutTemplate = cliLayout || 'blank';

  if (isInteractive) {
    const needsStylePrompt = !cliStyle;
    const needsLayoutPrompt = !cliLayout;
    const needsPrompt = needsStylePrompt || needsLayoutPrompt;
    const promptSession = needsPrompt ? createPromptSession() : null;

    if (needsPrompt) {
      console.log(`\n${bold(cyan('--- Avenx-JS Project Wizard ---'))}\n`);
    }

    try {
      // Only ask about the CSS preprocessor if the --style flag was not provided.
      if (needsStylePrompt) {
        const preprocessorInput = await promptQuestion(
          'Select style preprocessor:\n' +
            '  1. None (Vanilla CSS)\n' +
            '  2. Sass (SCSS)\n' +
            '  3. Less\n' +
            '  4. PostCSS\n' +
            'Choose an option (1-4, default: 1): ',
          '1',
          (val) => (['1', '2', '3', '4'].includes(val) ? true : 'Please enter a number between 1 and 4'),
          promptSession,
        );

        const mapping = {
          1: 'none',
          2: 'sass',
          3: 'less',
          4: 'postcss',
        };
        stylePreprocessor = mapping[preprocessorInput];
      }

      // Only ask about the layout if the --layout flag was NOT provided.
      if (needsLayoutPrompt) {
        const layoutInput = await promptQuestion(
          'Select layout template:\n' +
            '  1. Blank (Minimal setup)\n' +
            '  2. Routing (Basic navigation with Navbar, Home and About pages)\n' +
            'Choose an option (1-2, default: 1): ',
          '1',
          (val) => (['1', '2'].includes(val) ? true : 'Please enter 1 or 2'),
          promptSession,
        );
        layoutTemplate = layoutInput === '2' ? 'routing' : 'blank';
      }
    } finally {
      promptSession?.close();
    }
  }

  return { stylePreprocessor, layoutTemplate, isInteractive };
}