// Sampled from waveshare-146.yaml — used to populate the simulator UI mocks with realistic content.

const PAGES = [
  { idx: 0,  id: "splash_page",            title: "Splash",              group: "root"     },
  { idx: 1,  id: "power_hub",              title: "Power Hub",           group: "hub"      },
  { idx: 2,  id: "system_hub",             title: "System Hub",          group: "hub"      },
  { idx: 3,  id: "settings_hub",           title: "Settings Hub",        group: "hub"      },
  { idx: 4,  id: "battery_page",           title: "Battery",             group: "power"    },
  { idx: 5,  id: "solar_page",             title: "Solar",               group: "power"    },
  { idx: 6,  id: "charger_page",           title: "Charger",             group: "power"    },
  { idx: 7,  id: "wifi_page",              title: "WiFi",                group: "system"   },
  { idx: 8,  id: "temp_page",              title: "Temperature",         group: "system"   },
  { idx: 9,  id: "device_info_page",       title: "Device Info",         group: "system"   },
  { idx: 10, id: "network_test_page",      title: "Network Test",        group: "system"   },
  { idx: 11, id: "ble_page",               title: "BLE Devices",         group: "system"   },
  { idx: 12, id: "reboot_page",            title: "Reboot",              group: "system"   },
  { idx: 13, id: "sound_page",             title: "Sound Test",          group: "system"   },
  { idx: 14, id: "settings_page",          title: "Settings",            group: "settings" },
  { idx: 15, id: "flow_page",              title: "Power Flow",          group: "power"    },
  { idx: 16, id: "temp_hub_page",          title: "Temperature Hub",     group: "hub"      },
  { idx: 17, id: "van_temp_page",          title: "Van Temperature",     group: "temp"     },
  { idx: 18, id: "outside_temp_page",      title: "Outside Temperature", group: "temp"     },
  { idx: 19, id: "fridge_temp_page",       title: "Fridge Temperature",  group: "temp"     },
  { idx: 20, id: "energy_hub_page",        title: "Victron Hub",         group: "hub"      },
  { idx: 21, id: "solar_hub_page",         title: "Solar Hub",           group: "hub"      },
  { idx: 22, id: "shunt_hub_page",         title: "Shunt Hub",           group: "hub"      },
  { idx: 23, id: "mains_hub_page",         title: "Mains Hub",           group: "hub"      },
  { idx: 24, id: "solar_live_page",        title: "Solar Live",          group: "solar"    },
  { idx: 25, id: "solar_today_page",       title: "Solar Today",         group: "solar"    },
  { idx: 26, id: "solar_status_page",      title: "Solar Status",        group: "solar"    },
  { idx: 27, id: "battery_live_page",      title: "Battery Live",        group: "shunt"    },
  { idx: 28, id: "battery_detail_page",    title: "Battery Detail",      group: "shunt"    },
  { idx: 29, id: "battery_history_page",   title: "Battery History",     group: "shunt"    },
  { idx: 30, id: "mains_live_page",        title: "Mains Live",          group: "mains"    },
  { idx: 31, id: "mains_status_page",      title: "Mains Status",        group: "mains"    },
  { idx: 32, id: "mains_history_page",     title: "Mains History",       group: "mains"    },
  { idx: 33, id: "bat_alarm_settings_page",title: "Battery Alarm",       group: "settings" },
  { idx: 34, id: "energy_balance_page",    title: "Energy Balance",      group: "energy"   },
  { idx: 35, id: "brightness_page",        title: "Brightness",          group: "settings" },
];

const GROUP_COLORS = {
  root:     "#6b7280",
  hub:      "#9ca3af",
  power:    "#FFCC00",
  system:   "#00AAFF",
  settings: "#AAAAAA",
  temp:     "#FF6644",
  solar:    "#FFCC00",
  shunt:    "#00CC66",
  mains:    "#00CCCC",
  energy:   "#FFAA33",
};

