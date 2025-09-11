# ESPHome LVGL Simulator

A web-based simulator for ESPHome LVGL configurations. This tool allows you to preview your LVGL display layouts in a browser before deploying to actual hardware.

## Features

- **Real-time Preview**: See your LVGL configuration rendered instantly in the browser
- **YAML Editor**: Built-in editor with syntax highlighting for ESPHome LVGL configs
- **Widget Support**: Currently supports `obj` and `label` widgets with styling
- **Layout Support**: Flex layout system with proper alignment and spacing
- **Styling**: Full support for colors, gradients, borders, padding, and fonts
- **Responsive**: Works on desktop and mobile devices

## Supported Widgets

### Objects (`obj`)
- Background colors and gradients
- Borders with customizable width, color, and radius
- Padding and margin control
- Flex layout with alignment options
- Nested widget support

### Labels (`label`)
- Text content and styling
- Font size parsing from ESPHome font names
- Text color and alignment
- Position and size control

## Supported Styles

- **Colors**: Hex colors (0x format and #format)
- **Gradients**: Linear gradients with horizontal/vertical directions
- **Opacity**: TRANSP, COVER, and numeric values
- **Borders**: Width, color, and border radius
- **Padding**: Individual sides or all sides
- **Fonts**: Automatic size extraction from font names

## Supported Layouts

### Flex Layout
- **Direction**: ROW, COLUMN, ROW_REVERSE, COLUMN_REVERSE
- **Main Axis Alignment**: START, END, CENTER, SPACE_BETWEEN, SPACE_AROUND, SPACE_EVENLY
- **Cross Axis Alignment**: START, END, CENTER, STRETCH
- **Gap**: Row and column spacing

## Usage

### Running the Simulator

1. **Simple File Opening**: Double-click `index.html` to open in your browser
2. **HTTP Server** (recommended): Run a local server for better file loading:
   ```bash
   python3 -m http.server 8000
   # Then open http://localhost:8000
   ```

### Using the Interface

1. **Load Configuration**: 
   - Click "Load Example" to see the provided example
   - Click "Load Config" to upload your own YAML file
   - Or paste your YAML directly into the editor

2. **Edit and Preview**:
   - Make changes in the YAML editor
   - Click "Render Preview" to update the display
   - The preview updates in real-time

3. **Display Information**:
   - View current display dimensions in the header
   - Color depth information is shown

## Example Configuration

The simulator comes with an example configuration that demonstrates:
- A dashboard-style layout with speed display
- Multiple nested containers with flex layouts
- Styled labels with different colors and fonts
- Gradient backgrounds and border effects

## Configuration Structure

```yaml
display:
  - platform: rpi_dpi_rgb
    dimensions:
      width: 800
      height: 480

lvgl:
  color_depth: 16
  pages:
    - id: main_page
      widgets:
        - obj:
            # Container properties
            layout:
              type: FLEX
              flex_flow: COLUMN
              flex_align_main: CENTER
            widgets:
              - label:
                  text: "Hello World!"
                  text_color: 0x00FF88
```

## Limitations

- Grid layout not yet implemented
- Limited widget types (only obj and label currently)
- No animation support
- No interaction/event handling
- Simplified font rendering

## Browser Compatibility

- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge
- Mobile browsers supported

## File Structure

```
esphome-lvgl-sim/
├── index.html          # Main HTML interface
├── styles.css          # CSS styling for the simulator
├── lvgl-simulator.js   # Core simulation logic
├── example_config.yaml # Example configuration
└── README.md          # This file
```

## Contributing

This simulator is designed to be extensible. To add new widget types:

1. Add a new case in the `renderWidget()` method
2. Implement the widget-specific rendering logic
3. Add any required CSS classes to `styles.css`

## Troubleshooting

- **YAML Parse Error**: Check your YAML syntax, especially indentation
- **Nothing Displays**: Ensure your configuration has a `lvgl.pages` section
- **File Loading Issues**: Use an HTTP server instead of opening files directly
- **Styling Issues**: Check color format (use 0x prefix for hex values)