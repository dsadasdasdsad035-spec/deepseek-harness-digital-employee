/** Notification settings row copy, keyed for the settings slot locale. */
export const notificationZh = {
  title: '通知渠道',
  hint: '测试发送会向真实渠道投递一条标注 [test] 的消息；凭证值永不显示。',
  sendTest: '发送测试',
  sending: '发送中…',
  sent: '已投递',
  failed: '失败',
}

/** English twin of {@link notificationZh}. */
export const notificationEn = {
  title: 'Notification channels',
  hint: 'A test send delivers one [test]-labeled message to the real channel; credential values are never shown.',
  sendTest: 'Send test',
  sending: 'Sending…',
  sent: 'Delivered',
  failed: 'Failed',
}

/** The settings-row locale keys this package registers. */
export type NotificationSettingsKey = keyof typeof notificationZh
