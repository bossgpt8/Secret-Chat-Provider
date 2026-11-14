export interface IncomingNotificationSpeechState {
  enabled: boolean;
  streaming: boolean;
  callMode: boolean;
}

/**
 * Call mode must not override the user's notification-read setting.
 */
export function shouldSpeakIncomingNotification({
  enabled,
  streaming,
}: IncomingNotificationSpeechState): boolean {
  return enabled && !streaming;
}