// Widget tree for currently-selected page (Battery page, idx 4).
const BATTERY_TREE = [
  { id: "battery_arc",         type: "arc",    icon: "◯", depth: 0, label: "battery_arc" },
  { id: "_lbl_icon",            type: "label",  icon: "T", depth: 0, label: 'icon "\\uF0079"' },
  { id: "battery_value_label", type: "label",  icon: "T", depth: 0, label: 'value "-- %"', selected: true },
  { id: "_lbl_title",           type: "label",  icon: "T", depth: 0, label: '"Battery SOC"' },
];

// Top-layer (global) widgets — present across all pages.
const TOP_LAYER_TREE = [
  { id: "dots_container",     type: "obj",    icon: "▣", depth: 0, label: "dots_container (page indicator)" },
  { id: "ping_popup",         type: "obj",    icon: "▣", depth: 0, label: "ping_popup", hidden: true },
  { id: "dns_popup",          type: "obj",    icon: "▣", depth: 0, label: "dns_popup", hidden: true },
  { id: "temp_minmax_popup",  type: "obj",    icon: "▣", depth: 0, label: "temp_minmax_popup", hidden: true },
  { id: "bat_alarm_popup",    type: "obj",    icon: "▣", depth: 0, label: "bat_alarm_popup", hidden: true },
  { id: "clock_screensaver",  type: "obj",    icon: "▣", depth: 0, label: "clock_screensaver", hidden: true },
];

// Inspector fields for battery_value_label (the selected widget).
const BATTERY_LABEL_INSPECTOR = [
  { section: "Position",  fields: [
    { k: "align",   v: "CENTER" },
    { k: "x",       v: "0" },
    { k: "y",       v: "15" },
  ]},
  { section: "Text",      fields: [
    { k: "text",       v: "78 %", driven: true },
    { k: "text_font",  v: "roboto48" },
    { k: "text_color", v: "0xFFFFFF", swatch: "#FFFFFF" },
  ]},
  { section: "Bound to",  fields: [
    { k: "lambda", v: "lv_label_set_text(battery_value_label, …)" },
    { k: "source", v: "shunt_soc · 30s update" },
  ]},
];

// Globals (subset, with current values).
const GLOBALS = [
  { id: "dim_timeout_sec",       v: 30,  type: "int",  label: "Dim after",        unit: "sec",  options: [0, 15, 30, 60, 120] },
  { id: "off_timeout_sec",       v: 60,  type: "int",  label: "Off after",        unit: "sec",  options: [0, 30, 60, 120, 300] },
  { id: "bat_alarm_threshold",   v: 20,  type: "int",  label: "Battery alarm",    unit: "%",    options: [0, 10, 15, 20, 25, 30, 96, 97, 98] },
  { id: "screensaver_mode",      v: 1,   type: "enum", label: "Screensaver",                    options: ["Off", "Clock", "Flow"] },
  { id: "screen_brightness_pct", v: 100, type: "int",  label: "Screen bright",    unit: "%",    range: [10, 100] },
  { id: "saver_brightness_pct",  v: 10,  type: "int",  label: "Saver bright",     unit: "%",    range: [0, 100] },
  { id: "auto_night_mode",       v: 0,   type: "bool", label: "Night mode" },
];

// Mock sensor inputs (drive panel).
const SENSORS = [
  { id: "shunt_soc",       v: 78,    unit: "%",   label: "Battery SOC",   range: [0, 100],  color: "#00CC66" },
  { id: "shunt_voltage",   v: 13.2,  unit: "V",   label: "Battery V",     range: [10, 15],  color: "#00CC66", step: 0.1 },
  { id: "shunt_current",   v: -4.2,  unit: "A",   label: "Battery I",     range: [-50, 50], color: "#00CC66", step: 0.1 },
  { id: "solar_power",     v: 184,   unit: "W",   label: "Solar power",   range: [0, 500],  color: "#FFCC00" },
  { id: "charger_power",   v: 0,     unit: "W",   label: "Charger power", range: [0, 500],  color: "#00CCCC" },
  { id: "wifi_dbm",        v: -54,   unit: "dBm", label: "WiFi signal",   range: [-90, -30],color: "#00AAFF" },
  { id: "cpu_temp",        v: 48,    unit: "°C",  label: "CPU temp",      range: [20, 90],  color: "#FF6600" },
  { id: "van_temp",        v: 21.4,  unit: "°C",  label: "Van temp",      range: [-10, 40], color: "#00FF88", step: 0.1 },
  { id: "outside_temp",    v: 8.2,   unit: "°C",  label: "Outside temp",  range: [-20, 40], color: "#44AADD", step: 0.1 },
  { id: "fridge_temp",     v: 4.1,   unit: "°C",  label: "Fridge temp",   range: [-5, 15],  color: "#6699AA", step: 0.1 },
  { id: "mains_power",     v: 0,     unit: "W",   label: "Mains power",   range: [0, 3000], color: "#00CCCC" },
];

