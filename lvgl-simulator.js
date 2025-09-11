class ESPHomeLVGLSimulator {
    constructor() {
        this.config = null;
        this.displayElement = document.getElementById('lvglDisplay');
        this.yamlEditor = document.getElementById('yamlEditor');
        
        this.init();
        this.loadExampleConfig();
    }

    init() {
        document.getElementById('renderPreview').addEventListener('click', () => {
            this.renderFromEditor();
        });

        document.getElementById('loadExample').addEventListener('click', () => {
            this.loadExampleConfig();
        });

        document.getElementById('loadConfig').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.yaml,.yml';
            input.onchange = (e) => this.loadConfigFile(e.target.files[0]);
            input.click();
        });
    }

    async loadConfigFile(file) {
        try {
            const text = await file.text();
            this.yamlEditor.value = text;
            this.renderFromEditor();
        } catch (error) {
            console.error('Error loading config file:', error);
            alert('Error loading config file: ' + error.message);
        }
    }

    loadExampleConfig() {
        // Load the example config from the provided file
        fetch('./example_config.yaml')
            .then(response => response.text())
            .then(text => {
                this.yamlEditor.value = text;
                this.renderFromEditor();
            })
            .catch(() => {
                // Fallback to embedded example
                const exampleConfig = `display:
  - platform: rpi_dpi_rgb
    dimensions:
      width: 800
      height: 480

lvgl:
  color_depth: 16
  text_font: montserrat_20
  align: center
  pages:
    - id: main_page
      widgets:
        - obj:
            align: CENTER
            width: 100%
            height: 100%
            pad_all: 0
            bg_opa: TRANSP
            border_opa: TRANSP
            scrollable: false
            layout:
              type: FLEX
              flex_flow: COLUMN
              flex_align_main: CENTER
              flex_align_cross: CENTER
              pad_row: 10
            widgets:
              - obj:
                  width: 100%
                  height: 60
                  bg_opa: TRANSP
                  border_opa: TRANSP
                  layout:
                    type: FLEX
                    flex_flow: ROW
                    flex_align_main: SPACE_BETWEEN
                    flex_align_cross: CENTER
                  widgets:
                    - label:
                        text: "N"
                        text_color: 0x00FF88
                    - label:
                        text: "READY"
                        text_color: 0x00FF88
                    - label:
                        text: "50.1V"
                        text_color: 0xFFFFFF
              - obj:
                  width: 500
                  height: 300
                  bg_color: 0x1A1A2E
                  border_width: 3
                  border_color: 0x4DA6FF
                  radius: 15
                  align: CENTER
                  widgets:
                    - label:
                        align: CENTER
                        y: -60
                        text: "0.0"
                        text_color: 0x4DA6FF
                        text_align: CENTER
                    - label:
                        align: CENTER
                        y: -10
                        text: "mph"
                        text_color: 0x888888
`;
                this.yamlEditor.value = exampleConfig;
                this.renderFromEditor();
            });
    }

    renderFromEditor() {
        try {
            const yamlText = this.yamlEditor.value;
            this.config = jsyaml.load(yamlText);
            this.render();
        } catch (error) {
            console.error('Error parsing YAML:', error);
            this.displayError('YAML Parse Error: ' + error.message);
        }
    }

    render() {
        if (!this.config || !this.config.lvgl) {
            this.displayError('No LVGL configuration found');
            return;
        }

        try {
            this.clearDisplay();
            this.setupDisplay();
            this.renderPages();
        } catch (error) {
            console.error('Error rendering:', error);
            this.displayError('Render Error: ' + error.message);
        }
    }

    clearDisplay() {
        this.displayElement.innerHTML = '';
    }

    setupDisplay() {
        const display = this.config.display?.[0];
        const lvgl = this.config.lvgl;

        const width = display?.dimensions?.width || 800;
        const height = display?.dimensions?.height || 480;
        const colorDepth = lvgl?.color_depth || 16;

        this.displayElement.style.width = width + 'px';
        this.displayElement.style.height = height + 'px';

        document.getElementById('displaySize').textContent = `${width}x${height}`;
        document.getElementById('colorDepth').textContent = `${colorDepth}-bit`;
    }

    renderPages() {
        const pages = this.config.lvgl.pages || [];
        
        if (pages.length === 0) {
            this.displayError('No pages found in configuration');
            return;
        }

        // Render the first page for now
        const page = pages[0];
        this.renderPage(page);
    }

    renderPage(page) {
        const pageElement = document.createElement('div');
        pageElement.className = 'lvgl-page';
        pageElement.style.position = 'absolute';
        pageElement.style.width = '100%';
        pageElement.style.height = '100%';
        pageElement.style.top = '0';
        pageElement.style.left = '0';

        if (page.widgets) {
            page.widgets.forEach(widget => {
                const widgetElement = this.renderWidget(widget, pageElement);
                if (widgetElement) {
                    pageElement.appendChild(widgetElement);
                }
            });
        }

        this.displayElement.appendChild(pageElement);
    }

    renderWidget(widget, parent) {
        const widgetType = Object.keys(widget)[0];
        const widgetConfig = widget[widgetType];

        switch (widgetType) {
            case 'obj':
                return this.renderObj(widgetConfig, parent);
            case 'label':
                return this.renderLabel(widgetConfig, parent);
            default:
                console.warn(`Unsupported widget type: ${widgetType}`);
                return null;
        }
    }

    renderObj(config, parent) {
        const element = document.createElement('div');
        element.className = 'lvgl-obj';

        this.applyCommonStyles(element, config);
        this.applyLayout(element, config);

        // Render child widgets
        if (config.widgets) {
            config.widgets.forEach(childWidget => {
                const childElement = this.renderWidget(childWidget, element);
                if (childElement) {
                    element.appendChild(childElement);
                }
            });
        }

        return element;
    }

    renderLabel(config, parent) {
        const element = document.createElement('div');
        element.className = 'lvgl-label';

        this.applyCommonStyles(element, config);

        // Set text content
        if (config.text) {
            element.textContent = config.text;
        }

        // Apply text-specific styles
        if (config.text_color) {
            element.style.color = this.parseColor(config.text_color);
        }

        if (config.text_font) {
            element.style.fontSize = this.parseFontSize(config.text_font);
        }

        if (config.text_align) {
            element.style.textAlign = config.text_align.toLowerCase();
        }

        return element;
    }

    applyCommonStyles(element, config) {
        // Position and size
        this.applyPosition(element, config);
        this.applySize(element, config);

        // Background
        if (config.bg_color) {
            // Check for gradient
            if (config.bg_grad_color && config.bg_grad_dir) {
                const direction = this.parseGradientDirection(config.bg_grad_dir);
                const startColor = this.parseColor(config.bg_color);
                const endColor = this.parseColor(config.bg_grad_color);
                element.style.background = `linear-gradient(${direction}, ${startColor}, ${endColor})`;
            } else {
                element.style.backgroundColor = this.parseColor(config.bg_color);
            }
        }

        if (config.bg_opa !== undefined) {
            const opacity = this.parseOpacity(config.bg_opa);
            if (opacity < 1) {
                element.style.backgroundColor = 'transparent';
            }
        }

        // Border
        if (config.border_width && config.border_width > 0) {
            element.style.borderWidth = config.border_width + 'px';
            element.style.borderStyle = 'solid';
            
            if (config.border_color) {
                element.style.borderColor = this.parseColor(config.border_color);
            }
        }

        if (config.border_opa !== undefined) {
            const opacity = this.parseOpacity(config.border_opa);
            if (opacity < 1) {
                element.style.borderColor = 'transparent';
            }
        }

        // Border radius
        if (config.radius !== undefined) {
            element.style.borderRadius = config.radius + 'px';
        }

        // Padding
        if (config.pad_all !== undefined) {
            element.style.padding = config.pad_all + 'px';
        } else {
            if (config.pad_left !== undefined) element.style.paddingLeft = config.pad_left + 'px';
            if (config.pad_right !== undefined) element.style.paddingRight = config.pad_right + 'px';
            if (config.pad_top !== undefined) element.style.paddingTop = config.pad_top + 'px';
            if (config.pad_bottom !== undefined) element.style.paddingBottom = config.pad_bottom + 'px';
        }
    }

    applyPosition(element, config) {
        if (config.align) {
            const align = config.align.toUpperCase();
            
            switch (align) {
                case 'CENTER':
                    element.style.position = 'absolute';
                    element.style.left = '50%';
                    element.style.top = '50%';
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'TOP_LEFT':
                    element.style.position = 'absolute';
                    element.style.left = '0';
                    element.style.top = '0';
                    break;
                case 'TOP_MID':
                    element.style.position = 'absolute';
                    element.style.left = '50%';
                    element.style.top = '0';
                    element.style.transform = 'translateX(-50%)';
                    break;
                case 'TOP_RIGHT':
                    element.style.position = 'absolute';
                    element.style.right = '0';
                    element.style.top = '0';
                    break;
            }
        }

        // Apply x, y offsets (these override align positioning)
        if (config.x !== undefined) {
            if (config.align) {
                // Combine with align - adjust transform
                const currentTransform = element.style.transform || '';
                if (currentTransform.includes('translate')) {
                    element.style.transform = currentTransform.replace(/translateX?\([^)]*\)/, '');
                }
                element.style.left = config.x + 'px';
            } else {
                element.style.position = 'absolute';
                element.style.left = config.x + 'px';
            }
        }
        if (config.y !== undefined) {
            if (config.align) {
                // Combine with align - adjust transform
                const currentTransform = element.style.transform || '';
                if (currentTransform.includes('translate')) {
                    element.style.transform = currentTransform.replace(/translateY?\([^)]*\)/, '');
                }
                element.style.top = config.y + 'px';
            } else {
                element.style.position = 'absolute';
                element.style.top = config.y + 'px';
            }
        }
    }

    applySize(element, config) {
        if (config.width !== undefined) {
            if (typeof config.width === 'string' && config.width.includes('%')) {
                element.style.width = config.width;
            } else {
                element.style.width = config.width + 'px';
            }
        }

        if (config.height !== undefined) {
            if (typeof config.height === 'string' && config.height.includes('%')) {
                element.style.height = config.height;
            } else {
                element.style.height = config.height + 'px';
            }
        }
    }

    applyLayout(element, config) {
        if (!config.layout) return;

        const layout = config.layout;
        
        if (layout.type === 'FLEX') {
            element.classList.add('lvgl-flex');

            // Flex direction
            if (layout.flex_flow) {
                const flow = layout.flex_flow.toLowerCase();
                if (flow.includes('column')) {
                    element.classList.add('column');
                } else {
                    element.classList.add('row');
                }
            }

            // Main axis alignment
            if (layout.flex_align_main) {
                const align = layout.flex_align_main.toLowerCase().replace('_', '-');
                element.classList.add(align + '-main');
            }

            // Cross axis alignment
            if (layout.flex_align_cross) {
                const align = layout.flex_align_cross.toLowerCase().replace('_', '-');
                element.classList.add(align + '-cross');
            }

            // Padding between items
            if (layout.pad_row !== undefined) {
                element.style.gap = layout.pad_row + 'px';
            }
        }
    }

    parseColor(color) {
        if (typeof color === 'number') {
            return '#' + color.toString(16).padStart(6, '0');
        }
        if (typeof color === 'string') {
            if (color.startsWith('0x')) {
                return '#' + color.slice(2);
            }
            return color;
        }
        return '#000000';
    }

    parseOpacity(opacity) {
        if (opacity === 'TRANSP') return 0;
        if (opacity === 'COVER') return 1;
        if (typeof opacity === 'number') {
            return opacity / 255;
        }
        return 1;
    }

    parseGradientDirection(direction) {
        switch (direction.toUpperCase()) {
            case 'HOR':
                return 'to right';
            case 'VER':
                return 'to bottom';
            case 'NONE':
            default:
                return 'to bottom';
        }
    }

    parseFontSize(font) {
        // Extract size from font name like 'montserrat_20' or 'montserrat_140'
        const match = font.match(/_(\d+)$/);
        if (match) {
            const size = parseInt(match[1]);
            // Scale down large fonts for web display
            if (size > 100) {
                return Math.round(size * 0.5) + 'px';
            }
            return size + 'px';
        }
        return '16px'; // default
    }

    displayError(message) {
        this.displayElement.innerHTML = `
            <div class="placeholder" style="color: #ff4444;">
                <p>Error: ${message}</p>
            </div>
        `;
    }
}

// Initialize the simulator when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ESPHomeLVGLSimulator();
});