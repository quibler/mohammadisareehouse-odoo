#!/bin/bash
# Purpose: Start Docker and Odoo containers

# Log file path
LOG_FILE="$HOME/odoo-startup.log"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
}

log "Starting Odoo system..."

# Ensure Docker is running
if ! systemctl is-active --quiet docker; then
    log "Docker service not running. Starting it now..."
    sudo systemctl start docker
    sleep 5
else
    log "Docker service is already running"
fi

# Start containers
log "Starting Odoo containers..."
cd $HOME
docker-compose up -d

log "Odoo startup completed"
