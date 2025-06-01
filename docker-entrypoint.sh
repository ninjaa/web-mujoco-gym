#!/bin/bash
set -e

# Function to build mujoco_wasm
build_mujoco_wasm() {
    echo "Building mujoco_wasm..."
    
    # Clone the repository if not exists or is empty
    if [ ! -d "/app/mujoco_wasm" ] || [ -z "$(ls -A /app/mujoco_wasm)" ]; then
        echo "Cloning mujoco_wasm repository..."
        cd /app
        # Remove empty directory if it exists
        [ -d "/app/mujoco_wasm" ] && rmdir /app/mujoco_wasm 2>/dev/null || true
        git clone https://github.com/zalo/mujoco_wasm.git
    fi
    
    cd /app/mujoco_wasm
    
    # Check if src/parse_mjxmacro.py exists
    if [ ! -f "src/parse_mjxmacro.py" ]; then
        echo "Error: src/parse_mjxmacro.py not found. Repository may not have cloned correctly."
        echo "Current directory contents:"
        ls -la
        exit 1
    fi
    
    # Generate bindings
    echo "Generating bindings..."
    python3 src/parse_mjxmacro.py
    
    # Create build directory
    mkdir -p build
    cd build
    
    # Configure with Emscripten
    echo "Configuring with CMake..."
    emcmake cmake ..
    
    # Build
    echo "Building..."
    make -j$(nproc)
    
    echo "Build complete!"
}

# Function to set up and start web server
setup_web_server() {
    echo "Setting up web server..."
    
    # Create nginx config
    cat > /etc/nginx/sites-available/mujoco <<EOF
server {
    listen 8080;
    server_name localhost;
    
    root /app/mujoco_wasm;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ =404;
        add_header Cross-Origin-Embedder-Policy require-corp;
        add_header Cross-Origin-Opener-Policy same-origin;
    }
    
    # Proper MIME types for WASM files
    location ~ \.wasm$ {
        add_header Content-Type application/wasm;
        add_header Cross-Origin-Embedder-Policy require-corp;
        add_header Cross-Origin-Opener-Policy same-origin;
    }
}
EOF
    
    # Enable the site
    ln -sf /etc/nginx/sites-available/mujoco /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Start nginx
    echo "Starting web server on port 8080..."
    nginx -g "daemon off;"
}

# Main entrypoint logic
case "$1" in
    build)
        build_mujoco_wasm
        ;;
    serve)
        setup_web_server
        ;;
    build-and-serve)
        build_mujoco_wasm
        setup_web_server
        ;;
    bash)
        exec /bin/bash
        ;;
    *)
        exec "$@"
        ;;
esac