// Sample YAML excerpt — battery_page only — formatted for the YAML pane.
const YAML_SAMPLE = `# === Page 4: Battery (Power sub) ===
- id: battery_page
  bg_color: 0x000000
  on_load:
    - lambda: |-
        lv_obj_clear_flag(id(dots_container), …);
        lv_obj_set_width(id(dots_container), 46);
  on_swipe_left:
    - lambda: |-
        id(lvgl_comp)->show_page(5, MOVE_LEFT, 200);
  on_swipe_right:
    - lambda: |-
        id(lvgl_comp)->show_page(15, MOVE_RIGHT, 200);
  widgets:
    - arc:
        id: battery_arc
        align: CENTER
        y: -10
        width: 260
        height: 260
        min_value: 0
        max_value: 100
        value: 0
        start_angle: 135
        end_angle: 45
        arc_width: 14
        arc_color: 0x333333
        arc_rounded: true
        indicator:
          arc_color: 0x00CC66
          arc_width: 14
    - label:
        align: CENTER
        y: -40
        text: "\\uF0079"
        text_font: mdi48
        text_color: 0x00CC66
    - label:
        id: battery_value_label
        align: CENTER
        y: 15
        text: "-- %"
        text_font: roboto48
        text_color: 0xFFFFFF
    - label:
        align: BOTTOM_MID
        y: -50
        text: "Battery SOC"
        text_font: roboto32
        text_color: 0x666666`;

// Shared top-layer YAML — popups + page-indicator dots, present across all pages.
const YAML_TOP_LAYER = `# === top_layer (shared across all 36 pages) ===
top_layer:
  widgets:
    - obj:
        id: dots_container
        align: BOTTOM_MID
        y: -8
        layout:
          type: flex
          flex_align_main: center
        # page-indicator dots, rebuilt on_load per page
    - obj:
        id: ping_popup
        hidden: true
        align: CENTER
        width: 320
        height: 160
        bg_color: 0x111111
        widgets:
          - label:
              text: "Pinging gateway…"
              align: CENTER
    - obj:
        id: bat_alarm_popup
        hidden: true
        align: CENTER
        bg_color: 0x2A0000
        widgets:
          - label:
              text: "LOW BATTERY"
              text_color: 0xFF4444
    - obj:
        id: clock_screensaver
        hidden: true
        bg_color: 0x000000`;

// Shared globals YAML — values the simulator can drive, defined once.
const YAML_GLOBALS = `# === globals (shared) ===
globals:
  - id: dim_timeout_sec
    type: int
    initial_value: "30"
  - id: off_timeout_sec
    type: int
    initial_value: "60"
  - id: bat_alarm_threshold
    type: int
    initial_value: "20"
  - id: screensaver_mode
    type: int       # 0=Off 1=Clock 2=Flow
    initial_value: "1"
  - id: screen_brightness_pct
    type: int
    initial_value: "100"
  - id: saver_brightness_pct
    type: int
    initial_value: "10"
  - id: auto_night_mode
    type: bool
    initial_value: "false"`;

// Swipe map: shows how the active page connects to neighbours.
const SWIPE_MAP = {
  // for battery_page (idx 4)
  left:  { idx: 5,  title: "Solar" },
  right: { idx: 15, title: "Power Flow" },
  up:    { idx: 15, title: "Power Flow" },
  down:  null,
};

Object.assign(window, {
  PAGES, GROUP_COLORS,
  BATTERY_TREE, TOP_LAYER_TREE,
  BATTERY_LABEL_INSPECTOR, GLOBALS, SENSORS,
  YAML_SAMPLE, YAML_TOP_LAYER, YAML_GLOBALS, SWIPE_MAP,
});
