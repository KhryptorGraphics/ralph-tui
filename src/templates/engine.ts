/**
 * ABOUTME: Template engine for prompt rendering using Handlebars.
 * Handles loading templates (custom or built-in) and rendering with task context.
 */

import Handlebars from 'handlebars';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { TrackerTask } from '../plugins/trackers/types.js';
import type { RalphConfig } from '../config/types.js';
import type {
  TemplateVariables,
  TemplateContext,
  TemplateLoadResult,
  TemplateRenderResult,
  BuiltinTemplateType,
} from './types.js';
import {
  DEFAULT_TEMPLATE,
  BEADS_TEMPLATE,
  BEADS_BV_TEMPLATE,
  JSON_TEMPLATE,
} from './builtin.js';
import { PROMPT_JSON, PROMPT_BEADS } from './prompts.js';

/**
 * Cache for compiled templates to avoid recompilation
 */
const templateCache = new Map<string, Handlebars.TemplateDelegate>();

/**
 * Get the built-in template content for a tracker type.
 * @param trackerType The tracker type (plugin name)
 * @returns The template content
 */
export function getBuiltinTemplate(trackerType: BuiltinTemplateType): string {
  switch (trackerType) {
    case 'beads':
      return BEADS_TEMPLATE;
    case 'beads-bv':
      return BEADS_BV_TEMPLATE;
    case 'json':
      return JSON_TEMPLATE;
    case 'default':
    default:
      return DEFAULT_TEMPLATE;
  }
}

/**
 * Get the built-in template type from a tracker plugin name.
 * @param pluginName The tracker plugin name
 * @returns The matching built-in template type
 */
export function getTemplateTypeFromPlugin(pluginName: string): BuiltinTemplateType {
  if (pluginName.includes('beads-bv')) {
    return 'beads-bv';
  }
  if (pluginName.includes('beads')) {
    return 'beads';
  }
  if (pluginName.includes('json')) {
    return 'json';
  }
  return 'default';
}

/**
 * Get the user config directory path for ralph-tui.
 * @returns Path to ~/.config/ralph-tui/
 */
export function getUserConfigDir(): string {
  return path.join(homedir(), '.config', 'ralph-tui');
}

/**
 * Get the default prompt filename for a tracker type.
 * @param trackerType The tracker type
 * @returns The default prompt filename
 */
export function getDefaultPromptFilename(trackerType: BuiltinTemplateType): string {
  switch (trackerType) {
    case 'beads':
    case 'beads-bv':
      return 'prompt-beads.md';
    case 'json':
    default:
      return 'prompt.md';
  }
}

/**
 * Get the path to the default user prompt file for a tracker type.
 * @param trackerType The tracker type
 * @returns Full path to the user prompt file in config directory
 */
export function getUserPromptPath(trackerType: BuiltinTemplateType): string {
  return path.join(getUserConfigDir(), getDefaultPromptFilename(trackerType));
}

/**
 * Load a template from a custom path or fall back to user config, tracker, or built-in.
 *
 * Resolution order:
 * 1. customPath (explicit --prompt argument or config file prompt_template)
 * 2. ~/.config/ralph-tui/{mode-specific}.md (user config directory)
 * 3. trackerTemplate (from tracker plugin's getTemplate())
 * 4. Built-in template (bundled default - fallback for backward compatibility)
 *
 * @param customPath Optional path to custom template
 * @param trackerType Tracker type for user config and built-in template fallback
 * @param cwd Working directory for relative path resolution
 * @param trackerTemplate Optional template content from the tracker plugin
 * @returns The template load result
 */
