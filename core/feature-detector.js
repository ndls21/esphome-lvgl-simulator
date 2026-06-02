const FEATURE_PATTERNS = [
  { id: 'screensaver',  signals: ['lv_disp_get_inactive_time', 'on_idle', 'lv_disp_trig_activity'] },
  { id: 'gpio',         signals: ['gpio_get_level', 'gpio_set_level', 'gpio_set_direction'] },
  { id: 'audio',        signals: ['rtttl', 'play_rtttl', 'stop_rtttl'] },
  { id: 'sd_card',      signals: ['sd_mmc', 'SDFile', 'fopen', 'fwrite'] },
  { id: 'network',      signals: ['ping', 'http_request', 'dns_resolve', 'WiFi.'] },
  { id: 'ble',          signals: ['ble_client', 'esp_ble', 'BLEDevice'] },
  { id: 'uart',         signals: ['uart_write', 'uart_read_bytes', 'Serial.'] },
];

export function detectFeatures(yamlText) {
  return FEATURE_PATTERNS
    .filter(f => f.signals.some(s => yamlText.includes(s)))
    .map(f => f.id);
}
