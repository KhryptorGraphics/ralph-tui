/**
 * ABOUTME: Desktop notification module for ralph-tui.
 * Provides cross-platform desktop notifications using node-notifier.
 * Notifications are used to alert users when long-running tasks complete.
 */

import notifier from 'node-notifier';

/**
 * Options for sending a desktop notification.
 */
export interface NotificationOptions {
  /** The notification title */
  title: string;
  /** The notification body/message */
  body: string;
  /** Optional path to an icon image */
  icon?: string;
}

/**
 * Sends a desktop notification to the user.
 *
 * This function wraps node-notifier to provide cross-platform desktop
 * notifications. It handles errors gracefully by logging a warning
 * rather than crashing, since notifications are non-critical.
 *
 * @param options - The notification options
 * @param options.title - The notification title
 * @param options.body - The notification body/message
 * @param options.icon - Optional path to an icon image
 */
export function sendNotification(options: NotificationOptions): void {
  const { title, body, icon } = options;

  try {
    notifier.notify(
      {
        title,
        message: body,
        icon,
        sound: false,
      },
      (err: Error | null) => {
        if (err) {
          console.warn(`[notifications] Failed to send notification: ${err.message}`);
        }
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[notifications] Failed to send notification: ${message}`);
  }
}