export function loadTemplate(
  customPath: string | undefined,
  trackerType: BuiltinTemplateType,
  cwd: string,
  trackerTemplate?: string
): TemplateLoadResult {
  // 1. Try explicit custom template first (from --prompt or config)
  if (customPath) {
    const resolvedPath = path.isAbsolute(customPath)
      ? customPath
      : path.resolve(cwd, customPath);

    try {
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        return {
          success: true,
          content,
          source: resolvedPath,
        };
      } else {
        return {
          success: false,
          source: resolvedPath,
          error: `Template file not found: ${resolvedPath}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        source: resolvedPath,
        error: `Failed to read template: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // 2. Try user config directory prompt file
  const userPromptPath = getUserPromptPath(trackerType);
  try {
    if (fs.existsSync(userPromptPath)) {
      const content = fs.readFileSync(userPromptPath, 'utf-8');
      return {
        success: true,
        content,
        source: userPromptPath,
      };
    }
  } catch {
    // Silently fall through to tracker or built-in template
  }

  // 3. Use tracker-provided template (from plugin's getTemplate())
  if (trackerTemplate) {
    return {
      success: true,
      content: trackerTemplate,
      source: `tracker:${trackerType}`,
    };
  }

  // 4. Fallback to built-in template (for backward compatibility)
  const content = getBuiltinTemplate(trackerType);
  return {
    success: true,
    content,
    source: `builtin:${trackerType}`,
  };
}

/**
 * Extract acceptance criteria from a description.
 * Looks for markdown patterns like "## Acceptance Criteria" or checklist items.
 * @param description The full task description
 * @returns Extracted acceptance criteria or empty string
 */
function extractAcceptanceCriteria(description: string | undefined): string {
  if (!description) return '';

  // Look for explicit "Acceptance Criteria" section
  const acMatch = description.match(/##\s*Acceptance\s*Criteria[\s\S]*?(?=##|$)/i);
  if (acMatch) {
    return acMatch[0].replace(/##\s*Acceptance\s*Criteria\s*/i, '').trim();
  }

  // Look for checklist patterns
  const checklistLines = description.split('\n').filter(
    (line) => /^[-*]\s*\[[\sx]\]/.test(line.trim())
  );
  if (checklistLines.length > 0) {
    return checklistLines.join('\n');
  }

  return '';
}

/**
 * Get acceptance criteria from task metadata or extract from description.
 * JSON tracker stores criteria in metadata.acceptanceCriteria as an array.
 * Beads tracker embeds criteria in the description text.
 * @param task The task to extract criteria from
 * @returns Formatted acceptance criteria string
 */
function getAcceptanceCriteria(task: TrackerTask): string {
  // First check metadata (used by JSON tracker)
  const metaCriteria = task.metadata?.acceptanceCriteria;
  if (Array.isArray(metaCriteria) && metaCriteria.length > 0) {
    // Format array as checklist
    return metaCriteria
      .filter((c): c is string => typeof c === 'string')
      .map((c) => `- [ ] ${c}`)
      .join('\n');
  }

  // Fall back to extracting from description (used by Beads tracker)
  return extractAcceptanceCriteria(task.description);
}

/**
 * Extended context for building template variables.
 * Includes PRD information, patterns, and selection context.
 */
export interface ExtendedTemplateContext {
  /** Recent progress summary from previous iterations */
  recentProgress?: string;

  /** Codebase patterns from progress.md */
  codebasePatterns?: string;

  /** PRD context for full project visibility */
  prd?: {
    name: string;
    description?: string;
    content: string; // The source PRD markdown (full context for agent to study)
    completedCount: number;
    totalCount: number;
  };

  /** Selection reason (for beads-bv tracker) */
  selectionReason?: string;
}

/**
 * Build template variables from task and config.
 * @param task The current task
 * @param config The ralph configuration
 * @param epic Optional epic information
 * @param extended Extended context including progress, patterns, PRD data
 * @returns The flattened template variables
 */
export function buildTemplateVariables(
  task: TrackerTask,
  config: Partial<RalphConfig>,
  epic?: { id: string; title: string; description?: string },
  extended?: string | ExtendedTemplateContext
): TemplateVariables {
  // Handle backward compatibility: if extended is a string, it's recentProgress
  let recentProgress = '';
  let codebasePatterns = '';
  let prdName = '';
  let prdDescription = '';
  let prdContent = '';
  let prdCompletedCount = '0';
  let prdTotalCount = '0';
  let selectionReason = '';

  if (typeof extended === 'string') {
    recentProgress = extended;
  } else if (extended) {
    recentProgress = extended.recentProgress ?? '';
    codebasePatterns = extended.codebasePatterns ?? '';
    selectionReason = extended.selectionReason ?? '';

    if (extended.prd) {
      prdName = extended.prd.name;
      prdDescription = extended.prd.description ?? '';
      prdContent = extended.prd.content;
      prdCompletedCount = String(extended.prd.completedCount);
      prdTotalCount = String(extended.prd.totalCount);
    }
  }

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description ?? '',
    acceptanceCriteria: getAcceptanceCriteria(task),
    epicId: epic?.id ?? task.parentId ?? '',
    epicTitle: epic?.title ?? '',
    trackerName: config.tracker?.plugin ?? 'unknown',
    labels: task.labels?.join(', ') ?? '',
    priority: String(task.priority ?? 2),
    status: task.status,
    dependsOn: task.dependsOn?.join(', ') ?? '',
    blocks: task.blocks?.join(', ') ?? '',
    type: task.type ?? '',
    model: config.model ?? '',
    agentName: config.agent?.plugin ?? 'unknown',
    cwd: config.cwd ?? process.cwd(),
    currentDate: new Date().toISOString().split('T')[0],
    currentTimestamp: new Date().toISOString(),
    notes: (task.metadata?.notes as string) ?? '',
    recentProgress,
    beadsDbPath: computeBeadsDbPath(config),
    // New PRD context variables
    prdName,
    prdDescription,
    prdContent,
    prdCompletedCount,
    prdTotalCount,
    // New patterns variable
    codebasePatterns,
    // New selection context variable
    selectionReason,
  };
}

/**
 * Compute the full path to the beads database file.
 * Used for the --db flag when running bd commands from external directories.
 */
function computeBeadsDbPath(config: Partial<RalphConfig>): string {
  const trackerOptions = config.tracker?.options as Record<string, unknown> | undefined;
  const workingDir = (trackerOptions?.workingDir as string) ?? config.cwd ?? process.cwd();
  const beadsDir = (trackerOptions?.beadsDir as string) ?? '.beads';
  return path.join(workingDir, beadsDir, 'beads.db');
}

/**
 * Build full template context for rendering.
 * @param task The current task
 * @param config The ralph configuration
 * @param epic Optional epic information
 * @param extended Extended context with progress, patterns, PRD data - or just a progress string
 * @returns The template context
 */
export function buildTemplateContext(
  task: TrackerTask,
  config: Partial<RalphConfig>,
  epic?: { id: string; title: string; description?: string },
  extended?: string | ExtendedTemplateContext
): TemplateContext {
  return {
    vars: buildTemplateVariables(task, config, epic, extended),
    task,
    config,
    epic,
  };
}

/**
 * Compile a template (with caching).
 * @param templateContent The template source
 * @param source The template source identifier for caching
 * @returns The compiled template function
 */
function compileTemplate(
  templateContent: string,
  source: string
): Handlebars.TemplateDelegate {
  // Check cache
  const cached = templateCache.get(source);
  if (cached) {
    return cached;
  }

  // Compile and cache
  const compiled = Handlebars.compile(templateContent, {
    noEscape: true, // Don't escape HTML entities in output
    strict: false, // Don't throw on missing variables
  });
  templateCache.set(source, compiled);
  return compiled;
}

/**
 * Render a prompt from a template and task context.
 * @param task The current task
 * @param config The ralph configuration
 * @param epic Optional epic information
 * @param extended Extended context with progress, patterns, PRD data - or just a progress string for backward compat
 * @param trackerTemplate Optional template from the tracker plugin's getTemplate()
 * @returns The render result with the prompt or error
 */
export function renderPrompt(
  task: TrackerTask,
  config: RalphConfig,
  epic?: { id: string; title: string; description?: string },
  extended?: string | ExtendedTemplateContext,
  trackerTemplate?: string
): TemplateRenderResult {
  // Determine template to use
  const trackerType = getTemplateTypeFromPlugin(config.tracker.plugin);
  const customPath = config.promptTemplate;

  // Load the template (uses tracker template if no custom/user config override)
  const loadResult = loadTemplate(customPath, trackerType, config.cwd, trackerTemplate);
  if (!loadResult.success || !loadResult.content) {
    return {
      success: false,
      error: loadResult.error ?? 'Failed to load template',
      source: loadResult.source,
    };
  }

  // Build context
  const context = buildTemplateContext(task, config, epic, extended);

  // Create a flat context for Handlebars (variables at top level)
  const flatContext = {
    ...context.vars,
    task: context.task,
    config: context.config,
    epic: context.epic,
  };

  try {
    // Compile and render
    const template = compileTemplate(loadResult.content, loadResult.source);
    const prompt = template(flatContext);

    return {
      success: true,
      prompt: prompt.trim(),
      source: loadResult.source,
    };
  } catch (error) {
    return {
      success: false,
      error: `Template rendering failed: ${error instanceof Error ? error.message : String(error)}`,
      source: loadResult.source,
    };
  }
}

/**
 * Clear the template cache (useful for testing or when templates change).
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

/**
 * Get the path where a custom template should be written for initialization.
 * @param cwd The working directory
 * @param filename Optional custom filename (default: 'ralph-prompt.hbs')
 * @returns The full path for the custom template
 */
export function getCustomTemplatePath(cwd: string, filename = 'ralph-prompt.hbs'): string {
  return path.join(cwd, filename);
}

/**
 * Copy a built-in template to a custom location for customization.
 * @param trackerType The built-in template type to copy
 * @param destPath The destination path
 * @returns Success status and any error message
 */
export function copyBuiltinTemplate(
  trackerType: BuiltinTemplateType,
  destPath: string
): { success: boolean; error?: string } {
  try {
    const content = getBuiltinTemplate(trackerType);

    // Ensure directory exists
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write template
    fs.writeFileSync(destPath, content, 'utf-8');

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to copy template: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get the bundled prompt content for a tracker type.
 * These are the markdown instruction files (not Handlebars templates).
 * @param trackerType The tracker type
 * @returns The prompt content
 */
export function getBundledPrompt(trackerType: BuiltinTemplateType): string {
  switch (trackerType) {
    case 'beads':
    case 'beads-bv':
      return PROMPT_BEADS;
    case 'json':
    default:
      return PROMPT_JSON;
  }
}

/**
 * Initialize user config directory with default prompt files.
 * Creates ~/.config/ralph-tui/ and copies prompt.md and prompt-beads.md.
 * @param force Overwrite existing files
 * @returns Results for each file
 */
export function initializeUserPrompts(force = false): {
  success: boolean;
  results: Array<{ file: string; created: boolean; skipped: boolean; error?: string }>;
} {
  const configDir = getUserConfigDir();
  const results: Array<{ file: string; created: boolean; skipped: boolean; error?: string }> = [];

  // Ensure config directory exists
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  } catch (error) {
    return {
      success: false,
      results: [{
        file: configDir,
        created: false,
        skipped: false,
        error: `Failed to create config directory: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }

  // Files to create
  const promptFiles = [
    { filename: 'prompt.md', content: PROMPT_JSON },
    { filename: 'prompt-beads.md', content: PROMPT_BEADS },
  ];

  for (const { filename, content } of promptFiles) {
    const filePath = path.join(configDir, filename);

    try {
      if (fs.existsSync(filePath) && !force) {
        results.push({ file: filename, created: false, skipped: true });
        continue;
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      results.push({ file: filename, created: true, skipped: false });
    } catch (error) {
      results.push({
        file: filename,
        created: false,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const success = results.every((r) => r.created || r.skipped);
  return { success, results };
}
