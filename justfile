# List available recipes
default:
    @just --list

# Guard: ensure we are inside the nix develop environment
_require-nix:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${ZEPHYR_SDK_INSTALL_DIR:-}" ]; then
      echo "ERROR: Must run inside nix develop environment"
      echo "Run: nix develop"
      exit 1
    fi

# Initial setup: Initialize west workspace and fetch modules
setup: _require-nix
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -f .west/config ]; then
      echo "Initializing west workspace..."
      west init -l config/
    fi
    echo "Fetching external modules..."
    west update
    echo "Installing Python packages..."
    west zephyr-export
    echo "Setup complete!"

# Build all targets
build: (build-target "dax5_R") (build-target "dax5_L") (build-target "settings_reset")

# Build a specific target (e.g., just build-target dax5_R)
build-target TARGET="dax5_R": _require-nix
    #!/usr/bin/env bash
    set -euo pipefail
    PROJECT_ROOT="$PWD"

    if [ ! -f .west/config ]; then
      echo "ERROR: West workspace not initialized"
      echo "Run: just setup"
      exit 1
    fi

    case "{{TARGET}}" in
      dax5_R)
        SHIELD="dax5_R;rgbled_adapter"
        SNIPPET="studio-rpc-usb-uart"
        ;;
      dax5_L)
        SHIELD="dax5_L;rgbled_adapter"
        SNIPPET=""
        ;;
      settings_reset)
        SHIELD="settings_reset"
        SNIPPET=""
        ;;
      *)
        echo "Error: Unknown target '{{TARGET}}'"
        echo "Usage: just build-target [dax5_R|dax5_L|settings_reset]"
        exit 1
        ;;
    esac

    echo "Building: {{TARGET}}"

    west build -s zmk/app -b seeeduino_xiao_ble -d "build/{{TARGET}}" -- \
      -DBOARD_ROOT="$PROJECT_ROOT" \
      -DSHIELD="$SHIELD" \
      ${SNIPPET:+-DSNIPPET="$SNIPPET"} \
      -DZMK_CONFIG="$PROJECT_ROOT/config" \
      -DZMK_EXTRA_MODULES="$PROJECT_ROOT" \
      -DCMAKE_C_COMPILER_LAUNCHER=ccache \
      -DCMAKE_CXX_COMPILER_LAUNCHER=ccache

    if [ -f "build/{{TARGET}}/zephyr/zmk.uf2" ]; then
      cp "build/{{TARGET}}/zephyr/zmk.uf2" "build/{{TARGET}}.uf2"
      echo "Build complete: build/{{TARGET}}.uf2"
    else
      echo "Build failed: UF2 file not found"
      exit 1
    fi

# Launch the local keymap editor (tools/tester) on http://localhost:5173/
editor:
    #!/usr/bin/env bash
    set -euo pipefail
    cd tools/tester
    if [ ! -d node_modules ]; then
      echo "Installing tester deps (first run)..."
      pnpm install --frozen-lockfile
    fi
    echo "Editor: http://localhost:5173/"
    echo "Tester: http://localhost:5173/tester"
    exec pnpm dev

# Clean build artifacts
clean:
    @echo "Cleaning build artifacts..."
    @rm -rf build/
    @echo "Build artifacts cleaned"

# Complete cleanup including west workspace (for recovery from broken states)
pristine:
    @echo "Performing complete cleanup..."
    @rm -rf build/ .west/ modules/ zephyr/ zmk/ bootloader/ .ccache/
    @echo "Complete cleanup done. Run 'just setup' to reinitialize."
