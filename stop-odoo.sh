#!/bin/bash
# Purpose: Gracefully stop Odoo containers

# Log file path
LOG_FILE="$HOME/odoo-shutdown.log"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
}

log "Starting Odoo shutdown process..."

# Check if containers are running
if [ "$(docker ps -q -f name=web)" == "" ]; then
    log "Odoo container is not running. Nothing to stop."
    exit 0
fi

# Gracefully stop containers
log "Stopping Docker containers..."
cd $HOME
docker-compose down

if [ $? -eq 0 ]; then
    log "Docker containers stopped successfully"
else
    log "WARNING: There was an issue stopping Docker containers"
    
    # Force stop if necessary (last resort)
    docker-compose down --volumes
fi

log "Shutdown process completed"
