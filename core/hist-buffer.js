// HistBuffer — JS mock matching D5's C++ HistBuffer struct API
class HistBuffer {
  constructor(slots = 200) {
    this._slots = slots;
    this._data = new Array(slots).fill(NaN);  // NaN = LV_CHART_POINT_NONE
    this._head = 0;
    this._count = 0;
  }

  // Push a new value (oldest falls off)
  push(value) {
    this._data[this._head] = value;
    this._head = (this._head + 1) % this._slots;
    if (this._count < this._slots) this._count++;
  }

  // ordered_value(i): i=0 is oldest, i=count-1 is newest
  ordered_value(i) {
    if (i < 0 || i >= this._count) return NaN;
    // Map i to the actual circular buffer index
    const oldest = (this._head - this._count + this._slots) % this._slots;
    return this._data[(oldest + i) % this._slots];
  }

  // Fill with synthetic data for preview (sine wave + noise)
  fillSynthetic(opts = {}) {
    const { min = 0, max = 100, period = 50, noise = 0.05 } = opts;
    const range = max - min;
    for (let i = 0; i < this._slots; i++) {
      const base = min + range * (0.5 + 0.4 * Math.sin(2 * Math.PI * i / period));
      const n = (Math.random() - 0.5) * 2 * noise * range;
      this._data[i] = base + n;
    }
    this._count = this._slots;
    this._head = 0;
  }

  get count() { return this._count; }

  // Get max of all stored values (ignoring NaN)
  get_max() {
    let max = -Infinity;
    for (let i = 0; i < this._count; i++) {
      const v = this._data[i];
      if (!isNaN(v) && v > max) max = v;
    }
    return max === -Infinity ? NaN : max;
  }

  // Get min of all stored values (ignoring NaN)
  get_min() {
    let min = Infinity;
    for (let i = 0; i < this._count; i++) {
      const v = this._data[i];
      if (!isNaN(v) && v < min) min = v;
    }
    return min === Infinity ? NaN : min;
  }

  // Get count of non-NaN values
  get_count() {
    let n = 0;
    for (let i = 0; i < this._count; i++) {
      if (!isNaN(this._data[i])) n++;
    }
    return n;
  }
}

// HistBufferArray — array of 4 HistBuffer instances (one per resolution)
// Matches D5's: HistBuffer batt_v_hist[HIST_RES_COUNT]
class HistBufferArray {
  constructor(slots = 200, resCount = 4) {
    this._bufs = Array.from({ length: resCount }, () => new HistBuffer(slots));
  }

  // Get buffer for given resolution index
  get(res) { return this._bufs[res] || this._bufs[0]; }

  fillSynthetic(opts) {
    this._bufs.forEach(b => b.fillSynthetic(opts));
  }
}

// Global registry of all HistBuffer arrays
const histBuffers = {};

function getOrCreateHistBuffer(name) {
  if (!histBuffers[name]) {
    histBuffers[name] = new HistBufferArray(200, 4);
  }
  return histBuffers[name];
}

// Pre-populate all known D5 buffer names with synthetic data
const D5_BUFFERS = {
  batt_v_hist:       { min: 120, max: 145, period: 80 },   // voltage ×10, 12.0–14.5V
  batt_i_hist:       { min: -200, max: 200, period: 60 },  // current ×10
  batt_soc_hist:     { min: 20, max: 95, period: 100 },    // SOC %
  solar_pv_hist:     { min: 0, max: 400, period: 50 },     // watts
  solar_charge_hist: { min: 0, max: 150, period: 50 },     // amps ×10
  mains_power_hist:  { min: 0, max: 600, period: 70 },
  mains_current_hist:{ min: 0, max: 200, period: 70 },
  dcdc_in_v_hist:    { min: 115, max: 135, period: 80 },
  dcdc_out_v_hist:   { min: 130, max: 145, period: 80 },
  dcdc_in_a_hist:    { min: 0, max: 100, period: 60 },
  dcdc_out_a_hist:   { min: 0, max: 80, period: 60 },
  dcdc_pwr_hist:     { min: 0, max: 300, period: 60 },
  fridge_hist:       { min: -50, max: 80, period: 120 },   // temp ×10, -5°–8°C
  van_hist:          { min: 150, max: 350, period: 100 },  // 15°–35°C
  outside_hist:      { min: 100, max: 300, period: 100 },
  battery_hist:      { min: 200, max: 400, period: 90 },   // 20°–40°C
};

function initSyntheticHistBuffers() {
  Object.entries(D5_BUFFERS).forEach(([name, opts]) => {
    getOrCreateHistBuffer(name).fillSynthetic(opts);
  });
}

class DailyMinMax {
  constructor(opts = {}) {
    const { min = 0, max = 100, yesterdayOffset = 5 } = opts;
    this._min = min;
    this._max = max;
    this._yOffset = yesterdayOffset;
  }
  get_today_min()      { return this._min; }
  get_today_max()      { return this._max; }
  get_yesterday_min()  { return this._min - this._yOffset; }
  get_yesterday_max()  { return this._max - this._yOffset; }
  // Allow signal generator to update values
  setMin(v) { this._min = v; }
  setMax(v) { this._max = v; }
  // Called by fridge_dmm.record() translation — update live min/max from a new reading
  setMinMax(value) {
    if (isNaN(value)) return;
    if (value < this._min) this._min = value;
    if (value > this._max) this._max = value;
  }
}

// D5 instances (values are ×10 to match D5's integer encoding)
const fridge_dmm   = new DailyMinMax({ min: 30,  max: 70,  yesterdayOffset: 5  }); // 3.0°C–7.0°C
const van_dmm      = new DailyMinMax({ min: 180, max: 310, yesterdayOffset: 15 }); // 18°C–31°C
const outside_dmm  = new DailyMinMax({ min: 120, max: 280, yesterdayOffset: 20 }); // 12°C–28°C
const battery_dmm  = new DailyMinMax({ min: 220, max: 380, yesterdayOffset: 10 }); // 22°C–38°C

if (typeof module !== 'undefined') {
  module.exports = { HistBuffer, HistBufferArray, histBuffers, getOrCreateHistBuffer, initSyntheticHistBuffers, DailyMinMax, fridge_dmm, van_dmm, outside_dmm, battery_dmm };
}
