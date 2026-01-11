/**
 * ABOUTME: Header component for the Ralph TUI.
 * Displays Ralph status, epic/project name, elapsed time, and tracker name.
 */

import type { ReactNode } from 'react';
import { colors, statusIndicators, formatElapsedTime, type RalphStatus } from '../theme.js';
import type { HeaderProps } from '../types.js';

/**
 * Get the status indicator and color for the current Ralph status
 */
function getStatusDisplay(status: RalphStatus): { indicator: string; color: string; label: string } {
  switch (status) {
    case 'ready':
      return { indicator: statusIndicators.ready, color: colors.status.info, label: 'Ready' };
    case 'running':
      return { indicator: statusIndicators.running, color: colors.status.success, label: 'Running' };
    case 'pausing':
      return { indicator: statusIndicators.pausing, color: colors.status.warning, label: 'Pausing...' };
    case 'paused':
      return { indicator: statusIndicators.paused, color: colors.status.warning, label: 'Paused' };
    case 'stopped':
      return { indicator: statusIndicators.stopped, color: colors.fg.muted, label: 'Stopped' };
    case 'complete':
      return { indicator: statusIndicators.complete, color: colors.status.success, label: 'Complete' };
    case 'idle':
      return { indicator: statusIndicators.idle, color: colors.fg.muted, label: 'Idle' };
    case 'error':
      return { indicator: statusIndicators.blocked, color: colors.status.error, label: 'Error' };
  }
}

/**
 * Header component showing Ralph status, epic name, elapsed time, and tracker
 */
export function Header({ status, epicName, elapsedTime, trackerName }: HeaderProps): ReactNode {
  const statusDisplay = getStatusDisplay(status);
  const formattedTime = formatElapsedTime(elapsedTime);

  return (
    <box
      style={{
        width: '100%',
        height: 3,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
        border: true,
        borderColor: colors.border.normal,
      }}
    >
      {/* Left section: Status and Epic Name */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text>
          <span fg={statusDisplay.color}>{statusDisplay.indicator}</span>
          <span fg={colors.fg.primary}> Ralph</span>
        </text>
        <text fg={colors.accent.primary}>{epicName}</text>
      </box>

      {/* Right section: Timer and Tracker */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text fg={colors.fg.secondary}>⏱ {formattedTime}</text>
        <text fg={colors.fg.muted}>[{trackerName}]</text>
      </box>
    </box>
  );
}
